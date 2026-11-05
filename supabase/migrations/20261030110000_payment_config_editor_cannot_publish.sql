-- BUG-38: the treasurer who prepared a payment-method change must not publish it
-- (docs/superpowers/plans/2026-08-31-payment-public-config.md). Until now
-- publish_payment_public_config refused only the submitter, so treasurer A could edit the FPS
-- details donors pay into, have a staff user submit, and publish the edit themselves.
--
-- edited_by records every admin_user who changed a draft's content. A BEFORE trigger owns the
-- column, so every write path (the mutation RPC, and the authenticated RLS policy on drafts)
-- records its editor and none can clear the list: an insert starts from its creator and an
-- update keeps what was already recorded. Each revision is its own row and a published row
-- never returns to draft, so the list is per revision and needs no reset on publish. It also
-- survives withdraw and return-to-draft, which clear submitted_by and overwrite updated_by:
-- an editor cannot withdraw, let someone else resubmit, and then publish their own edit.

alter table public.payment_public_config
  add column if not exists edited_by uuid[] not null default '{}';

-- Backfill open drafts and in-review rows from their creator and the audited create/update
-- calls (audit_log carries the auth user id). set_updated_at is paused so the backfill does
-- not reorder the admin list.
alter table public.payment_public_config disable trigger set_updated_at;

update public.payment_public_config config
set edited_by = coalesce(
  (
    select array_agg(distinct editor.id order by editor.id)
    from (
      select config.created_by as id
      union
      select admin.id
      from public.audit_log entry
      join public.admin_user admin on admin.auth_user_id = entry.actor_user_id
      where entry.entity = 'payment_public_config'
        and entry.entity_id = config.id::text
        and entry.action in ('payment_public_config.create', 'payment_public_config.update')
    ) editor
    where editor.id is not null
  ),
  '{}'::uuid[]
)
where config.state in ('draft', 'in_review');

alter table public.payment_public_config enable trigger set_updated_at;

create or replace function public.track_payment_public_config_editors()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    new.edited_by := array(
      select distinct editor
      from unnest(array[new.created_by, new.updated_by]) as editor
      where editor is not null
    );
    return new;
  end if;

  new.edited_by := old.edited_by;
  if new.updated_by is not null
    and not (new.updated_by = any(old.edited_by))
    and (
      new.method is distinct from old.method
      or new.is_publicly_visible is distinct from old.is_publicly_visible
      or new.display_label_zh is distinct from old.display_label_zh
      or new.display_label_en is distinct from old.display_label_en
      or new.sort_order is distinct from old.sort_order
      or new.details is distinct from old.details
    )
  then
    new.edited_by := array_append(old.edited_by, new.updated_by);
  end if;
  return new;
end;
$$;

revoke all on function public.track_payment_public_config_editors() from public, anon, authenticated;

drop trigger if exists track_payment_public_config_editors on public.payment_public_config;
create trigger track_payment_public_config_editors
before insert or update on public.payment_public_config
for each row execute function public.track_payment_public_config_editors();

create or replace function public.publish_payment_public_config(
  p_config_id uuid,
  p_expected_version integer,
  p_actor_user_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  actor public.admin_user%rowtype;
  config_to_publish public.payment_public_config%rowtype;
  previous_config public.payment_public_config%rowtype;
  cached_request public.payment_public_config_publish_requests%rowtype;
  result jsonb;
begin
  select * into actor
  from public.admin_user
  where auth_user_id = p_actor_user_id
    and status = 'active'
    and role in ('treasurer', 'admin');

  if not found then
    raise exception 'Treasurer or admin approval is required' using errcode = '42501';
  end if;

  if p_idempotency_key is null
    or char_length(p_idempotency_key) not between 16 and 200
  then
    raise exception 'Invalid publish idempotency key' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key, 0));

  select * into cached_request
  from public.payment_public_config_publish_requests
  where idempotency_key = p_idempotency_key
  for update;

  if found then
    if cached_request.config_id <> p_config_id
      or cached_request.config_version <> p_expected_version
    then
      raise exception 'Publish idempotency key was already used for another config version'
        using errcode = '23505';
    end if;
    return cached_request.result;
  end if;

  select * into config_to_publish
  from public.payment_public_config
  where id = p_config_id
  for update;

  if not found then
    raise exception 'Payment public config not found' using errcode = 'P0002';
  end if;
  if config_to_publish.version <> p_expected_version then
    raise exception 'Stale payment public config version' using errcode = '40001';
  end if;
  if config_to_publish.state <> 'in_review' then
    raise exception 'Only in-review payment public config rows can be published' using errcode = '23514';
  end if;
  if nullif(btrim(config_to_publish.display_label_zh), '') is null
    or nullif(btrim(config_to_publish.display_label_en), '') is null
  then
    raise exception 'Payment public config labels are incomplete' using errcode = '23514';
  end if;
  -- BUG-38: neither the submitter nor anyone who edited this draft may publish it.
  if (
    config_to_publish.submitted_by is not null
    and config_to_publish.submitted_by = actor.id
  )
    or actor.id = any(config_to_publish.edited_by)
  then
    raise exception 'A different treasurer or admin must publish this change' using errcode = '42501';
  end if;

  select * into previous_config
  from public.payment_public_config
  where method = config_to_publish.method
    and state = 'published'
    and id <> config_to_publish.id
  for update;

  if previous_config.id is not null then
    update public.payment_public_config set
      state = 'archived',
      archived_by = actor.id,
      archived_at = now(),
      updated_by = actor.id,
      version = version + 1
    where id = previous_config.id;

    insert into public.audit_log (actor_user_id, action, entity, entity_id, detail)
    values (
      p_actor_user_id,
      'payment_public_config.archive',
      'payment_public_config',
      previous_config.id::text,
      jsonb_build_object('replaced_by_config_id', config_to_publish.id)
    );
  end if;

  update public.payment_public_config set
    state = 'published',
    published_by = actor.id,
    published_at = now(),
    archived_by = null,
    archived_at = null,
    updated_by = actor.id,
    version = version + 1
  where id = config_to_publish.id
  returning * into config_to_publish;

  insert into public.audit_log (actor_user_id, action, entity, entity_id, detail)
  values (
    p_actor_user_id,
    'payment_public_config.publish',
    'payment_public_config',
    config_to_publish.id::text,
    jsonb_build_object(
      'previous_config_id', previous_config.id,
      'method', config_to_publish.method,
      'version', config_to_publish.version
    )
  );

  result := jsonb_build_object(
    'config_id', config_to_publish.id,
    'config_version', config_to_publish.version,
    'method', config_to_publish.method
  );

  insert into public.payment_public_config_publish_requests (
    idempotency_key,
    config_id,
    config_version,
    result
  ) values (
    p_idempotency_key,
    config_to_publish.id,
    p_expected_version,
    result
  );

  return result;
end;
$$;

revoke all on function public.publish_payment_public_config(uuid, integer, uuid, text)
  from public, anon, authenticated;
grant execute on function public.publish_payment_public_config(uuid, integer, uuid, text)
  to service_role;
