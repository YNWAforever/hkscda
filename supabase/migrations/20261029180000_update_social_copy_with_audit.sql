-- BUG-06: the social-copy PATCH wrote its audit row in a separate call.
--
-- PATCH /api/admin/content/social-copy/:id updated social_copy_variant with a plain
-- PostgREST update and then inserted audit_log as a second request. If the audit insert
-- failed, the edit stayed applied, unaudited, and the caller was told 500 - the exact
-- failure CLAUDE.md's *_with_audit rule exists to prevent. cms_promotion_command's
-- social_status branch is atomic but covers status only; copy text and hashtags had no
-- atomic path.
--
-- update_social_copy_with_audit applies any of status, copy_text and hashtags and writes
-- the content.social_copy.update audit row in one transaction. It checks the actor the
-- same way cms_promotion_command does (confirmed, unbanned auth user who is an active
-- staff/admin), validates the same limits as socialCopyUpdateSchema, and is callable by
-- service_role only. Unknown ids raise 'social copy not found' (P0002), which the content
-- API answers with 404.

create or replace function public.update_social_copy_with_audit(
  p_actor uuid,
  p_id uuid,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_id uuid;
  v_status text := p_patch->>'status';
  v_copy_text text := p_patch->>'copyText';
  v_hashtags text[];
begin
  perform 1 from auth.users u
  where u.id = p_actor and u.email_confirmed_at is not null
    and (u.banned_until is null or u.banned_until <= pg_catalog.clock_timestamp())
  for share;
  if not found then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform 1 from public.admin_user a
  where a.auth_user_id = p_actor and a.status = 'active'
    and a.role in ('staff', 'admin')
  for share;
  if not found then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_patch is null or jsonb_typeof(p_patch) <> 'object'
    or not (p_patch ? 'status' or p_patch ? 'copyText' or p_patch ? 'hashtags') then
    raise exception 'invalid social copy patch' using errcode = '22023';
  end if;
  if p_patch ? 'status' and (v_status is null or v_status not in ('draft', 'copied', 'archived')) then
    raise exception 'invalid social copy status' using errcode = '22023';
  end if;
  if p_patch ? 'copyText' and (
    v_copy_text is null
    or pg_catalog.length(pg_catalog.btrim(v_copy_text)) = 0
    or pg_catalog.length(v_copy_text) > 10000
  ) then
    raise exception 'invalid social copy text' using errcode = '22023';
  end if;
  if p_patch ? 'hashtags' then
    if jsonb_typeof(p_patch->'hashtags') <> 'array'
      or jsonb_array_length(p_patch->'hashtags') > 30
      or exists (
        select 1 from jsonb_array_elements(p_patch->'hashtags') t
        where jsonb_typeof(t) <> 'string'
          or pg_catalog.length(pg_catalog.btrim(t #>> '{}')) = 0
          or pg_catalog.length(t #>> '{}') > 60
      )
    then
      raise exception 'invalid social copy hashtags' using errcode = '22023';
    end if;
    v_hashtags := array(select jsonb_array_elements_text(p_patch->'hashtags'));
  end if;

  update public.social_copy_variant
  set status = case when p_patch ? 'status' then v_status else status end,
      copy_text = case when p_patch ? 'copyText' then v_copy_text else copy_text end,
      hashtags = case when p_patch ? 'hashtags' then v_hashtags else hashtags end,
      updated_by = p_actor
  where id = p_id
  returning id into v_id;
  if not found then
    raise exception 'social copy not found' using errcode = 'P0002';
  end if;

  insert into public.audit_log (actor_user_id, action, entity, entity_id, detail)
  values (p_actor, 'content.social_copy.update', 'social_copy_variant', v_id::text, p_patch);
  return jsonb_build_object('ok', true);
end;
$function$;

revoke all on function public.update_social_copy_with_audit(uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.update_social_copy_with_audit(uuid, uuid, jsonb)
  to service_role;
