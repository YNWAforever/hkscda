-- A lost HTTP response must not turn a committed publication into an
-- unrepeatable "preview conflict" for the staff member who submitted it.
create table public.animal_publication_publish_receipt (
  preview_id uuid primary key,
  animal_id uuid not null references public.animals(id),
  actor_id uuid not null references auth.users(id),
  version_id uuid not null unique references public.animal_publication_version(id),
  committed_at timestamptz not null default pg_catalog.clock_timestamp()
);

alter table public.animal_publication_publish_receipt enable row level security;
revoke all on public.animal_publication_publish_receipt from public, anon, authenticated;
grant select, insert on public.animal_publication_publish_receipt to service_role;

create function public.publish_animal_publication_once(
  p_actor uuid,
  p_command jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_result jsonb;
  v_version_id uuid;
begin
  if p_actor is null or p_command->>'kind' is distinct from 'publish' then
    raise exception 'invalid animal publication command' using errcode = '22023';
  end if;

  -- The existing command checks the verified actor, locks the draft, enforces
  -- preview ownership/revision/expiry and inserts the version and audit fact.
  v_result := public.animal_publication_command(p_actor, p_command);
  if v_result->>'kind' = 'published' then
    insert into public.animal_publication_publish_receipt (
      preview_id, animal_id, actor_id, version_id
    ) values (
      (p_command->>'preview_id')::uuid,
      (p_command->>'animal_id')::uuid,
      p_actor,
      (v_result->>'version_id')::uuid
    );
    return v_result;
  end if;

  if v_result->>'kind' in ('conflict', 'not_found') then
    select receipt.version_id into v_version_id
    from public.animal_publication_publish_receipt as receipt
    where receipt.preview_id = (p_command->>'preview_id')::uuid
      and receipt.animal_id = (p_command->>'animal_id')::uuid
      and receipt.actor_id = p_actor;

    if found then
      return pg_catalog.jsonb_build_object(
        'kind', 'published',
        'version_id', v_version_id,
        'replayed', true
      );
    end if;
  end if;
  return v_result;
end;
$$;

revoke all on function public.publish_animal_publication_once(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.publish_animal_publication_once(uuid, jsonb)
  to service_role;
