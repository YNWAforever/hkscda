-- T19: bounded, fair repair for committed animal and content publication media.
-- Keep the original publish-before-public copy intent and synchronous RPC signatures.

alter table public.animal_publication_media_copy
  add column repair_status text not null default 'pending',
  add column repair_attempts integer not null default 0,
  add column next_retry_at timestamptz default (pg_catalog.clock_timestamp() + interval '5 minutes'),
  add column last_error_code text,
  add column lease_token uuid,
  add constraint animal_media_repair_status_check check (repair_status in ('pending','claimed','completed','failed')),
  add constraint animal_media_repair_attempts_check check (repair_attempts between 0 and 8);

alter table public.content_public_asset
  add column repair_status text not null default 'pending',
  add column repair_attempts integer not null default 0,
  add column next_retry_at timestamptz default (pg_catalog.clock_timestamp() + interval '5 minutes'),
  add column last_error_code text,
  add column lease_token uuid,
  add constraint content_media_repair_status_check check (repair_status in ('pending','claimed','completed','failed')),
  add constraint content_media_repair_attempts_check check (repair_attempts between 0 and 8);

update public.animal_publication_media_copy
set repair_status = case when copied_at is not null then 'completed'
                         when copy_claimed_at is not null then 'claimed'
                         else 'pending' end,
    next_retry_at = case when copied_at is not null then null
                         when copy_claimed_at is not null then copy_claimed_at + interval '1 hour'
                         else created_at + interval '5 minutes' end;
update public.content_public_asset
set repair_status = case when ready then 'completed'
                         when copy_claimed_at is not null then 'claimed'
                         else 'pending' end,
    next_retry_at = case when ready then null
                         when copy_claimed_at is not null then copy_claimed_at + interval '1 hour'
                         else created_at + interval '5 minutes' end;

create index animal_media_repair_due_idx
  on public.animal_publication_media_copy(next_retry_at,created_at,public_path)
  where copied_at is null and repair_status in ('pending','claimed');
create index content_media_repair_due_idx
  on public.content_public_asset(next_retry_at,created_at,id)
  where ready=false and repair_status in ('pending','claimed');

drop function public.claim_due_animal_publication_media_copies(timestamptz,integer);
create function public.claim_due_animal_publication_media_copies(
  p_cutoff timestamptz,p_limit integer default 50
) returns table(source_path text,public_path text,claimed_at timestamptz,lease_token uuid,attempts integer)
language plpgsql security invoker set search_path='' as $$
begin
  update public.animal_publication_media_copy media
  set repair_status='failed',last_error_code=coalesce(media.last_error_code,'lease_expired'),
      next_retry_at=null,copy_claimed_at=null,lease_token=null
  where media.copied_at is null and media.repair_status='claimed'
    and media.repair_attempts>=8 and media.next_retry_at<=pg_catalog.clock_timestamp();
  return query
    with candidates as (
      select media.public_path from public.animal_publication_media_copy media
      where media.copied_at is null and media.created_at<p_cutoff
        and media.repair_status in ('pending','claimed')
        and media.repair_attempts<8 and media.next_retry_at<=pg_catalog.clock_timestamp()
      order by media.next_retry_at,media.created_at,media.public_path
      limit least(greatest(coalesce(p_limit,50),1),50)
      for update skip locked
    )
    update public.animal_publication_media_copy media
    set copy_claimed_at=pg_catalog.clock_timestamp(),lease_token=pg_catalog.gen_random_uuid(),
        repair_status='claimed',repair_attempts=media.repair_attempts+1,
        next_retry_at=pg_catalog.clock_timestamp()+interval '1 hour'
    from candidates
    where media.public_path=candidates.public_path
    returning media.source_path,media.public_path,media.copy_claimed_at,
              media.lease_token,media.repair_attempts;
end $$;
revoke all on function public.claim_due_animal_publication_media_copies(timestamptz,integer) from public,anon,authenticated;
grant execute on function public.claim_due_animal_publication_media_copies(timestamptz,integer) to service_role;

create or replace function public.claim_due_content_public_assets(
  p_cutoff timestamptz,p_limit integer default 50
) returns setof public.content_public_asset
language plpgsql security invoker set search_path='' as $$
begin
  update public.content_public_asset asset
  set repair_status='failed',last_error_code=coalesce(asset.last_error_code,'lease_expired'),
      next_retry_at=null,copy_claimed_at=null,lease_token=null
  where asset.ready=false and asset.repair_status='claimed'
    and asset.repair_attempts>=8 and asset.next_retry_at<=pg_catalog.clock_timestamp();
  return query
    with candidates as (
      select asset.id from public.content_public_asset asset
      join public.content_item item on item.id=asset.content_item_id
        and item.status='published' and item.published_revision_id=asset.revision_id
      where asset.ready=false and asset.created_at<p_cutoff
        and asset.repair_status in ('pending','claimed')
        and asset.repair_attempts<8 and asset.next_retry_at<=pg_catalog.clock_timestamp()
      order by asset.next_retry_at,asset.created_at,asset.id
      limit least(greatest(coalesce(p_limit,50),1),50)
      for update of asset skip locked
    )
    update public.content_public_asset asset
    set copy_claimed_at=pg_catalog.clock_timestamp(),lease_token=pg_catalog.gen_random_uuid(),
        repair_status='claimed',repair_attempts=asset.repair_attempts+1,
        next_retry_at=pg_catalog.clock_timestamp()+interval '1 hour'
    from candidates where asset.id=candidates.id
    returning asset.*;
end $$;
revoke all on function public.claim_due_content_public_assets(timestamptz,integer) from public,anon,authenticated;
grant execute on function public.claim_due_content_public_assets(timestamptz,integer) to service_role;

-- Legacy synchronous copies remain valid across schema-first deployment.
create or replace function public.mark_animal_publication_media_copied(
  p_public_path text,p_claimed_at timestamptz default null
) returns boolean language plpgsql security invoker set search_path='' as $$
begin
  update public.animal_publication_media_copy
  set copied_at=pg_catalog.clock_timestamp(),copy_claimed_at=null,
      repair_status='completed',next_retry_at=null,lease_token=null
  where public_path=p_public_path and copied_at is null
    and ((p_claimed_at is null and copy_claimed_at is null) or copy_claimed_at=p_claimed_at);
  if found then return true; end if;
  return exists(select 1 from public.animal_publication_media_copy
                where public_path=p_public_path and copied_at is not null);
end $$;

create or replace function public.mark_claimed_content_public_asset_ready(
  p_asset_id uuid,p_claimed_at timestamptz
) returns boolean language plpgsql security invoker set search_path='' as $$
begin
  update public.content_public_asset
  set ready=true,copy_claimed_at=null,repair_status='completed',
      next_retry_at=null,lease_token=null
  where id=p_asset_id and ready=false and copy_claimed_at=p_claimed_at;
  if found then return true; end if;
  return exists(select 1 from public.content_public_asset where id=p_asset_id and ready=true);
end $$;

create function public.mark_repaired_animal_publication_media(
  p_public_path text,p_lease_token uuid
) returns boolean language plpgsql security invoker set search_path='' as $$
begin
  update public.animal_publication_media_copy
  set copied_at=pg_catalog.clock_timestamp(),copy_claimed_at=null,
      repair_status='completed',next_retry_at=null,lease_token=null,last_error_code=null
  where public_path=p_public_path and copied_at is null
    and repair_status='claimed' and lease_token=p_lease_token;
  return found;
end $$;
create function public.mark_repaired_content_public_asset(
  p_asset_id uuid,p_lease_token uuid
) returns boolean language plpgsql security invoker set search_path='' as $$
begin
  update public.content_public_asset
  set ready=true,copy_claimed_at=null,repair_status='completed',
      next_retry_at=null,lease_token=null,last_error_code=null
  where id=p_asset_id and ready=false
    and repair_status='claimed' and lease_token=p_lease_token;
  return found;
end $$;

create function public.fail_animal_publication_media_copy(
  p_public_path text,p_lease_token uuid,p_next_retry_at timestamptz,p_error_code text
) returns boolean language plpgsql security invoker set search_path='' as $$
begin
  if p_error_code !~ '^[a-z_]{1,40}$' or p_next_retry_at is null
    or p_next_retry_at <= pg_catalog.clock_timestamp()
    or p_next_retry_at > pg_catalog.clock_timestamp() + interval '6 hours 1 minute' then
    raise exception 'Invalid repair failure' using errcode='22023';
  end if;
  update public.animal_publication_media_copy media
  set repair_status=case when media.repair_attempts>=8 then 'failed' else 'pending' end,
      next_retry_at=case when media.repair_attempts>=8 then null else p_next_retry_at end,
      last_error_code=p_error_code,copy_claimed_at=null,lease_token=null
  where media.public_path=p_public_path and media.copied_at is null
    and media.repair_status='claimed' and media.lease_token=p_lease_token;
  return found;
end $$;
create function public.fail_content_public_asset_copy(
  p_asset_id uuid,p_lease_token uuid,p_next_retry_at timestamptz,p_error_code text
) returns boolean language plpgsql security invoker set search_path='' as $$
begin
  if p_error_code !~ '^[a-z_]{1,40}$' or p_next_retry_at is null
    or p_next_retry_at <= pg_catalog.clock_timestamp()
    or p_next_retry_at > pg_catalog.clock_timestamp() + interval '6 hours 1 minute' then
    raise exception 'Invalid repair failure' using errcode='22023';
  end if;
  update public.content_public_asset asset
  set repair_status=case when asset.repair_attempts>=8 then 'failed' else 'pending' end,
      next_retry_at=case when asset.repair_attempts>=8 then null else p_next_retry_at end,
      last_error_code=p_error_code,copy_claimed_at=null,lease_token=null
  where asset.id=p_asset_id and asset.ready=false
    and asset.repair_status='claimed' and asset.lease_token=p_lease_token;
  return found;
end $$;

revoke all on function public.mark_repaired_animal_publication_media(text,uuid),
  public.mark_repaired_content_public_asset(uuid,uuid),
  public.fail_animal_publication_media_copy(text,uuid,timestamptz,text),
  public.fail_content_public_asset_copy(uuid,uuid,timestamptz,text) from public,anon,authenticated;
grant execute on function public.mark_repaired_animal_publication_media(text,uuid),
  public.mark_repaired_content_public_asset(uuid,uuid),
  public.fail_animal_publication_media_copy(text,uuid,timestamptz,text),
  public.fail_content_public_asset_copy(uuid,uuid,timestamptz,text) to service_role;

-- Staff-only, bounded queue view. Private source paths are deliberately omitted.
create function public.get_media_repair_backlog(p_actor_user_id uuid,p_limit integer default 25)
returns jsonb language plpgsql volatile security invoker set search_path=public,pg_temp as $$
declare
  result jsonb;
begin
  perform private.require_content_actor(p_actor_user_id);
  if p_limit not between 1 and 50 then
    raise exception 'Invalid queue limit' using errcode='22023';
  end if;
  with queue as (
    select 'animal'::text kind,media.public_path item_id,media.animal_id entity_id,
      media.repair_status status,media.repair_attempts attempts,
      media.next_retry_at,media.last_error_code,media.created_at
    from public.animal_publication_media_copy media where media.copied_at is null
    union all
    select 'content',asset.id::text,asset.content_item_id,asset.repair_status,
      asset.repair_attempts,asset.next_retry_at,asset.last_error_code,asset.created_at
    from public.content_public_asset asset where asset.ready=false
  ), paged as (
    select * from queue
    order by case when status='failed' then 0 else 1 end,
      next_retry_at nulls last,created_at,item_id limit p_limit
  )
  select jsonb_build_object(
    'pending',(select count(*) from queue where status='pending'),
    'claimed',(select count(*) from queue where status='claimed'),
    'failed',(select count(*) from queue where status='failed'),
    'oldestAgeSeconds',coalesce((select greatest(0,extract(epoch from pg_catalog.clock_timestamp()-min(created_at))::integer) from queue),0),
    'items',coalesce((select jsonb_agg(jsonb_build_object(
      'kind',kind,'itemId',item_id,'entityId',entity_id,'status',status,
      'attempts',attempts,'nextRetryAt',next_retry_at,'lastErrorCode',last_error_code,
      'createdAt',created_at) order by case when status='failed' then 0 else 1 end,
      next_retry_at nulls last,created_at,item_id) from paged),'[]'::jsonb)
  ) into result;
  return result;
end $$;

-- Manual retry is a new audited command after an operator has corrected the cause.
create function public.retry_failed_media_repair(
  p_actor_user_id uuid,p_kind text,p_item_id text,p_reason text,p_cause_corrected boolean
) returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  actor public.admin_user%rowtype;
  previous_status text;
  previous_attempts integer;
  previous_error text;
begin
  actor := private.require_content_actor(p_actor_user_id);
  if p_kind not in ('animal','content') or p_item_id is null
    or p_cause_corrected is distinct from true
    or length(btrim(coalesce(p_reason,''))) not between 10 and 500 then
    raise exception 'Invalid manual repair retry' using errcode='22023';
  end if;
  if p_kind='animal' then
    select repair_status,repair_attempts,last_error_code
      into previous_status,previous_attempts,previous_error
    from public.animal_publication_media_copy
    where public_path=p_item_id and copied_at is null for update;
    if not found then return false; end if;
    if previous_status<>'failed' then
      raise exception 'Repair state changed' using errcode='40001';
    end if;
    update public.animal_publication_media_copy
    set repair_status='pending',repair_attempts=0,
      next_retry_at=pg_catalog.clock_timestamp(),copy_claimed_at=null,lease_token=null
    where public_path=p_item_id;
  else
    select repair_status,repair_attempts,last_error_code
      into previous_status,previous_attempts,previous_error
    from public.content_public_asset
    where id=p_item_id::uuid and ready=false for update;
    if not found then return false; end if;
    if previous_status<>'failed' then
      raise exception 'Repair state changed' using errcode='40001';
    end if;
    update public.content_public_asset
    set repair_status='pending',repair_attempts=0,
      next_retry_at=pg_catalog.clock_timestamp(),copy_claimed_at=null,lease_token=null
    where id=p_item_id::uuid;
  end if;
  insert into public.audit_log(actor_user_id,action,entity,entity_id,detail)
  values(actor.id,'media_repair.retry_failed','media_repair',p_item_id,
    jsonb_build_object('kind',p_kind,'previous_attempts',previous_attempts,
      'previous_error_code',previous_error,'reason',btrim(p_reason)));
  return true;
end $$;
revoke all on function public.get_media_repair_backlog(uuid,integer),
  public.retry_failed_media_repair(uuid,text,text,text,boolean)
  from public,anon,authenticated;
grant execute on function public.get_media_repair_backlog(uuid,integer),
  public.retry_failed_media_repair(uuid,text,text,text,boolean) to service_role;
