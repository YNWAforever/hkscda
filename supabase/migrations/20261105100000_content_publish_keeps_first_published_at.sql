-- BUG-71: a republished story keeps its first publication date.
-- publish_content_revision (20260905150012) set content_item.published_at = now() on every
-- publication, so republishing a typo fix moved a March story to the top of /stories as
-- November and changed its public date and article:published_time. The date is now set only
-- when the item has none. Public readers (read_published_content_snapshots) and the admin
-- list read content_item.published_at, so they keep the first date too; revision snapshots
-- are built with a null published_at and are not touched. Existing rows are not rewritten.
-- Signature, security invoker, search_path and grants are unchanged.
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
  -- item is the row locked above; keep its first publication date when it has one.
  update public.content_item set status='published',published_at=coalesce(item.published_at,v_published_at),
    published_revision_id=p_revision_id,published_slug=revision.public_snapshot->'content'->>'slug',version=next_version,updated_by=actor.id where id=p_content_id;
  -- detail.published_at stays the time of this publication event.
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

revoke all on function public.publish_content_revision(uuid,uuid,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.publish_content_revision(uuid,uuid,uuid,integer,text) to service_role;
