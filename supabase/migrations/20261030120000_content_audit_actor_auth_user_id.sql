-- BUG-39: two content audit actions logged the admin_user row id instead of the auth user id.
--
-- set_content_publication_metadata (20260927122000) and retry_failed_media_repair
-- (20260927140500) resolve the admin_user row from p_actor_user_id (an auth user id) and
-- then wrote actor.id (the admin_user row id) into audit_log.actor_user_id. Every other
-- content audit writes the auth user id, so actor filters and joins missed these rows.
--
-- Each redefinition below is its latest definition with exactly one change: the audit row
-- writes p_actor_user_id. content_item.updated_by and the content revision keep actor.id,
-- because those columns reference admin_user(id). Signatures, security invoker,
-- search_path and grants are unchanged.
--
-- Existing rows are NOT repaired here. audit_log is append-only factual history:
-- 20260913084717_factual_history_runtime_privileges.sql revokes UPDATE and DELETE on it from
-- every runtime role (public, anon, authenticated, service_role). Rewriting rows in a
-- migration would only work because the migration runs as the table owner, which is a
-- bypass of that policy, so the repair is left out. The historical rows stay readable: for
-- actions 'content.set_publication_metadata' and 'media_repair.retry_failed' logged before
-- this migration, actor_user_id is an admin_user.id, and admin_user.auth_user_id gives the
-- auth user it stands for.

create or replace function public.set_content_publication_metadata(
  p_actor_user_id uuid,
  p_content_id uuid,
  p_expected_version integer,
  p_values jsonb
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  actor public.admin_user%rowtype;
  item public.content_item%rowtype;
  v_revision_id uuid;
begin
  actor := private.require_content_actor(p_actor_user_id);
  if jsonb_typeof(p_values) is distinct from 'object'
    or p_values ? 'contentClass' is false
    or p_values ? 'sourceReference' is false
    or p_values ? 'contentOwner' is false
    or p_values ? 'effectiveFrom' is false
    or p_values ? 'effectiveUntil' is false
    or (select count(*) from jsonb_object_keys(p_values)) <> 5
  then raise exception 'Invalid publication metadata' using errcode='22023'; end if;
  select * into item from public.content_item where id=p_content_id for update;
  if not found then raise exception 'Content item not found' using errcode='P0002'; end if;
  if item.version is distinct from p_expected_version then
    raise exception 'Stale content version' using errcode='40001';
  end if;
  update public.content_item set
    content_class=p_values->>'contentClass',
    source_reference=nullif(btrim(p_values->>'sourceReference'),''),
    content_owner=nullif(btrim(p_values->>'contentOwner'),''),
    effective_from=(p_values->>'effectiveFrom')::timestamptz,
    effective_until=(p_values->>'effectiveUntil')::timestamptz,
    version=item.version+1,
    updated_by=actor.id
  where id=p_content_id;
  v_revision_id := private.insert_content_revision(p_content_id,item.version+1,'set_publication_metadata',actor.id);
  -- BUG-39: the audit actor is the auth user id, not the admin_user row id.
  insert into public.audit_log(actor_user_id,action,entity,entity_id,detail)
  values(p_actor_user_id,'content.set_publication_metadata','content_item',p_content_id::text,
    jsonb_build_object('expected_version',p_expected_version,'result_version',item.version+1,
      'revision_id',v_revision_id,'before_class',item.content_class,
      'after_class',p_values->>'contentClass'));
  return jsonb_build_object('content_id',p_content_id,'version',item.version+1,'revision_id',v_revision_id);
end
$$;
revoke all on function public.set_content_publication_metadata(uuid,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.set_content_publication_metadata(uuid,uuid,integer,jsonb) to service_role;

create or replace function public.retry_failed_media_repair(
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
  -- BUG-39: the audit actor is the auth user id, not the admin_user row id.
  insert into public.audit_log(actor_user_id,action,entity,entity_id,detail)
  values(p_actor_user_id,'media_repair.retry_failed','media_repair',p_item_id,
    jsonb_build_object('kind',p_kind,'previous_attempts',previous_attempts,
      'previous_error_code',previous_error,'reason',btrim(p_reason)));
  return true;
end $$;
revoke all on function public.retry_failed_media_repair(uuid,text,text,text,boolean)
  from public,anon,authenticated;
grant execute on function public.retry_failed_media_repair(uuid,text,text,text,boolean) to service_role;
