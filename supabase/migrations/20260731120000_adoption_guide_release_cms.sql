alter table public.knowledge_posts add column if not exists zh_hk_document_asset_id uuid
  references public.document_assets(id) on delete restrict;
alter table public.knowledge_posts add column if not exists en_document_asset_id uuid
  references public.document_assets(id) on delete restrict;

alter table public.knowledge_posts
  drop constraint if exists knowledge_posts_single_destination_check;
alter table public.knowledge_posts
  drop constraint if exists knowledge_posts_destination_shape_check;
alter table public.knowledge_posts
  add constraint knowledge_posts_destination_shape_check check (
    ((external_url is not null)::integer
      + (document_asset_id is not null)::integer
      + ((zh_hk_document_asset_id is not null and en_document_asset_id is not null))::integer) = 1
    and ((zh_hk_document_asset_id is null) = (en_document_asset_id is null))
  );

create table if not exists public.adoption_guide_releases (
  id uuid primary key default gen_random_uuid(),
  topic text not null check (topic ~ '^[a-z0-9_]+$'),
  species text not null check (species in ('cat', 'dog', 'general')),
  zh_hk_asset_id uuid references public.document_assets(id) on delete restrict,
  en_asset_id uuid references public.document_assets(id) on delete restrict,
  knowledge_post_id uuid references public.knowledge_posts(id) on delete restrict,
  knowledge_title text not null default '' check (char_length(knowledge_title) <= 180),
  knowledge_topic text not null default '' check (char_length(knowledge_topic) <= 120),
  knowledge_short_intro text not null default '' check (char_length(knowledge_short_intro) <= 500),
  knowledge_source_name text check (
    knowledge_source_name is null or char_length(knowledge_source_name) <= 120
  ),
  sort_order integer not null default 0 check (sort_order >= 0),
  state text not null default 'draft'
    check (state in ('draft', 'in_review', 'published', 'archived')),
  version integer not null default 1 check (version > 0),
  created_by uuid not null references public.admin_user(id) on delete restrict,
  updated_by uuid not null references public.admin_user(id) on delete restrict,
  submitted_by uuid references public.admin_user(id) on delete restrict,
  submitted_at timestamptz,
  published_by uuid references public.admin_user(id) on delete restrict,
  published_at timestamptz,
  archived_by uuid references public.admin_user(id) on delete restrict,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists adoption_guide_one_published_idx
  on public.adoption_guide_releases (topic, species)
  where state = 'published';

create index if not exists adoption_guide_releases_admin_list_idx
  on public.adoption_guide_releases (updated_at desc, id);

create table if not exists public.adoption_guide_publish_requests (
  idempotency_key text primary key check (char_length(idempotency_key) between 16 and 200),
  release_id uuid not null references public.adoption_guide_releases(id) on delete restrict,
  release_version integer not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.adoption_guide_releases enable row level security;
alter table public.adoption_guide_publish_requests enable row level security;

grant select, insert, update, delete on public.adoption_guide_releases to service_role;
grant select, insert, update, delete on public.adoption_guide_publish_requests to service_role;
revoke all on public.adoption_guide_releases from anon, authenticated;
revoke all on public.adoption_guide_publish_requests from anon, authenticated;

drop policy if exists "staff can read adoption guide releases" on public.adoption_guide_releases;
create policy "staff can read adoption guide releases"
  on public.adoption_guide_releases for select
  to authenticated
  using (private.has_admin_role(array['staff', 'admin']));

drop policy if exists "staff can create draft adoption guide releases" on public.adoption_guide_releases;
create policy "staff can create draft adoption guide releases"
  on public.adoption_guide_releases for insert
  to authenticated
  with check (
    state = 'draft'
    and private.has_admin_role(array['staff', 'admin'])
    and exists (
      select 1
      from public.admin_user actor
      where actor.id = created_by
        and actor.id = updated_by
        and actor.auth_user_id = auth.uid()
        and actor.status = 'active'
        and actor.role in ('staff', 'admin')
    )
  );

drop policy if exists "staff can update draft adoption guide releases" on public.adoption_guide_releases;
create policy "staff can update draft adoption guide releases"
  on public.adoption_guide_releases for update
  to authenticated
  using (state = 'draft' and private.has_admin_role(array['staff', 'admin']))
  with check (
    state = 'draft'
    and private.has_admin_role(array['staff', 'admin'])
    and exists (
      select 1
      from public.admin_user actor
      where actor.id = updated_by
        and actor.auth_user_id = auth.uid()
        and actor.status = 'active'
        and actor.role in ('staff', 'admin')
    )
  );

drop policy if exists "staff can delete draft adoption guide releases" on public.adoption_guide_releases;
create policy "staff can delete draft adoption guide releases"
  on public.adoption_guide_releases for delete
  to authenticated
  using (state = 'draft' and private.has_admin_role(array['staff', 'admin']));

drop trigger if exists set_updated_at on public.adoption_guide_releases;
create trigger set_updated_at
before update on public.adoption_guide_releases
for each row execute function public.set_updated_at();

create or replace function private.assert_adoption_guide_release_assets(
  p_zh_hk_asset_id uuid,
  p_en_asset_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  zh_asset public.document_assets%rowtype;
  en_asset public.document_assets%rowtype;
begin
  if p_zh_hk_asset_id is null or p_en_asset_id is null then
    raise exception 'Both adoption guide assets are required' using errcode = '23514';
  end if;

  select * into zh_asset
  from public.document_assets
  where id = p_zh_hk_asset_id
  for update;

  if not found
    or zh_asset.kind <> 'adoption_guide'
    or zh_asset.language <> 'zh-HK'
    or zh_asset.mime_type <> 'application/pdf'
  then
    raise exception 'Invalid zh-HK adoption guide PDF' using errcode = '23514';
  end if;

  if not zh_asset.is_published and not exists (
    select 1
    from storage.objects object
    where object.bucket_id = zh_asset.bucket_name
      and object.name = zh_asset.object_path
  ) then
    raise exception 'zh-HK adoption guide PDF is not present in storage' using errcode = '23514';
  end if;

  select * into en_asset
  from public.document_assets
  where id = p_en_asset_id
  for update;

  if not found
    or en_asset.kind <> 'adoption_guide'
    or en_asset.language <> 'en'
    or en_asset.mime_type <> 'application/pdf'
  then
    raise exception 'Invalid English adoption guide PDF' using errcode = '23514';
  end if;

  if not en_asset.is_published and not exists (
    select 1
    from storage.objects object
    where object.bucket_id = en_asset.bucket_name
      and object.name = en_asset.object_path
  ) then
    raise exception 'English adoption guide PDF is not present in storage' using errcode = '23514';
  end if;
end;
$$;

create or replace function public.mutate_adoption_guide_release_with_audit(
  p_actor_user_id uuid,
  p_operation text,
  p_release_id uuid,
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
  current_release public.adoption_guide_releases%rowtype;
  result_release public.adoption_guide_releases%rowtype;
  result jsonb;
begin
  select * into actor
  from public.admin_user
  where auth_user_id = p_actor_user_id
    and status = 'active'
    and role in ('staff', 'admin');

  if not found then
    raise exception 'Active staff or admin actor required' using errcode = '42501';
  end if;

  if p_operation = 'create' then
    insert into public.adoption_guide_releases (
      topic,
      species,
      zh_hk_asset_id,
      en_asset_id,
      knowledge_title,
      knowledge_topic,
      knowledge_short_intro,
      knowledge_source_name,
      sort_order,
      created_by,
      updated_by
    ) values (
      p_values->>'topic',
      p_values->>'species',
      (p_values->>'zh_hk_asset_id')::uuid,
      (p_values->>'en_asset_id')::uuid,
      coalesce(p_values->>'knowledge_title', ''),
      coalesce(p_values->>'knowledge_topic', ''),
      coalesce(p_values->>'knowledge_short_intro', ''),
      p_values->>'knowledge_source_name',
      coalesce((p_values->>'sort_order')::integer, 0),
      actor.id,
      actor.id
    )
    returning * into result_release;
  else
    if p_release_id is null or p_expected_version is null then
      raise exception 'Release id and expected version are required' using errcode = '22023';
    end if;

    select * into current_release
    from public.adoption_guide_releases
    where id = p_release_id
    for update;

    if not found then
      raise exception 'Adoption guide release not found' using errcode = 'P0002';
    end if;
    if current_release.version <> p_expected_version then
      raise exception 'Stale adoption guide release version' using errcode = '40001';
    end if;

    if p_operation = 'update' then
      if current_release.state <> 'draft' then
        raise exception 'Only draft adoption guide releases can be edited' using errcode = '23514';
      end if;

      update public.adoption_guide_releases set
        topic = case when p_values ? 'topic' then p_values->>'topic' else topic end,
        species = case when p_values ? 'species' then p_values->>'species' else species end,
        zh_hk_asset_id = case when p_values ? 'zh_hk_asset_id' then (p_values->>'zh_hk_asset_id')::uuid else zh_hk_asset_id end,
        en_asset_id = case when p_values ? 'en_asset_id' then (p_values->>'en_asset_id')::uuid else en_asset_id end,
        knowledge_title = case when p_values ? 'knowledge_title' then coalesce(p_values->>'knowledge_title', '') else knowledge_title end,
        knowledge_topic = case when p_values ? 'knowledge_topic' then coalesce(p_values->>'knowledge_topic', '') else knowledge_topic end,
        knowledge_short_intro = case when p_values ? 'knowledge_short_intro' then coalesce(p_values->>'knowledge_short_intro', '') else knowledge_short_intro end,
        knowledge_source_name = case when p_values ? 'knowledge_source_name' then p_values->>'knowledge_source_name' else knowledge_source_name end,
        sort_order = case when p_values ? 'sort_order' then (p_values->>'sort_order')::integer else sort_order end,
        updated_by = actor.id,
        version = version + 1
      where id = p_release_id
      returning * into result_release;
    elsif p_operation = 'submit' then
      if current_release.state <> 'draft' then
        raise exception 'Only draft adoption guide releases can be submitted' using errcode = '23514';
      end if;
      if nullif(btrim(current_release.knowledge_title), '') is null
        or nullif(btrim(current_release.knowledge_topic), '') is null
        or nullif(btrim(current_release.knowledge_short_intro), '') is null
      then
        raise exception 'Adoption guide knowledge metadata is incomplete' using errcode = '23514';
      end if;

      perform private.assert_adoption_guide_release_assets(
        current_release.zh_hk_asset_id,
        current_release.en_asset_id
      );

      update public.adoption_guide_releases set
        state = 'in_review',
        submitted_by = actor.id,
        submitted_at = now(),
        updated_by = actor.id,
        version = version + 1
      where id = p_release_id
      returning * into result_release;
    elsif p_operation = 'withdraw' then
      if current_release.state <> 'in_review' then
        raise exception 'Only in-review adoption guide releases can be withdrawn' using errcode = '23514';
      end if;

      update public.adoption_guide_releases set
        state = 'draft',
        submitted_by = null,
        submitted_at = null,
        updated_by = actor.id,
        version = version + 1
      where id = p_release_id
      returning * into result_release;
    elsif p_operation = 'return_to_draft' then
      if actor.role <> 'admin' then
        raise exception 'Admin actor required to return a release' using errcode = '42501';
      end if;
      if current_release.state <> 'in_review' then
        raise exception 'Only in-review adoption guide releases can be returned' using errcode = '23514';
      end if;

      update public.adoption_guide_releases set
        state = 'draft',
        submitted_by = null,
        submitted_at = null,
        updated_by = actor.id,
        version = version + 1
      where id = p_release_id
      returning * into result_release;
    elsif p_operation = 'delete' then
      if current_release.state <> 'draft' then
        raise exception 'Only draft adoption guide releases can be deleted' using errcode = '23514';
      end if;

      delete from public.adoption_guide_releases
      where id = p_release_id;
      result := jsonb_build_object(
        'id', current_release.id,
        'version', current_release.version,
        'deleted', true
      );
    else
      raise exception 'Unsupported adoption guide release operation' using errcode = '22023';
    end if;
  end if;

  if result is null then
    result := to_jsonb(result_release);
  end if;

  insert into public.audit_log (actor_user_id, action, entity, entity_id, detail)
  values (
    p_actor_user_id,
    'adoption_guide_release.' || p_operation,
    'adoption_guide_release',
    coalesce(result_release.id, current_release.id)::text,
    jsonb_build_object(
      'expected_version', p_expected_version,
      'result_version', coalesce(result_release.version, current_release.version),
      'values', coalesce(p_values, '{}'::jsonb)
    )
  );

  return result;
end;
$$;

create or replace function public.publish_adoption_guide_release(
  p_release_id uuid,
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
  release_to_publish public.adoption_guide_releases%rowtype;
  previous_release public.adoption_guide_releases%rowtype;
  cached_request public.adoption_guide_publish_requests%rowtype;
  old_zh_hk_asset_id uuid;
  old_en_asset_id uuid;
  paired_knowledge_post_id uuid;
  target_slot_key text;
  result jsonb;
begin
  select * into actor
  from public.admin_user
  where auth_user_id = p_actor_user_id
    and status = 'active'
    and role = 'admin';

  if not found then
    raise exception 'Active admin actor required' using errcode = '42501';
  end if;

  if p_idempotency_key is null
    or char_length(p_idempotency_key) not between 16 and 200
  then
    raise exception 'Invalid publish idempotency key' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key, 0));

  select * into cached_request
  from public.adoption_guide_publish_requests
  where idempotency_key = p_idempotency_key
  for update;

  if found then
    if cached_request.release_id <> p_release_id
      or cached_request.release_version <> p_expected_version
    then
      raise exception 'Publish idempotency key was already used for another release version'
        using errcode = '23505';
    end if;
    return cached_request.result;
  end if;

  select * into release_to_publish
  from public.adoption_guide_releases
  where id = p_release_id
  for update;

  if not found then
    raise exception 'Adoption guide release not found' using errcode = 'P0002';
  end if;
  if release_to_publish.version <> p_expected_version then
    raise exception 'Stale adoption guide release version' using errcode = '40001';
  end if;
  if release_to_publish.state <> 'in_review' then
    raise exception 'Only in-review adoption guide releases can be published' using errcode = '23514';
  end if;
  if nullif(btrim(release_to_publish.knowledge_title), '') is null
    or nullif(btrim(release_to_publish.knowledge_topic), '') is null
    or nullif(btrim(release_to_publish.knowledge_short_intro), '') is null
  then
    raise exception 'Adoption guide knowledge metadata is incomplete' using errcode = '23514';
  end if;

  target_slot_key := case release_to_publish.species
    when 'cat' then 'post_adoption_guide_cat'
    when 'dog' then 'post_adoption_guide_dog'
    when 'general' then 'post_adoption_guide_general'
    else null
  end;

  if target_slot_key is null then
    raise exception 'Unsupported adoption guide species' using errcode = '23514';
  end if;

  select * into previous_release
  from public.adoption_guide_releases
  where topic = release_to_publish.topic
    and species = release_to_publish.species
    and state = 'published'
    and id <> release_to_publish.id
  for update;

  select document_asset_id into old_zh_hk_asset_id
  from public.site_document_slots slots
  where slots.slot_key = target_slot_key
    and language = 'zh-HK'
  for update;

  select document_asset_id into old_en_asset_id
  from public.site_document_slots slots
  where slots.slot_key = target_slot_key
    and language = 'en'
  for update;

  perform private.assert_adoption_guide_release_assets(
    release_to_publish.zh_hk_asset_id,
    release_to_publish.en_asset_id
  );

  update public.document_assets
  set is_published = true,
      updated_at = now()
  where id in (release_to_publish.zh_hk_asset_id, release_to_publish.en_asset_id);

  if release_to_publish.knowledge_post_id is null then
    insert into public.knowledge_posts (
      title,
      topic,
      short_intro,
      external_url,
      document_asset_id,
      zh_hk_document_asset_id,
      en_document_asset_id,
      source_name,
      is_published,
      sort_order
    ) values (
      release_to_publish.knowledge_title,
      release_to_publish.knowledge_topic,
      release_to_publish.knowledge_short_intro,
      null,
      null,
      release_to_publish.zh_hk_asset_id,
      release_to_publish.en_asset_id,
      release_to_publish.knowledge_source_name,
      true,
      release_to_publish.sort_order
    )
    returning id into paired_knowledge_post_id;
  else
    perform 1
    from public.knowledge_posts
    where id = release_to_publish.knowledge_post_id
    for update;

    update public.knowledge_posts set
      title = release_to_publish.knowledge_title,
      topic = release_to_publish.knowledge_topic,
      short_intro = release_to_publish.knowledge_short_intro,
      external_url = null,
      document_asset_id = null,
      zh_hk_document_asset_id = release_to_publish.zh_hk_asset_id,
      en_document_asset_id = release_to_publish.en_asset_id,
      source_name = release_to_publish.knowledge_source_name,
      is_published = true,
      sort_order = release_to_publish.sort_order,
      updated_at = now()
    where id = release_to_publish.knowledge_post_id
    returning id into paired_knowledge_post_id;

    if paired_knowledge_post_id is null then
      raise exception 'Adoption guide Knowledge post not found' using errcode = 'P0002';
    end if;
  end if;

  update public.knowledge_posts
  set is_published = false,
      updated_at = now()
  where id <> paired_knowledge_post_id
    and (
      document_asset_id in (old_zh_hk_asset_id, old_en_asset_id)
      or zh_hk_document_asset_id in (old_zh_hk_asset_id, old_en_asset_id)
      or en_document_asset_id in (old_zh_hk_asset_id, old_en_asset_id)
      or id = previous_release.knowledge_post_id
    );

  insert into public.site_document_slots (
    slot_key,
    language,
    document_asset_id,
    is_published
  ) values
    (target_slot_key, 'zh-HK', release_to_publish.zh_hk_asset_id, true),
    (target_slot_key, 'en', release_to_publish.en_asset_id, true)
  on conflict (slot_key, language) do update set
    document_asset_id = excluded.document_asset_id,
    is_published = true,
    updated_at = now();

  if previous_release.id is not null then
    update public.adoption_guide_releases set
      state = 'archived',
      archived_by = actor.id,
      archived_at = now(),
      updated_by = actor.id,
      version = version + 1
    where id = previous_release.id;

    insert into public.audit_log (actor_user_id, action, entity, entity_id, detail)
    values (
      p_actor_user_id,
      'adoption_guide_release.archive',
      'adoption_guide_release',
      previous_release.id::text,
      jsonb_build_object('replaced_by_release_id', release_to_publish.id)
    );
  end if;

  update public.adoption_guide_releases set
    knowledge_post_id = paired_knowledge_post_id,
    state = 'published',
    published_by = actor.id,
    published_at = now(),
    archived_by = null,
    archived_at = null,
    updated_by = actor.id,
    version = version + 1
  where id = release_to_publish.id
  returning * into release_to_publish;

  insert into public.audit_log (actor_user_id, action, entity, entity_id, detail)
  values
    (
      p_actor_user_id,
      'document.publish',
      'document_asset',
      release_to_publish.zh_hk_asset_id::text,
      jsonb_build_object('release_id', release_to_publish.id, 'language', 'zh-HK')
    ),
    (
      p_actor_user_id,
      'document.publish',
      'document_asset',
      release_to_publish.en_asset_id::text,
      jsonb_build_object('release_id', release_to_publish.id, 'language', 'en')
    ),
    (
      p_actor_user_id,
      'knowledge_post.publish',
      'knowledge_post',
      paired_knowledge_post_id::text,
      jsonb_build_object('release_id', release_to_publish.id)
    ),
    (
      p_actor_user_id,
      'adoption_guide_release.publish',
      'adoption_guide_release',
      release_to_publish.id::text,
      jsonb_build_object(
        'previous_release_id', previous_release.id,
        'slot_key', target_slot_key,
        'version', release_to_publish.version
      )
    );

  result := jsonb_build_object(
    'release_id', release_to_publish.id,
    'release_version', release_to_publish.version,
    'knowledge_post_id', paired_knowledge_post_id,
    'zh_hk_asset_id', release_to_publish.zh_hk_asset_id,
    'en_asset_id', release_to_publish.en_asset_id,
    'slot_key', target_slot_key
  );

  insert into public.adoption_guide_publish_requests (
    idempotency_key,
    release_id,
    release_version,
    result
  ) values (
    p_idempotency_key,
    release_to_publish.id,
    p_expected_version,
    result
  );

  return result;
end;
$$;

revoke all on function private.assert_adoption_guide_release_assets(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.mutate_adoption_guide_release_with_audit(uuid, text, uuid, integer, jsonb)
  from public, anon, authenticated;
revoke all on function public.publish_adoption_guide_release(uuid, integer, uuid, text)
  from public, anon, authenticated;

grant insert on public.audit_log to service_role;
grant execute on function private.assert_adoption_guide_release_assets(uuid, uuid)
  to service_role;
grant execute on function public.mutate_adoption_guide_release_with_audit(uuid, text, uuid, integer, jsonb)
  to service_role;
grant execute on function public.publish_adoption_guide_release(uuid, integer, uuid, text)
  to service_role;
