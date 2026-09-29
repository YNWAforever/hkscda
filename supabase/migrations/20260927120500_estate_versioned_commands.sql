-- Versioned estate commands keep publication independent from content edits.
-- Apply only after catalog/grant/RLS preflight on the target; test with synthetic rows first.
alter table public.dog_friendly_estates
  add column if not exists version integer not null default 1
  constraint dog_friendly_estates_version_positive check (version > 0);

-- Legacy writers use mutate_admin_content_with_audit and do not set version.
-- Bump it here so mixed checkout windows still detect concurrent changes.
create or replace function public.bump_dog_friendly_estate_version()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.version = old.version then
    new.version := old.version + 1;
  elsif new.version <> old.version + 1 then
    raise exception 'Invalid estate version increment' using errcode = 'P4090';
  end if;
  return new;
end;
$$;

revoke all on function public.bump_dog_friendly_estate_version()
  from public, anon, authenticated;

drop trigger if exists bump_dog_friendly_estate_version on public.dog_friendly_estates;
create trigger bump_dog_friendly_estate_version
before update on public.dog_friendly_estates
for each row execute function public.bump_dog_friendly_estate_version();

create or replace function public.mutate_dog_friendly_estate_with_audit(
  p_actor_user_id uuid,
  p_command text,
  p_id uuid,
  p_expected_version integer,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor public.admin_user%rowtype;
  estate public.dog_friendly_estates%rowtype;
  action_name text;
begin
  select * into actor
  from public.admin_user
  where auth_user_id = p_actor_user_id
    and status = 'active'
    and role in ('staff', 'admin');
  if not found then
    raise exception 'Active staff or admin actor required' using errcode = '42501';
  end if;
  if p_id is null or p_payload is null then
    raise exception 'Estate id and payload required' using errcode = '22023';
  end if;

  if p_command = 'create' then
    if p_expected_version is not null or p_payload ? 'is_published' then
      raise exception 'Invalid create command' using errcode = '22023';
    end if;
    insert into public.dog_friendly_estates
      (id, estate_name, district, notes, sort_order, is_published)
    values
      (p_id, p_payload->>'estate_name', p_payload->>'district',
       p_payload->>'notes', (p_payload->>'sort_order')::integer, false)
    on conflict (id) do nothing
    returning * into estate;
    if not found then
      select * into estate from public.dog_friendly_estates where id = p_id for update;
      if estate.version = 1 and not estate.is_published
         and estate.estate_name = p_payload->>'estate_name'
         and estate.district = p_payload->>'district'
         and estate.notes is not distinct from p_payload->>'notes'
         and estate.sort_order = (p_payload->>'sort_order')::integer then
        return to_jsonb(estate);
      end if;
      raise exception 'Estate create identity already used' using errcode = 'P4090';
    end if;
    action_name := 'dog_friendly_estate.create';

  elsif p_command = 'update' then
    if p_expected_version is null or p_expected_version < 1
       or p_payload ? 'is_published' then
      raise exception 'Invalid update command' using errcode = '22023';
    end if;
    update public.dog_friendly_estates set
      estate_name = p_payload->>'estate_name',
      district = p_payload->>'district',
      notes = p_payload->>'notes',
      sort_order = (p_payload->>'sort_order')::integer,
      version = version + 1
    where id = p_id and version = p_expected_version
    returning * into estate;
    if not found then
      if exists (select 1 from public.dog_friendly_estates where id = p_id) then
        raise exception 'Estate version conflict' using errcode = 'P4090';
      end if;
      raise exception 'Dog-friendly estate not found' using errcode = 'P0002';
    end if;
    action_name := 'dog_friendly_estate.update';

  elsif p_command = 'publication' then
    if p_expected_version is null or p_expected_version < 1
       or not (p_payload ? 'is_published')
       or p_payload - 'is_published' <> '{}'::jsonb then
      raise exception 'Invalid publication command' using errcode = '22023';
    end if;
    update public.dog_friendly_estates set
      is_published = (p_payload->>'is_published')::boolean,
      version = version + 1
    where id = p_id and version = p_expected_version
    returning * into estate;
    if not found then
      if exists (select 1 from public.dog_friendly_estates where id = p_id) then
        raise exception 'Estate version conflict' using errcode = 'P4090';
      end if;
      raise exception 'Dog-friendly estate not found' using errcode = 'P0002';
    end if;
    action_name := case when estate.is_published then
      'dog_friendly_estate.publish' else 'dog_friendly_estate.unpublish' end;

  else
    raise exception 'Unsupported estate command' using errcode = '22023';
  end if;

  insert into public.audit_log (actor_user_id, action, entity, entity_id, detail)
  values (p_actor_user_id, action_name, 'dog_friendly_estate', estate.id::text,
          jsonb_build_object('version', estate.version, 'payload', p_payload));
  return to_jsonb(estate);
end;
$$;

revoke all on function public.mutate_dog_friendly_estate_with_audit(uuid, text, uuid, integer, jsonb)
  from public, anon, authenticated;
grant execute on function public.mutate_dog_friendly_estate_with_audit(uuid, text, uuid, integer, jsonb)
  to service_role;
