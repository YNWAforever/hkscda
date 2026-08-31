create table if not exists public.payment_public_config (
  id uuid primary key default gen_random_uuid(),
  method text not null check (method in ('stripe', 'payme', 'fps', 'paypal', 'alipayhk')),
  is_publicly_visible boolean not null default false,
  display_label_zh text not null check (char_length(display_label_zh) between 1 and 80),
  display_label_en text not null check (char_length(display_label_en) between 1 and 80),
  sort_order integer not null default 0 check (sort_order >= 0),
  details jsonb not null default '{}'::jsonb,
  state text not null default 'draft'
    check (state in ('draft', 'in_review', 'published', 'archived')),
  version integer not null default 1 check (version > 0),
  created_by uuid references public.admin_user(id) on delete set null,
  updated_by uuid references public.admin_user(id) on delete set null,
  submitted_by uuid references public.admin_user(id) on delete set null,
  submitted_at timestamptz,
  published_by uuid references public.admin_user(id) on delete set null,
  published_at timestamptz,
  archived_by uuid references public.admin_user(id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists payment_public_config_one_published_idx
  on public.payment_public_config (method)
  where state = 'published';

create index if not exists payment_public_config_admin_list_idx
  on public.payment_public_config (updated_at desc, id);

create table if not exists public.payment_public_config_publish_requests (
  idempotency_key text primary key check (char_length(idempotency_key) between 16 and 200),
  config_id uuid not null references public.payment_public_config(id) on delete restrict,
  config_version integer not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.payment_public_config enable row level security;
alter table public.payment_public_config_publish_requests enable row level security;

grant select, insert, update, delete on public.payment_public_config to service_role;
grant select, insert, update, delete on public.payment_public_config_publish_requests to service_role;
revoke all on public.payment_public_config from anon, authenticated;
revoke all on public.payment_public_config_publish_requests from anon, authenticated;

drop policy if exists "staff can read payment public config" on public.payment_public_config;
create policy "staff can read payment public config"
  on public.payment_public_config for select
  to authenticated
  using (private.has_admin_role(array['staff', 'treasurer', 'admin']));

drop policy if exists "staff can create draft payment public config" on public.payment_public_config;
create policy "staff can create draft payment public config"
  on public.payment_public_config for insert
  to authenticated
  with check (
    state = 'draft'
    and private.has_admin_role(array['staff', 'treasurer', 'admin'])
    and exists (
      select 1
      from public.admin_user actor
      where actor.id = created_by
        and actor.id = updated_by
        and actor.auth_user_id = auth.uid()
        and actor.status = 'active'
        and actor.role in ('staff', 'treasurer', 'admin')
    )
  );

drop policy if exists "staff can update draft payment public config" on public.payment_public_config;
create policy "staff can update draft payment public config"
  on public.payment_public_config for update
  to authenticated
  using (state = 'draft' and private.has_admin_role(array['staff', 'treasurer', 'admin']))
  with check (
    state = 'draft'
    and private.has_admin_role(array['staff', 'treasurer', 'admin'])
    and exists (
      select 1
      from public.admin_user actor
      where actor.id = updated_by
        and actor.auth_user_id = auth.uid()
        and actor.status = 'active'
        and actor.role in ('staff', 'treasurer', 'admin')
    )
  );

drop policy if exists "staff can delete draft payment public config" on public.payment_public_config;
create policy "staff can delete draft payment public config"
  on public.payment_public_config for delete
  to authenticated
  using (state = 'draft' and private.has_admin_role(array['staff', 'treasurer', 'admin']));

drop trigger if exists set_updated_at on public.payment_public_config;
create trigger set_updated_at
before update on public.payment_public_config
for each row execute function public.set_updated_at();

create or replace function public.mutate_payment_public_config_with_audit(
  p_actor_user_id uuid,
  p_operation text,
  p_config_id uuid default null,
  p_expected_version integer default null,
  p_values jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  actor public.admin_user%rowtype;
  current_config public.payment_public_config%rowtype;
  result_config public.payment_public_config%rowtype;
  result jsonb;
begin
  select * into actor
  from public.admin_user
  where auth_user_id = p_actor_user_id
    and status = 'active'
    and role in ('staff', 'treasurer', 'admin');

  if not found then
    raise exception 'Active staff, treasurer, or admin actor required' using errcode = '42501';
  end if;

  if p_operation = 'create' then
    insert into public.payment_public_config (
      method,
      is_publicly_visible,
      display_label_zh,
      display_label_en,
      sort_order,
      details,
      created_by,
      updated_by
    ) values (
      p_values->>'method',
      coalesce((p_values->>'is_publicly_visible')::boolean, false),
      p_values->>'display_label_zh',
      p_values->>'display_label_en',
      coalesce((p_values->>'sort_order')::integer, 0),
      coalesce(p_values->'details', '{}'::jsonb),
      actor.id,
      actor.id
    )
    returning * into result_config;
  else
    if p_config_id is null or p_expected_version is null then
      raise exception 'Config id and expected version are required' using errcode = '22023';
    end if;

    select * into current_config
    from public.payment_public_config
    where id = p_config_id
    for update;

    if not found then
      raise exception 'Payment public config not found' using errcode = 'P0002';
    end if;
    if current_config.version <> p_expected_version then
      raise exception 'Stale payment public config version' using errcode = '40001';
    end if;

    if p_operation = 'update' then
      if current_config.state <> 'draft' then
        raise exception 'Only draft payment public config rows can be edited' using errcode = '23514';
      end if;

      update public.payment_public_config set
        method = case when p_values ? 'method' then p_values->>'method' else method end,
        is_publicly_visible = case
          when p_values ? 'is_publicly_visible' then (p_values->>'is_publicly_visible')::boolean
          else is_publicly_visible
        end,
        display_label_zh = case
          when p_values ? 'display_label_zh' then p_values->>'display_label_zh'
          else display_label_zh
        end,
        display_label_en = case
          when p_values ? 'display_label_en' then p_values->>'display_label_en'
          else display_label_en
        end,
        sort_order = case when p_values ? 'sort_order' then (p_values->>'sort_order')::integer else sort_order end,
        details = case when p_values ? 'details' then p_values->'details' else details end,
        updated_by = actor.id,
        version = version + 1
      where id = p_config_id
      returning * into result_config;
    elsif p_operation = 'submit' then
      if current_config.state <> 'draft' then
        raise exception 'Only draft payment public config rows can be submitted' using errcode = '23514';
      end if;
      if nullif(btrim(current_config.display_label_zh), '') is null
        or nullif(btrim(current_config.display_label_en), '') is null
      then
        raise exception 'Payment public config labels are incomplete' using errcode = '23514';
      end if;

      update public.payment_public_config set
        state = 'in_review',
        submitted_by = actor.id,
        submitted_at = now(),
        updated_by = actor.id,
        version = version + 1
      where id = p_config_id
      returning * into result_config;
    elsif p_operation = 'withdraw' then
      if current_config.state <> 'in_review' then
        raise exception 'Only in-review payment public config rows can be withdrawn' using errcode = '23514';
      end if;
      if actor.role not in ('treasurer', 'admin')
        and current_config.submitted_by is distinct from actor.id
      then
        raise exception 'Staff can only withdraw config rows they submitted' using errcode = '42501';
      end if;

      update public.payment_public_config set
        state = 'draft',
        submitted_by = null,
        submitted_at = null,
        updated_by = actor.id,
        version = version + 1
      where id = p_config_id
      returning * into result_config;
    elsif p_operation = 'return_to_draft' then
      if actor.role not in ('treasurer', 'admin') then
        raise exception 'Treasurer or admin actor required to return a config row' using errcode = '42501';
      end if;
      if current_config.state <> 'in_review' then
        raise exception 'Only in-review payment public config rows can be returned' using errcode = '23514';
      end if;

      update public.payment_public_config set
        state = 'draft',
        submitted_by = null,
        submitted_at = null,
        updated_by = actor.id,
        version = version + 1
      where id = p_config_id
      returning * into result_config;
    elsif p_operation = 'delete' then
      if current_config.state <> 'draft' then
        raise exception 'Only draft payment public config rows can be deleted' using errcode = '23514';
      end if;

      delete from public.payment_public_config
      where id = p_config_id;
      result := jsonb_build_object(
        'id', current_config.id,
        'version', current_config.version,
        'deleted', true
      );
    else
      raise exception 'Unsupported payment public config operation' using errcode = '22023';
    end if;
  end if;

  if result is null then
    result := to_jsonb(result_config);
  end if;

  insert into public.audit_log (actor_user_id, action, entity, entity_id, detail)
  values (
    p_actor_user_id,
    'payment_public_config.' || p_operation,
    'payment_public_config',
    coalesce(result_config.id, current_config.id)::text,
    jsonb_build_object(
      'expected_version', p_expected_version,
      'result_version', coalesce(result_config.version, current_config.version),
      'values', coalesce(p_values, '{}'::jsonb)
    )
  );

  return result;
end;
$$;

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
  if config_to_publish.submitted_by is not null
    and config_to_publish.submitted_by = actor.id
  then
    raise exception 'A different admin must publish this change' using errcode = '42501';
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

revoke all on function public.mutate_payment_public_config_with_audit(uuid, text, uuid, integer, jsonb)
  from public, anon, authenticated;
revoke all on function public.publish_payment_public_config(uuid, integer, uuid, text)
  from public, anon, authenticated;

grant execute on function public.mutate_payment_public_config_with_audit(uuid, text, uuid, integer, jsonb)
  to service_role;
grant execute on function public.publish_payment_public_config(uuid, integer, uuid, text)
  to service_role;

insert into public.payment_public_config (
  method, is_publicly_visible, display_label_zh, display_label_en, sort_order, details, state, published_at
) values
  ('stripe', true, '信用卡', 'Card', 0, '{}'::jsonb, 'published', now()),
  ('alipayhk', true, 'AlipayHK', 'AlipayHK', 1, '{}'::jsonb, 'published', now()),
  ('fps', true, '轉數快 FPS', 'FPS', 2, '{}'::jsonb, 'published', now()),
  ('payme', true, 'PayMe', 'PayMe', 3, '{}'::jsonb, 'published', now()),
  ('paypal', true, 'PayPal', 'PayPal', 4, '{}'::jsonb, 'published', now());
