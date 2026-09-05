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
