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
