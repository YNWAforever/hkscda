-- PROPOSED ONLY. Requires explicit production approval and verified backup.
-- Scope: restore CMS lifecycle/read/media schema, CRM reads, and draft payment settings.
-- Intended project: iihqjzilgawhfdhdevam. This file does not repair migration history.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';
do $$ begin
 if to_regclass('public.payment_public_config') is not null
    or to_regclass('public.content_revision') is not null
    or to_regclass('public.content_media_session') is not null
    or to_regprocedure('public.crm_read_supporters(jsonb,integer,integer,boolean)') is not null then
   raise exception 'Repair precondition changed; rerun read-only preflight before continuing';
 end if;
end $$;
-- Source: 20260831120000_payment_public_config.sql
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
  -- Nullable (unlike adoption_guide_releases) only so the seed insert below can
  -- create already-published rows with no real actor in context; restrict (not
  -- set null) on delete to still preserve the approval audit trail.
  created_by uuid references public.admin_user(id) on delete restrict,
  updated_by uuid references public.admin_user(id) on delete restrict,
  submitted_by uuid references public.admin_user(id) on delete restrict,
  submitted_at timestamptz,
  published_by uuid references public.admin_user(id) on delete restrict,
  published_at timestamptz,
  archived_by uuid references public.admin_user(id) on delete restrict,
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

revoke all on function public.mutate_payment_public_config_with_audit(uuid, text, uuid, integer, jsonb)
  from public, anon, authenticated;
revoke all on function public.publish_payment_public_config(uuid, integer, uuid, text)
  from public, anon, authenticated;

grant execute on function public.mutate_payment_public_config_with_audit(uuid, text, uuid, integer, jsonb)
  to service_role;
grant execute on function public.publish_payment_public_config(uuid, integer, uuid, text)
  to service_role;

-- Repair adaptation: seed unapproved draft settings only. No public method activation.
insert into public.payment_public_config
(method,is_publicly_visible,display_label_zh,display_label_en,sort_order,details,state)
values
('stripe',false,'信用卡','Card',0,'{}'::jsonb,'draft'),
('alipayhk',false,'AlipayHK','AlipayHK',1,'{}'::jsonb,'draft'),
('fps',false,'轉數快 FPS','FPS',2,'{}'::jsonb,'draft'),
('payme',false,'PayMe','PayMe',3,'{}'::jsonb,'draft'),
('paypal',false,'PayPal','PayPal',4,'{}'::jsonb,'draft');
-- Source: 20260831160000_content_media_storage_bucket.sql
-- Provisions the content-media Storage bucket that
-- src/lib/content/repository.server.ts's mediaPublicUrl() already assumes
-- exists (it unconditionally calls
-- client.storage.from(row.storage_bucket).getPublicUrl(...)). Mirrors the
-- site-documents bucket's exact shape
-- (20260718100000_public_documents_and_donation_purpose.sql): a public
-- bucket, with no explicit storage.objects RLS policy needed. storage.objects
-- has row level security enabled by default with no permissive policy for
-- anon/authenticated, so direct writes are already denied for those roles;
-- uploads go through signed upload URLs, which Supabase Storage authorizes
-- via the URL's own token rather than storage.objects RLS, and are issued
-- only by the service-role client (src/lib/content/repository.server.ts's
-- createSignedUploadUrl, called from an admin-authenticated API route).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'content-media',
  'content-media',
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Source: 20260905150012_content_revision_lifecycle.sql
alter table public.story_update add column if not exists is_authoring_active boolean not null default true;

alter table public.content_item
  add column if not exists version integer not null default 0 check (version >= 0);

create table if not exists public.content_revision (
  id uuid primary key default gen_random_uuid(),
  content_item_id uuid not null references public.content_item(id) on delete cascade,
  version integer not null check (version >= 0),
  operation text not null,
  authoring_snapshot jsonb not null,
  public_snapshot jsonb not null,
  created_by uuid not null references public.admin_user(id),
  created_at timestamptz not null default now(),
  is_published boolean not null default false,
  unique (content_item_id, version)
);

alter table public.content_item
  add column if not exists published_slug text,
  add column if not exists published_revision_id uuid references public.content_revision(id),
  add column if not exists draft_revision_id uuid references public.content_revision(id);

create table if not exists public.content_publish_request (
  idempotency_key text primary key check (char_length(idempotency_key) between 16 and 200),
  content_item_id uuid not null references public.content_item(id) on delete cascade,
  revision_id uuid not null references public.content_revision(id),
  expected_version integer not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists content_revision_content_version_idx
  on public.content_revision (content_item_id, version desc);

alter table public.content_revision enable row level security;
alter table public.content_publish_request enable row level security;
revoke all on public.content_revision from public, anon, authenticated;
revoke all on public.content_publish_request from public, anon, authenticated;
grant select, insert, update on public.content_revision to service_role;
grant select, insert on public.content_publish_request to service_role;

create schema if not exists private;

create or replace function private.build_content_authoring_snapshot(p_content_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'content', to_jsonb(item) - 'created_by' - 'updated_by',
    'profile', (select to_jsonb(profile) from public.rescue_story_profile profile
      where profile.content_item_id = item.id),
    'updates', coalesce((select jsonb_agg(to_jsonb(update_row) order by update_row.occurred_at, update_row.id)
      from public.story_update update_row where update_row.content_item_id = item.id and update_row.is_authoring_active), '[]'::jsonb),
    'media', coalesce((select jsonb_agg(to_jsonb(media_row) order by media_row.sort_order, media_row.created_at, media_row.id)
      from public.content_media media_row where media_row.content_item_id = item.id), '[]'::jsonb),
    'links', coalesce((select jsonb_agg(to_jsonb(link_row) order by link_row.created_at, link_row.id)
      from public.content_link link_row where link_row.content_item_id = item.id), '[]'::jsonb)
  )
  from public.content_item item
  where item.id = p_content_id
$$;

create or replace function private.build_content_public_snapshot(
  p_content_id uuid,
  p_published_at timestamptz
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'content', (to_jsonb(item) - 'created_by' - 'updated_by' - 'published_revision_id' - 'draft_revision_id' - 'published_slug')
      || jsonb_build_object('status', 'published', 'published_at', p_published_at,
        'cover_media_id', (select cover.id from public.content_media cover
          where cover.id = item.cover_media_id and cover.content_item_id = item.id
            and (cover.story_update_id is null or exists (select 1 from public.story_update u
              where u.id = cover.story_update_id and u.content_item_id = item.id
                and u.is_authoring_active and u.visibility = 'public')))),
    'profile', (select to_jsonb(profile) - 'internal_address' - 'internal_location_notes'
      from public.rescue_story_profile profile where profile.content_item_id = item.id),
    'updates', coalesce((select jsonb_agg(to_jsonb(update_row) order by update_row.occurred_at, update_row.id)
      from public.story_update update_row
      where update_row.content_item_id = item.id and update_row.is_authoring_active and update_row.visibility = 'public'), '[]'::jsonb),
    'media', coalesce((select jsonb_agg(to_jsonb(media_row) order by media_row.sort_order, media_row.created_at, media_row.id)
      from public.content_media media_row
      where media_row.content_item_id = item.id
        and (media_row.story_update_id is null or exists (
          select 1 from public.story_update update_row
          where update_row.id = media_row.story_update_id
            and update_row.content_item_id = item.id
            and update_row.is_authoring_active and update_row.visibility = 'public'
        ))), '[]'::jsonb)
  )
  from public.content_item item
  where item.id = p_content_id
$$;

create or replace function private.require_content_actor(p_actor_user_id uuid)
returns public.admin_user
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare actor public.admin_user%rowtype;
begin
  select * into actor from public.admin_user
  where auth_user_id = p_actor_user_id and status = 'active' and role in ('staff', 'admin');
  if not found then raise exception 'Active staff or admin actor required' using errcode = '42501'; end if;
  return actor;
end
$$;

create or replace function private.insert_content_revision(
  p_content_id uuid,
  p_version integer,
  p_operation text,
  p_actor_admin_id uuid,
  p_snapshot_published_at timestamptz default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare revision_id uuid;
begin
  insert into public.content_revision (
    content_item_id, version, operation, authoring_snapshot, public_snapshot, created_by
  ) values (
    p_content_id, p_version, p_operation,
    private.build_content_authoring_snapshot(p_content_id),
    private.build_content_public_snapshot(p_content_id, p_snapshot_published_at),
    p_actor_admin_id
  ) returning id into revision_id;
  update public.content_item set draft_revision_id=revision_id where id=p_content_id;
  return revision_id;
end
$$;

create or replace function public.mutate_content_revision_with_audit(
  p_actor_user_id uuid,
  p_content_id uuid,
  p_expected_version integer,
  p_operation text,
  p_values jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  actor public.admin_user%rowtype;
  item public.content_item%rowtype;
  next_version integer;
  revision_id uuid;
  child_id uuid;
begin
  actor := private.require_content_actor(p_actor_user_id);
  select * into item from public.content_item where id = p_content_id for update;
  if not found then raise exception 'Content item not found' using errcode = 'P0002'; end if;
  if item.version is distinct from p_expected_version then raise exception 'Stale content version' using errcode = '40001'; end if;

  if p_operation = 'archive' then
    update public.content_item set status='archived',updated_by=actor.id where id=p_content_id;
  elsif p_operation = 'save_content' then
    update public.content_item set
      slug = case when p_values ? 'slug' then p_values->>'slug' else slug end,
      type = case when p_values ? 'type' then p_values->>'type' else type end,
      title = case when p_values ? 'title' then p_values->>'title' else title end,
      subtitle = case when p_values ? 'subtitle' then p_values->>'subtitle' else subtitle end,
      summary = case when p_values ? 'summary' then p_values->>'summary' else summary end,
      body = case when p_values ? 'body' then p_values->>'body' else body end,
      cta_label = case when p_values ? 'ctaLabel' then p_values->>'ctaLabel' else cta_label end,
      cta_url = case when p_values ? 'ctaUrl' then p_values->>'ctaUrl' else cta_url end,
      seo_title = case when p_values ? 'seoTitle' then p_values->>'seoTitle' else seo_title end,
      seo_description = case when p_values ? 'seoDescription' then p_values->>'seoDescription' else seo_description end,
      og_title = case when p_values ? 'ogTitle' then p_values->>'ogTitle' else og_title end,
      og_description = case when p_values ? 'ogDescription' then p_values->>'ogDescription' else og_description end,
      cover_media_id = case when p_values ? 'coverMediaId' then (p_values->>'coverMediaId')::uuid else cover_media_id end,
      updated_by = actor.id
    where id = p_content_id;
  elsif p_operation = 'upsert_profile' then
    insert into public.rescue_story_profile (
      content_item_id, animal_type, public_status, rescue_region, rescue_date, show_on_map,
      public_map_label, public_lat, public_lng, internal_address, internal_location_notes, is_featured
    ) values (
      p_content_id, p_values->>'animalType', p_values->>'publicStatus', p_values->>'rescueRegion',
      (p_values->>'rescueDate')::date, coalesce((p_values->>'showOnMap')::boolean, false),
      p_values->>'publicMapLabel', (p_values->>'publicLat')::numeric, (p_values->>'publicLng')::numeric,
      p_values->>'internalAddress', p_values->>'internalLocationNotes',
      coalesce((p_values->>'isFeatured')::boolean, false)
    ) on conflict (content_item_id) do update set
      animal_type=excluded.animal_type, public_status=excluded.public_status,
      rescue_region=excluded.rescue_region, rescue_date=excluded.rescue_date,
      show_on_map=excluded.show_on_map, public_map_label=excluded.public_map_label,
      public_lat=excluded.public_lat, public_lng=excluded.public_lng,
      internal_address=excluded.internal_address, internal_location_notes=excluded.internal_location_notes,
      is_featured=excluded.is_featured;
  elsif p_operation = 'create_update' then
    insert into public.story_update (
      content_item_id, kind, title, body, occurred_at, visibility,
      should_generate_adopter_drafts, created_by, updated_by
    ) values (
      p_content_id, p_values->>'kind', p_values->>'title', p_values->>'body',
      (p_values->>'occurredAt')::timestamptz, p_values->>'visibility',
      coalesce((p_values->>'shouldGenerateAdopterDrafts')::boolean, false), actor.id, actor.id
    ) returning id into child_id;
  elsif p_operation = 'create_media' then
    if p_values->>'storyUpdateId' is not null and not exists (
      select 1 from public.story_update where id=(p_values->>'storyUpdateId')::uuid
        and content_item_id=p_content_id and is_authoring_active and visibility='public'
    ) then raise exception 'Media requires an active public update belonging to this content item' using errcode='23514'; end if;
    insert into public.content_media (
      content_item_id, story_update_id, storage_bucket, storage_path, alt_text, caption, sort_order, is_cover
    ) values (
      p_content_id, (p_values->>'storyUpdateId')::uuid, p_values->>'storageBucket',
      p_values->>'storagePath', p_values->>'altText', p_values->>'caption',
      coalesce((p_values->>'sortOrder')::integer,0), coalesce((p_values->>'isCover')::boolean,false)
    ) returning id into child_id;
    if coalesce((p_values->>'isCover')::boolean,false) then
      update public.content_item set cover_media_id=child_id where id=p_content_id;
    end if;
  elsif p_operation = 'create_link' then
    insert into public.content_link (content_item_id, linked_type, linked_id, relationship)
    values (p_content_id, p_values->>'linkedType', (p_values->>'linkedId')::uuid, p_values->>'relationship')
    returning id into child_id;
  else
    raise exception 'Unsupported content mutation' using errcode = '22023';
  end if;

  next_version := item.version + 1;
  update public.content_item set version=next_version, updated_by=actor.id where id=p_content_id;
  revision_id := private.insert_content_revision(p_content_id,next_version,p_operation,actor.id);
  insert into public.audit_log(actor_user_id,action,entity,entity_id,detail)
  values(p_actor_user_id,'content.'||p_operation,'content_item',p_content_id::text,
    jsonb_build_object('expected_version',p_expected_version,'result_version',next_version,
      'revision_id',revision_id,'child_id',child_id));
  return jsonb_build_object('content_id',p_content_id,'version',next_version,'revision_id',revision_id,'child_id',child_id);
end
$$;

create or replace function private.validate_content_publication_snapshot(p_snapshot jsonb)
returns void language plpgsql immutable security invoker set search_path=public,pg_temp as $$
begin
  if coalesce(btrim(p_snapshot->'content'->>'title'),'') = ''
    or coalesce(btrim(p_snapshot->'content'->>'slug'),'') = ''
    or coalesce(btrim(p_snapshot->'content'->>'summary'),'') = '' then
    raise exception 'Title, slug and summary are required' using errcode='23514';
  end if;
  if p_snapshot->'content'->>'type'='rescue_story' then
    if coalesce(btrim(p_snapshot->'profile'->>'rescue_region'),'') = '' then
      raise exception 'Rescue region is required' using errcode='23514';
    end if;
    if p_snapshot->'profile'->>'show_on_map'='true' and (
      coalesce(btrim(p_snapshot->'profile'->>'public_map_label'),'') = ''
      or p_snapshot->'profile'->>'public_lat' is null
      or p_snapshot->'profile'->>'public_lng' is null
      or (p_snapshot->'profile'->>'public_lat')::numeric not between -90 and 90
      or (p_snapshot->'profile'->>'public_lng')::numeric not between -180 and 180
    ) then raise exception 'Public map label and approximate coordinates are required' using errcode='23514'; end if;
  end if;
  if (p_snapshot->'content'->>'cover_media_id') is null
    then raise exception 'Cover media is required' using errcode='23514'; end if;
  if p_snapshot->'content'->>'type'='rescue_story'
    and coalesce(jsonb_typeof(p_snapshot->'profile'), 'null') <> 'object'
    then raise exception 'Story profile is required' using errcode='23514'; end if;
  if not exists (select 1 from jsonb_array_elements(p_snapshot->'media') media
    where media->>'id'=p_snapshot->'content'->>'cover_media_id')
    then raise exception 'Public cover media is required' using errcode='23514'; end if;
end $$;
revoke all on function private.validate_content_publication_snapshot(jsonb) from public,anon,authenticated;
grant execute on function private.validate_content_publication_snapshot(jsonb) to service_role;

create or replace function public.publish_content_revision(
  p_actor_user_id uuid,
  p_content_id uuid,
  p_revision_id uuid,
  p_expected_version integer,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  actor public.admin_user%rowtype;
  item public.content_item%rowtype;
  revision public.content_revision%rowtype;
  cached public.content_publish_request%rowtype;
  v_published_at timestamptz := now();
  next_version integer;
  result jsonb;
begin
  actor := private.require_content_actor(p_actor_user_id);
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 16 and 200
    then raise exception 'Invalid publication key' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key,0));
  select * into cached from public.content_publish_request where idempotency_key=p_idempotency_key for update;
  if found then
    if cached.content_item_id<>p_content_id or cached.revision_id<>p_revision_id
      or cached.expected_version<>p_expected_version
      then raise exception 'Publication key already used' using errcode='23505'; end if;
    return cached.result;
  end if;
  select * into item from public.content_item where id=p_content_id for update;
  if not found then raise exception 'Content item not found' using errcode='P0002'; end if;
  if item.version is distinct from p_expected_version then raise exception 'Stale content version' using errcode='40001'; end if;
  select * into revision from public.content_revision
    where id=p_revision_id and content_item_id=p_content_id for update;
  if not found then raise exception 'Content revision not found' using errcode='P0002'; end if;
  if revision.version>item.version then raise exception 'Invalid content revision' using errcode='23514'; end if;
  perform private.validate_content_publication_snapshot(revision.public_snapshot);
  next_version:=item.version+1;
  update public.content_revision set is_published=true where id=p_revision_id;
  update public.content_item set status='published',published_at=v_published_at,
    published_revision_id=p_revision_id,published_slug=revision.public_snapshot->'content'->>'slug',version=next_version,updated_by=actor.id where id=p_content_id;
  insert into public.audit_log(actor_user_id,action,entity,entity_id,detail)
    values(p_actor_user_id,'content.publish','content_item',p_content_id::text,
      jsonb_build_object('expected_version',p_expected_version,'result_version',next_version,
        'revision_id',p_revision_id,'published_at',v_published_at));
  result:=jsonb_build_object('content_id',p_content_id,'version',next_version,'revision_id',p_revision_id);
  insert into public.content_publish_request(idempotency_key,content_item_id,revision_id,expected_version,result)
    values(p_idempotency_key,p_content_id,p_revision_id,p_expected_version,result);
  return result;
end
$$;

create or replace function public.restore_content_revision(
  p_actor_user_id uuid,
  p_content_id uuid,
  p_revision_id uuid,
  p_expected_version integer
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  actor public.admin_user%rowtype;
  item public.content_item%rowtype;
  revision public.content_revision%rowtype;
  restored jsonb;
  next_version integer;
  new_revision_id uuid;
begin
  actor:=private.require_content_actor(p_actor_user_id);
  select * into item from public.content_item where id=p_content_id for update;
  if not found then raise exception 'Content item not found' using errcode='P0002'; end if;
  if item.version is distinct from p_expected_version then raise exception 'Stale content version' using errcode='40001'; end if;
  select * into revision from public.content_revision where id=p_revision_id and content_item_id=p_content_id;
  if not found then raise exception 'Content revision not found' using errcode='P0002'; end if;
  restored:=revision.authoring_snapshot->'content';
  update public.content_item set
    slug=restored->>'slug',type=restored->>'type',title=restored->>'title',
    subtitle=restored->>'subtitle',summary=restored->>'summary',body=restored->>'body',
    cover_media_id=null,cta_label=restored->>'cta_label',cta_url=restored->>'cta_url',
    seo_title=restored->>'seo_title',seo_description=restored->>'seo_description',
    og_title=restored->>'og_title',og_description=restored->>'og_description',
    updated_by=actor.id
  where id=p_content_id;
  delete from public.content_media where content_item_id=p_content_id;
  update public.story_update set is_authoring_active=false where content_item_id=p_content_id;
  delete from public.content_link where content_item_id=p_content_id;
  delete from public.rescue_story_profile where content_item_id=p_content_id;
  if jsonb_typeof(revision.authoring_snapshot->'profile') = 'object' then
    insert into public.rescue_story_profile
      select * from jsonb_populate_record(null::public.rescue_story_profile,revision.authoring_snapshot->'profile');
  end if;
  insert into public.story_update
    select * from jsonb_populate_recordset(null::public.story_update,revision.authoring_snapshot->'updates')
    on conflict (id) do update set
      kind=excluded.kind,title=excluded.title,body=excluded.body,occurred_at=excluded.occurred_at,
      visibility=excluded.visibility,should_generate_adopter_drafts=excluded.should_generate_adopter_drafts,
      updated_by=actor.id,is_authoring_active=true;
  insert into public.content_media
    select * from jsonb_populate_recordset(null::public.content_media,revision.authoring_snapshot->'media');
  insert into public.content_link
    select * from jsonb_populate_recordset(null::public.content_link,revision.authoring_snapshot->'links');
  update public.content_item set cover_media_id=(restored->>'cover_media_id')::uuid where id=p_content_id;
  next_version:=item.version+1;
  update public.content_item set version=next_version,updated_by=actor.id where id=p_content_id;
  new_revision_id:=private.insert_content_revision(p_content_id,next_version,'restore',actor.id);
  insert into public.audit_log(actor_user_id,action,entity,entity_id,detail)
    values(p_actor_user_id,'content.restore','content_item',p_content_id::text,
      jsonb_build_object('expected_version',p_expected_version,'result_version',next_version,
        'source_revision_id',p_revision_id,'revision_id',new_revision_id));
  return jsonb_build_object('content_id',p_content_id,'version',next_version,'revision_id',new_revision_id);
end
$$;

-- Backfill one immutable snapshot for each legacy published item. Existing public
-- media references are retained only when content-level or attached to a public
-- update; previously public object URLs need a separate inventory/remediation.
do $$
declare item record; actor_id uuid; revision_id uuid;
begin
  for item in select * from public.content_item where status='published' and published_revision_id is null loop
    select id into actor_id from public.admin_user
      where status='active' and role in ('staff','admin')
      order by case when id=item.updated_by then 0 when id=item.created_by then 1 else 2 end limit 1;
    if actor_id is null then raise exception 'Cannot backfill content revision without active actor'; end if;
    revision_id:=private.insert_content_revision(item.id,item.version,'legacy_backfill',actor_id,item.published_at);
    update public.content_revision set is_published=true where id=revision_id;
    update public.content_item set published_revision_id=revision_id where id=item.id;
  end loop;
end
$$;

-- Preserve the selected public URL independently of later draft slug edits.
update public.content_item item set published_slug=revision.public_snapshot->'content'->>'slug'
from public.content_revision revision where revision.id=item.published_revision_id and revision.content_item_id=item.id;
create unique index content_item_published_slug_unique
  on public.content_item(published_slug) where status='published';

revoke all on function private.build_content_authoring_snapshot(uuid) from public,anon,authenticated;
revoke all on function private.build_content_public_snapshot(uuid,timestamptz) from public,anon,authenticated;
revoke all on function private.require_content_actor(uuid) from public,anon,authenticated;
revoke all on function private.insert_content_revision(uuid,integer,text,uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.mutate_content_revision_with_audit(uuid,uuid,integer,text,jsonb) from public,anon,authenticated;
revoke all on function public.publish_content_revision(uuid,uuid,uuid,integer,text) from public,anon,authenticated;
revoke all on function public.restore_content_revision(uuid,uuid,uuid,integer) from public,anon,authenticated;
grant usage on schema private to service_role;
grant execute on function private.build_content_authoring_snapshot(uuid) to service_role;
grant execute on function private.build_content_public_snapshot(uuid,timestamptz) to service_role;
grant execute on function private.require_content_actor(uuid) to service_role;
grant execute on function private.insert_content_revision(uuid,integer,text,uuid,timestamptz) to service_role;
grant execute on function public.mutate_content_revision_with_audit(uuid,uuid,integer,text,jsonb) to service_role;
grant execute on function public.publish_content_revision(uuid,uuid,uuid,integer,text) to service_role;
grant execute on function public.restore_content_revision(uuid,uuid,uuid,integer) to service_role;

create or replace function private.guard_content_revision_snapshot()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if new.authoring_snapshot is distinct from old.authoring_snapshot
    or new.public_snapshot is distinct from old.public_snapshot
    or new.content_item_id is distinct from old.content_item_id
    or new.version is distinct from old.version then
    raise exception 'Content revision snapshots are immutable' using errcode='23514';
  end if;
  return new;
end
$$;
create trigger content_revision_snapshot_immutable before update on public.content_revision
for each row execute function private.guard_content_revision_snapshot();
revoke all on function private.guard_content_revision_snapshot() from public,anon,authenticated;

create or replace function public.create_content_revision_with_audit(p_actor_user_id uuid, p_values jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare actor public.admin_user%rowtype; v_content_id uuid; v_revision_id uuid;
begin
  actor:=private.require_content_actor(p_actor_user_id);
  if coalesce(p_values->>'status','draft') <> 'draft' then
    raise exception 'Content items must be created as drafts' using errcode='23514';
  end if;
  insert into public.content_item(slug,type,title,subtitle,summary,body,cta_label,cta_url,
    seo_title,seo_description,og_title,og_description,status,version,created_by,updated_by)
  values(p_values->>'slug',p_values->>'type',p_values->>'title',p_values->>'subtitle',
    p_values->>'summary',p_values->>'body',p_values->>'ctaLabel',p_values->>'ctaUrl',
    p_values->>'seoTitle',p_values->>'seoDescription',p_values->>'ogTitle',p_values->>'ogDescription',
    'draft',1,actor.id,actor.id) returning id into v_content_id;
  v_revision_id:=private.insert_content_revision(v_content_id,1,'create',actor.id);
  insert into public.audit_log(actor_user_id,action,entity,entity_id,detail)
  values(p_actor_user_id,'content.create','content_item',v_content_id::text,
    jsonb_build_object('result_version',1,'revision_id',v_revision_id));
  return jsonb_build_object('content_id',v_content_id,'version',1,'revision_id',v_revision_id);
end
$$;
revoke all on function public.create_content_revision_with_audit(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.create_content_revision_with_audit(uuid,jsonb) to service_role;

create or replace function private.content_summary_snapshot(p_snapshot jsonb)
returns jsonb language sql immutable security invoker set search_path=public,pg_temp as $$
  with latest as (
    select value from jsonb_array_elements(p_snapshot->'updates')
    order by value->>'occurred_at' desc,value->>'id' limit 1
  )
  select jsonb_build_object(
    'content',(p_snapshot->'content')-'body'-'seo_title'-'seo_description'-'og_title'-'og_description',
    'profile',p_snapshot->'profile',
    'updates',coalesce((select jsonb_agg(value) from latest),'[]'::jsonb),
    'media',coalesce((select jsonb_agg(media) from jsonb_array_elements(p_snapshot->'media') media
      where media->>'id'=p_snapshot->'content'->>'cover_media_id'
        or media->>'story_update_id'=(select value->>'id' from latest)),'[]'::jsonb))
$$;
revoke all on function private.content_summary_snapshot(jsonb) from public,anon,authenticated;
grant execute on function private.content_summary_snapshot(jsonb) to service_role;

create or replace function public.read_published_content_snapshots(p_filters jsonb default '{}'::jsonb)
returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
  with filtered as (
    select revision.public_snapshot as snapshot, item.published_at, item.id
    from public.content_item item join public.content_revision revision
      on revision.id=item.published_revision_id and revision.content_item_id=item.id
    where item.status='published'
      and (p_filters->>'slug' is null or revision.public_snapshot->'content'->>'slug'=p_filters->>'slug')
      and (p_filters->>'type' is null or revision.public_snapshot->'content'->>'type'=p_filters->>'type')
      and (p_filters->>'animalType' is null or revision.public_snapshot->'profile'->>'animal_type'=p_filters->>'animalType')
      and (p_filters->>'publicStatus' is null or revision.public_snapshot->'profile'->>'public_status'=p_filters->>'publicStatus')
      and (p_filters->>'rescueRegion' is null or revision.public_snapshot->'profile'->>'rescue_region'=p_filters->>'rescueRegion')
      and (p_filters->>'q' is null or strpos(lower(coalesce(revision.public_snapshot->'content'->>'title','') || ' ' || coalesce(revision.public_snapshot->'content'->>'summary','')),lower(p_filters->>'q'))>0)
  ), page as (
    select * from filtered order by published_at desc nulls last,id
    limit least(50,greatest(1,coalesce((p_filters->>'pageSize')::integer,25)))
    offset (greatest(1,coalesce((p_filters->>'page')::integer,1))-1)*least(50,greatest(1,coalesce((p_filters->>'pageSize')::integer,25)))
  )
  select jsonb_build_object('total',(select count(*) from filtered),
    'rows',coalesce((select jsonb_agg(jsonb_build_object('snapshot',case when p_filters->>'detail'='true' then snapshot else private.content_summary_snapshot(snapshot) end,'published_at',published_at) order by published_at desc nulls last,id) from page),'[]'::jsonb))
$$;
revoke all on function public.read_published_content_snapshots(jsonb) from public,anon,authenticated;
grant execute on function public.read_published_content_snapshots(jsonb) to service_role;

-- Source: 20260905155426_content_private_media_sessions.sql
-- Private upload and public-copy preparation are independent from the publication pointer.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('content-media-private','content-media-private',false,8388608,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create table public.content_media_session(
 id uuid primary key default gen_random_uuid(),content_item_id uuid not null references public.content_item(id) on delete cascade,
 expected_version integer not null check(expected_version>=0),story_update_id uuid,
 storage_bucket text not null default 'content-media-private' check(storage_bucket='content-media-private'),storage_path text not null unique,
 mime_type text not null check(mime_type in('image/jpeg','image/png','image/webp')),byte_size integer not null check(byte_size between 1 and 8388608),
 expires_at timestamptz not null,created_by uuid not null references public.admin_user(id),created_at timestamptz not null default now(),
 finalized_at timestamptz,sha256 text check(sha256 is null or sha256 ~ '^[a-f0-9]{64}$'),finalization_payload jsonb,result jsonb
);
create table public.content_public_asset(
 id uuid primary key default gen_random_uuid(),content_item_id uuid not null references public.content_item(id) on delete cascade,
 revision_id uuid not null references public.content_revision(id),media_id uuid not null,
 source_bucket text not null check(source_bucket='content-media-private'),source_path text not null,
 public_bucket text not null default 'content-media' check(public_bucket='content-media'),public_path text not null unique,
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),ready boolean not null default false,created_at timestamptz not null default now(),
 unique(revision_id,media_id)
);
create table public.content_publication_prepare(
 idempotency_key text primary key,content_item_id uuid not null references public.content_item(id) on delete cascade,
 revision_id uuid not null references public.content_revision(id),expected_version integer not null,created_at timestamptz not null default now()
);
alter table public.content_media_session enable row level security;
alter table public.content_public_asset enable row level security;
alter table public.content_publication_prepare enable row level security;
revoke all on public.content_media_session,public.content_public_asset,public.content_publication_prepare from public,anon,authenticated;
grant select,insert,update on public.content_media_session,public.content_public_asset to service_role;
grant select,insert on public.content_publication_prepare to service_role;

create or replace function public.create_content_media_session(p_actor_user_id uuid,p_content_id uuid,p_expected_version integer,p_mime_type text,p_byte_size integer,p_story_update_id uuid default null)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare actor public.admin_user%rowtype;item public.content_item%rowtype;session public.content_media_session%rowtype;v_id uuid:=gen_random_uuid();v_ext text;
begin
 actor:=private.require_content_actor(p_actor_user_id);
 select * into item from public.content_item where id=p_content_id for update;
 if not found then raise exception 'Content not found' using errcode='P0002';end if;
 if item.version is distinct from p_expected_version then raise exception 'Stale content version' using errcode='40001';end if;
 if p_story_update_id is not null and not exists(select 1 from public.story_update where id=p_story_update_id and content_item_id=p_content_id and is_authoring_active) then raise exception 'Current story update not found' using errcode='P0002';end if;
 v_ext:=case p_mime_type when 'image/jpeg' then '.jpg' when 'image/png' then '.png' when 'image/webp' then '.webp' end;
 if v_ext is null or p_byte_size is null or p_byte_size not between 1 and 8388608 then raise exception 'Invalid media properties' using errcode='23514';end if;
 insert into public.content_media_session(id,content_item_id,expected_version,story_update_id,storage_path,mime_type,byte_size,expires_at,created_by)
 values(v_id,p_content_id,p_expected_version,p_story_update_id,p_content_id::text||'/'||v_id::text||v_ext,p_mime_type,p_byte_size,now()+interval '1 hour',actor.id) returning * into session;
 insert into public.audit_log(actor_user_id,action,entity,entity_id,detail) values(p_actor_user_id,'content.media.session.create','content_item',p_content_id::text,jsonb_build_object('session_id',v_id));
 return to_jsonb(session);
end $$;

create or replace function public.get_content_media_session(p_actor_user_id uuid,p_content_id uuid,p_session_id uuid)
returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare session public.content_media_session%rowtype;
begin
 perform private.require_content_actor(p_actor_user_id);
 select * into session from public.content_media_session where id=p_session_id and content_item_id=p_content_id;
 if not found then raise exception 'Media session not found' using errcode='P0002';end if;
 return to_jsonb(session);
end $$;

create or replace function public.finalize_content_media_session(p_actor_user_id uuid,p_content_id uuid,p_session_id uuid,p_expected_version integer,p_values jsonb,p_sha256 text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare actor public.admin_user%rowtype;item public.content_item%rowtype;session public.content_media_session%rowtype;v_result jsonb;v_payload jsonb;v_media_id uuid;v_revision_id uuid;v_update public.story_update%rowtype;
begin
 actor:=private.require_content_actor(p_actor_user_id);
 select * into item from public.content_item where id=p_content_id for update;
 if not found then raise exception 'Content not found' using errcode='P0002';end if;
 select * into session from public.content_media_session where id=p_session_id and content_item_id=p_content_id for update;
 if not found then raise exception 'Media session not found' using errcode='P0002';end if;
 v_payload:=jsonb_build_object('expectedVersion',p_expected_version,'values',p_values);
 if session.result is not null then
  if session.finalization_payload is distinct from v_payload then raise exception 'Finalization payload conflict' using errcode='23505';end if;
  return session.result;
 end if;
 if item.version is distinct from p_expected_version or session.expected_version is distinct from p_expected_version then raise exception 'Stale content version' using errcode='40001';end if;
 if session.expires_at<=now() then raise exception 'Media session expired' using errcode='23514';end if;
 if p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$' then raise exception 'Verified image digest required' using errcode='23514';end if;
 if session.story_update_id is not null then
  select * into v_update from public.story_update where id=session.story_update_id and content_item_id=p_content_id and is_authoring_active;
  if not found then raise exception 'Current story update not found' using errcode='P0002';end if;
  if v_update.visibility='internal' and coalesce((p_values->>'isCover')::boolean,false) then raise exception 'Internal update media cannot be a cover' using errcode='23514';end if;
 end if;
 insert into public.content_media(content_item_id,story_update_id,storage_bucket,storage_path,alt_text,caption,sort_order,is_cover)
 values(p_content_id,session.story_update_id,session.storage_bucket,session.storage_path,p_values->>'altText',p_values->>'caption',coalesce((p_values->>'sortOrder')::integer,0),coalesce((p_values->>'isCover')::boolean,false)) returning id into v_media_id;
 update public.content_item set version=version+1,updated_by=actor.id,cover_media_id=case when coalesce((p_values->>'isCover')::boolean,false) then v_media_id else cover_media_id end where id=p_content_id;
 v_revision_id:=private.insert_content_revision(p_content_id,item.version+1,'media.finalize',actor.id);
 v_result:=jsonb_build_object('content_id',p_content_id,'version',item.version+1,'revision_id',v_revision_id,'child_id',v_media_id);
 update public.content_media_session set finalized_at=now(),sha256=p_sha256,finalization_payload=v_payload,result=v_result where id=p_session_id;
 insert into public.audit_log(actor_user_id,action,entity,entity_id,detail) values(p_actor_user_id,'content.media.finalize','content_item',p_content_id::text,jsonb_build_object('session_id',p_session_id,'media_id',v_media_id,'revision_id',v_revision_id,'result_version',item.version+1));
 return v_result;
end $$;

create or replace function public.prepare_content_public_assets(p_actor_user_id uuid,p_content_id uuid,p_revision_id uuid,p_expected_version integer,p_idempotency_key text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare item public.content_item%rowtype;revision public.content_revision%rowtype;cached public.content_publication_prepare%rowtype;published public.content_publish_request%rowtype;media jsonb;session public.content_media_session%rowtype;
begin
 perform private.require_content_actor(p_actor_user_id);
 if p_idempotency_key is null or char_length(p_idempotency_key) not between 16 and 200 then raise exception 'Invalid publication key' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key,0));
 select * into published from public.content_publish_request where idempotency_key=p_idempotency_key;
 if found then
  if published.content_item_id is distinct from p_content_id or published.revision_id is distinct from p_revision_id or published.expected_version is distinct from p_expected_version then raise exception 'Publication payload conflict' using errcode='23505';end if;
  return '[]'::jsonb;
 end if;
 select * into item from public.content_item where id=p_content_id for update;
 if not found then raise exception 'Content not found' using errcode='P0002';end if;
 if item.version is distinct from p_expected_version then raise exception 'Stale content version' using errcode='40001';end if;
 select * into revision from public.content_revision where id=p_revision_id and content_item_id=p_content_id;
 if not found then raise exception 'Revision not found' using errcode='P0002';end if;
 if revision.version>item.version then raise exception 'Invalid content revision' using errcode='23514';end if;
 perform private.validate_content_publication_snapshot(revision.public_snapshot);
 if exists(select 1 from public.content_item other where other.id<>p_content_id and other.status='published' and other.published_slug=revision.public_snapshot->'content'->>'slug') then raise exception 'Published slug already used' using errcode='23505';end if;
 select * into cached from public.content_publication_prepare where idempotency_key=p_idempotency_key;
 if found then
  if cached.content_item_id is distinct from p_content_id or cached.revision_id is distinct from p_revision_id or cached.expected_version is distinct from p_expected_version then raise exception 'Publication payload conflict' using errcode='23505';end if;
 else
  insert into public.content_publication_prepare(idempotency_key,content_item_id,revision_id,expected_version) values(p_idempotency_key,p_content_id,p_revision_id,p_expected_version);
  for media in select value from jsonb_array_elements(revision.public_snapshot->'media') loop
   if media->>'storage_bucket'='content-media' then continue;end if;
   if media->>'storage_bucket'<>'content-media-private' then raise exception 'Unknown media source' using errcode='23514';end if;
   select * into session from public.content_media_session where content_item_id=p_content_id and storage_path=media->>'storage_path' and result is not null;
   if not found or session.sha256 is null then raise exception 'Verified media session required' using errcode='23514';end if;
   insert into public.content_public_asset(content_item_id,revision_id,media_id,source_bucket,source_path,public_path,sha256)
   values(p_content_id,p_revision_id,(media->>'id')::uuid,'content-media-private',media->>'storage_path','published/'||p_revision_id::text||'/'||(media->>'id')||case session.mime_type when 'image/jpeg' then '.jpg' when 'image/png' then '.png' else '.webp' end,session.sha256)
   on conflict(revision_id,media_id) do nothing;
  end loop;
 end if;
 return coalesce((select jsonb_agg(to_jsonb(asset) order by asset.id) from public.content_public_asset asset where revision_id=p_revision_id and content_item_id=p_content_id),'[]'::jsonb);
end $$;

create or replace function public.mark_content_public_asset_ready(p_actor_user_id uuid,p_content_id uuid,p_asset_id uuid)
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 perform private.require_content_actor(p_actor_user_id);
 update public.content_public_asset set ready=true where id=p_asset_id and content_item_id=p_content_id;
 if not found then raise exception 'Publication asset not found' using errcode='P0002';end if;
end $$;

create or replace function private.require_ready_content_public_assets()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
declare snapshot jsonb;
begin
 if new.status='published' and (old.status is distinct from new.status or old.published_revision_id is distinct from new.published_revision_id) then
  select public_snapshot into snapshot from public.content_revision where id=new.published_revision_id and content_item_id=new.id;
  if snapshot is null then raise exception 'Published revision required' using errcode='23514';end if;
  if exists(select 1 from jsonb_array_elements(snapshot->'media') media where media->>'storage_bucket'<>'content-media' and not exists(select 1 from public.content_public_asset asset where asset.revision_id=new.published_revision_id and asset.media_id=(media->>'id')::uuid and asset.ready)) then raise exception 'Public media copies are not ready' using errcode='23514';end if;
 end if;
 return new;
end $$;
create trigger require_ready_content_public_assets before update on public.content_item for each row execute function private.require_ready_content_public_assets();

create or replace function private.materialize_published_content_snapshot(p_snapshot jsonb,p_revision_id uuid)
returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_set(p_snapshot,'{media}',coalesce((select jsonb_agg(case when media->>'storage_bucket'='content-media' then media else media||jsonb_build_object('storage_bucket',asset.public_bucket,'storage_path',asset.public_path) end order by ordinal)
 from jsonb_array_elements(p_snapshot->'media') with ordinality as entry(media,ordinal)
 left join public.content_public_asset asset on asset.revision_id=p_revision_id and asset.media_id=(media->>'id')::uuid and asset.ready
 where media->>'storage_bucket'='content-media' or asset.id is not null),'[]'::jsonb))
$$;

revoke all on function public.create_content_media_session(uuid,uuid,integer,text,integer,uuid) from public,anon,authenticated;
revoke all on function public.get_content_media_session(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.finalize_content_media_session(uuid,uuid,uuid,integer,jsonb,text) from public,anon,authenticated;
revoke all on function public.prepare_content_public_assets(uuid,uuid,uuid,integer,text) from public,anon,authenticated;
revoke all on function public.mark_content_public_asset_ready(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function private.require_ready_content_public_assets() from public,anon,authenticated;
revoke all on function private.materialize_published_content_snapshot(jsonb,uuid) from public,anon,authenticated;
grant execute on function public.create_content_media_session(uuid,uuid,integer,text,integer,uuid) to service_role;
grant execute on function public.get_content_media_session(uuid,uuid,uuid) to service_role;
grant execute on function public.finalize_content_media_session(uuid,uuid,uuid,integer,jsonb,text) to service_role;
grant execute on function public.prepare_content_public_assets(uuid,uuid,uuid,integer,text) to service_role;
grant execute on function public.mark_content_public_asset_ready(uuid,uuid,uuid) to service_role;
grant execute on function private.materialize_published_content_snapshot(jsonb,uuid) to service_role;

create or replace function public.read_published_content_snapshots(p_filters jsonb default '{}'::jsonb)
returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
  with filtered as (
    select private.materialize_published_content_snapshot(revision.public_snapshot,revision.id) as snapshot, item.published_at, item.id
    from public.content_item item join public.content_revision revision
      on revision.id=item.published_revision_id and revision.content_item_id=item.id
    where item.status='published'
      and (p_filters->>'slug' is null or revision.public_snapshot->'content'->>'slug'=p_filters->>'slug')
      and (p_filters->>'type' is null or revision.public_snapshot->'content'->>'type'=p_filters->>'type')
      and (p_filters->>'animalType' is null or revision.public_snapshot->'profile'->>'animal_type'=p_filters->>'animalType')
      and (p_filters->>'publicStatus' is null or revision.public_snapshot->'profile'->>'public_status'=p_filters->>'publicStatus')
      and (p_filters->>'rescueRegion' is null or revision.public_snapshot->'profile'->>'rescue_region'=p_filters->>'rescueRegion')
      and (p_filters->>'q' is null or strpos(lower(coalesce(revision.public_snapshot->'content'->>'title','') || ' ' || coalesce(revision.public_snapshot->'content'->>'summary','')),lower(p_filters->>'q'))>0)
  ), page as (
    select * from filtered order by published_at desc nulls last,id
    limit least(50,greatest(1,coalesce((p_filters->>'pageSize')::integer,25)))
    offset (greatest(1,coalesce((p_filters->>'page')::integer,1))-1)*least(50,greatest(1,coalesce((p_filters->>'pageSize')::integer,25)))
  )
  select jsonb_build_object('total',(select count(*) from filtered),
    'rows',coalesce((select jsonb_agg(jsonb_build_object('snapshot',case when p_filters->>'detail'='true' then snapshot else private.content_summary_snapshot(snapshot) end,'published_at',published_at) order by published_at desc nulls last,id) from page),'[]'::jsonb))
$$;
revoke all on function public.read_published_content_snapshots(jsonb) from public,anon,authenticated;
grant execute on function public.read_published_content_snapshots(jsonb) to service_role;

-- Source: 20260905162615_crm_complete_read_models.sql
-- CRM reads execute filtering and aggregation under one SQL snapshot, then bound the output.
-- Private helpers are not callable through PostgREST; only service-role entry points are exposed.

create or replace function private.crm_matching_supporters(p_filters jsonb)
returns setof public.supporter language sql stable set search_path = public, pg_temp as $$
 select s.* from public.supporter s
 where (coalesce((p_filters->>'includeDeleted')::boolean,false) or s.deleted_at is null)
 and (p_filters->>'tag' is null or s.tags @> array[p_filters->>'tag'])
 and (p_filters->>'role' is null or exists(select 1 from public.supporter_role r where r.supporter_id=s.id and r.role=p_filters->>'role'))
 and ((p_filters->>'purpose' is null and p_filters->>'receiptNeeded' is null) or exists(
   select 1 from public.donation d where d.supporter_id=s.id
   and (p_filters->>'purpose' is null or d.purpose=p_filters->>'purpose')
   and (p_filters->>'receiptNeeded' is null or d.receipt_requested=(p_filters->>'receiptNeeded')::boolean)))
 and ((p_filters->>'consentChannel' is null and p_filters->>'consentStatus' is null) or exists(
   select 1 from (select distinct on (c.channel) c.channel,c.status from public.consent c where c.supporter_id=s.id
     order by c.channel,c.timestamp desc,(c.status='opt_out') desc,c.id desc) latest
   where (p_filters->>'consentChannel' is null or latest.channel=p_filters->>'consentChannel')
   and (p_filters->>'consentStatus' is null or latest.status=p_filters->>'consentStatus')))
 and (nullif(trim(p_filters->>'q'),'') is null
   or lower(s.email::text)=lower(trim(p_filters->>'q'))
   or strpos(lower(s.name),lower(trim(p_filters->>'q')))>0
   or strpos(lower(coalesce(s.phone,'')),lower(trim(p_filters->>'q')))>0
   or exists(select 1 from public.donation d where d.supporter_id=s.id and
      (d.id::text=lower(trim(p_filters->>'q')) or d.purpose=trim(p_filters->>'q') or exists(
        select 1 from public.payment p where p.donation_id=d.id and
        (strpos(lower(coalesce(p.provider_ref,'')),lower(trim(p_filters->>'q')))>0 or strpos(lower(coalesce(p.bank_reference,'')),lower(trim(p_filters->>'q')))>0))))
   or exists(select 1 from public.receipt r where r.supporter_id=s.id and strpos(lower(r.receipt_no),lower(trim(p_filters->>'q')))>0));
$$;
revoke all on function private.crm_matching_supporters(jsonb) from public,anon,authenticated;

create or replace function private.crm_supporter_summary(p_supporter_id uuid)
returns jsonb language sql stable set search_path = public, pg_temp as $$
 select jsonb_build_object('id',s.id,'name',s.name,'email',s.email,'phone',s.phone,'language',s.language,'tags',s.tags,'deletedAt',s.deleted_at,
   'roles',coalesce((select jsonb_agg(r.role order by r.role) from public.supporter_role r where r.supporter_id=s.id),'[]'::jsonb),
   'lastGiftAt',last_gift.created_at,'lastGiftAmountCents',last_gift.amount_cents,
   'lifetimeAmountCents',totals.amount,'donationCount',totals.count,'receiptNeeded',totals.receipt,
   'emailConsent',(select c.status from public.consent c where c.supporter_id=s.id and c.channel='email' order by c.timestamp desc,(c.status='opt_out') desc,c.id desc limit 1),
   'whatsappConsent',(select c.status from public.consent c where c.supporter_id=s.id and c.channel='whatsapp' order by c.timestamp desc,(c.status='opt_out') desc,c.id desc limit 1))
 from public.supporter s
 cross join lateral(select coalesce(sum(d.amount_cents) filter(where d.status='succeeded'),0) amount,count(*) count,coalesce(bool_or(d.receipt_requested),false) receipt from public.donation d where d.supporter_id=s.id) totals
 left join lateral(select d.created_at,d.amount_cents from public.donation d where d.supporter_id=s.id and d.status='succeeded' order by d.created_at desc,d.id desc limit 1) last_gift on true
 where s.id=p_supporter_id;
$$;
revoke all on function private.crm_supporter_summary(uuid) from public,anon,authenticated;

create or replace function public.crm_supporter_summary(p_supporter_id uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
 select private.crm_supporter_summary(p_supporter_id);
$$;
revoke all on function public.crm_supporter_summary(uuid) from public,anon,authenticated;
grant execute on function public.crm_supporter_summary(uuid) to service_role;

create or replace function public.crm_read_supporters(p_filters jsonb,p_offset integer default 0,p_limit integer default 25,p_export boolean default false)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
 with matches as materialized(select s.id,s.created_at from private.crm_matching_supporters(p_filters) s),
 total as (select count(*) n from matches),
 page as (select m.id,m.created_at from matches m where not p_export or (select n<=5000 from total)
   order by m.created_at desc,m.id desc offset case when p_export then 0 else greatest(0,p_offset) end
   limit case when p_export then 5000 else least(100,greatest(1,p_limit)) end)
 select jsonb_build_object('total',total.n,'overflow',p_export and total.n>5000,
 'supporters',coalesce((select jsonb_agg(private.crm_supporter_summary(page.id) order by page.created_at desc,page.id desc) from page),'[]'::jsonb)) from total;
$$;
revoke all on function public.crm_read_supporters(jsonb,integer,integer,boolean) from public,anon,authenticated;
grant execute on function public.crm_read_supporters(jsonb,integer,integer,boolean) to service_role;

create or replace function public.crm_export_donations(p_filters jsonb)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
 with matches as materialized(
  select d.*,s.name supporter_name,s.email supporter_email from private.crm_matching_supporters(p_filters) s join public.donation d on d.supporter_id=s.id
  where (p_filters->>'purpose' is null or d.purpose=p_filters->>'purpose')
  and (p_filters->>'receiptNeeded' is null or d.receipt_requested=(p_filters->>'receiptNeeded')::boolean)
 ), total as(select count(*) n from matches),
 page as(select * from matches where (select n<=5000 from total) order by created_at desc,id desc limit 5000)
 select jsonb_build_object('total',total.n,'overflow',total.n>5000,'donations',coalesce((
 select jsonb_agg(jsonb_build_object('supporterId',d.supporter_id,'supporterName',d.supporter_name,'supporterEmail',d.supporter_email,'donationId',d.id,'amountCents',d.amount_cents,
 'purpose',d.purpose,'customPurpose',d.custom_purpose,'status',d.status,'method',d.method,'receiptRequested',d.receipt_requested,'createdAt',d.created_at,
 'receiptNo',(select r.receipt_no from public.receipt r where r.supporter_id=d.supporter_id and r.status='issued' and r.donation_ids @> array[d.id] order by r.issued_at desc,r.id desc limit 1)) order by d.created_at desc,d.id desc) from page d
 ),'[]'::jsonb)) from total;
$$;
revoke all on function public.crm_export_donations(jsonb) from public,anon,authenticated;
grant execute on function public.crm_export_donations(jsonb) to service_role;



-- Source: 20260905163559_content_bounded_authoring_reads.sql
-- Staff reads run only through the authenticated server boundary.
create or replace function public.read_content_admin_summaries(p_filters jsonb default '{}'::jsonb)
returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 with filtered as (
 select item.* from public.content_item item
 where (p_filters->>'type' is null or item.type=p_filters->>'type')
 and (p_filters->>'status' is null or item.status=p_filters->>'status')
 and (p_filters->>'q' is null or strpos(lower(item.title||' '||coalesce(item.summary,'')),lower(p_filters->>'q'))>0)
 and ((p_filters->>'animalType' is null and p_filters->>'publicStatus' is null and p_filters->>'rescueRegion' is null) or exists(select 1 from public.rescue_story_profile profile where profile.content_item_id=item.id
 and (p_filters->>'animalType' is null or profile.animal_type=p_filters->>'animalType')
 and (p_filters->>'publicStatus' is null or profile.public_status=p_filters->>'publicStatus')
 and (p_filters->>'rescueRegion' is null or profile.rescue_region=p_filters->>'rescueRegion')))
 ), page as (
 select item.* from filtered item order by item.updated_at desc,item.id
 limit least(50,greatest(1,coalesce((p_filters->>'pageSize')::int,25)))
 offset (greatest(1,coalesce((p_filters->>'page')::int,1))-1)*least(50,greatest(1,coalesce((p_filters->>'pageSize')::int,25)))
 ), snapshots as (
 select item.id,item.updated_at,jsonb_build_object(
 'content',to_jsonb(item)-'body'-'seo_title'-'seo_description'-'og_title'-'og_description',
 'profile',(select to_jsonb(profile) from public.rescue_story_profile profile where profile.content_item_id=item.id),
 'updates',case when latest.id is null then '[]'::jsonb else jsonb_build_array(to_jsonb(latest)-'body') end,
 'media',case when cover.id is null then '[]'::jsonb else jsonb_build_array(to_jsonb(cover)) end
 ) as snapshot
 from page item
 left join lateral (select u.* from public.story_update u where u.content_item_id=item.id and u.is_authoring_active and u.visibility='public' order by u.occurred_at desc,u.id limit 1) latest on true
 left join lateral (select m.* from public.content_media m where m.content_item_id=item.id
 and (m.story_update_id is null or exists(select 1 from public.story_update u where u.id=m.story_update_id and u.content_item_id=item.id and u.is_authoring_active and u.visibility='public'))
 and (m.id=item.cover_media_id or m.is_cover)
 order by (m.id=item.cover_media_id) desc nulls last,m.sort_order,m.created_at,m.id limit 1) cover on true
 ) select jsonb_build_object('total',(select count(*) from filtered),'rows',coalesce((select jsonb_agg(snapshot order by updated_at desc,id) from snapshots),'[]'::jsonb))
$$;

create or replace function public.read_content_authoring_detail(p_content_id uuid,p_history_page integer default 1)
returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare item public.content_item%rowtype;page_offset integer;links jsonb;media jsonb;updates jsonb;copies jsonb;drafts jsonb;
begin
 if p_history_page is null or p_history_page<1 or p_history_page>100000 then raise exception 'Invalid history page' using errcode='22023';end if;
 select * into item from public.content_item where id=p_content_id;
 if not found then return null;end if;
 page_offset:=(p_history_page-1)*20;
 select coalesce(jsonb_agg(to_jsonb(row)),'[]'::jsonb) into links from (select * from public.content_link where content_item_id=p_content_id order by created_at,id limit 21 offset page_offset) row;
 select coalesce(jsonb_agg(to_jsonb(row)),'[]'::jsonb) into media from (select * from public.content_media where content_item_id=p_content_id order by sort_order,created_at,id limit 21 offset page_offset) row;
 select coalesce(jsonb_agg(to_jsonb(row)-'body'),'[]'::jsonb) into updates from (select * from public.story_update where content_item_id=p_content_id and is_authoring_active order by occurred_at desc,id limit 21 offset page_offset) row;
 select coalesce(jsonb_agg(to_jsonb(row)),'[]'::jsonb) into copies from (select * from public.social_copy_variant where content_item_id=p_content_id order by created_at desc,id limit 21 offset page_offset) row;
 select coalesce(jsonb_agg(to_jsonb(row)),'[]'::jsonb) into drafts from (select * from public.recipient_notification_draft where content_item_id=p_content_id order by created_at desc,id limit 21 offset page_offset) row;
 return jsonb_build_object('content',to_jsonb(item),'profile',(select to_jsonb(profile) from public.rescue_story_profile profile where profile.content_item_id=p_content_id),'cover',(select to_jsonb(m) from public.content_media m where m.id=item.cover_media_id and m.content_item_id=p_content_id),'latest',(select to_jsonb(u)-'body' from public.story_update u where u.content_item_id=p_content_id and u.is_authoring_active and u.visibility='public' order by u.occurred_at desc,u.id limit 1),'links',links,'media',media,'updates',updates,'socialCopies',copies,'notificationDrafts',drafts);
end $$;
revoke all on function public.read_content_admin_summaries(jsonb) from public,anon,authenticated;
revoke all on function public.read_content_authoring_detail(uuid,integer) from public,anon,authenticated;
grant execute on function public.read_content_admin_summaries(jsonb) to service_role;
grant execute on function public.read_content_authoring_detail(uuid,integer) to service_role;

do $$ begin
 if exists(select 1 from public.payment_public_config where state <> 'draft' or is_publicly_visible or published_at is not null) then
  raise exception 'Unexpected public payment configuration';
 end if;
 if exists(select 1 from public.content_item where status='published' and published_revision_id is null) then
  raise exception 'Published content backfill incomplete';
 end if;
end $$;
commit;
