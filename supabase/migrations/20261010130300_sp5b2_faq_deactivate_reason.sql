-- SP-5b-2 M4: deactivating a FAQ entry records the reason staff gave.
-- Backward compatible (plan D1): p_reason defaults to null and the audit detail then stays '{}',
-- exactly what the previous definition wrote, so the deployed app keeps working.
-- The body is the 20260830120000 definition verbatim apart from the added argument and the audit
-- detail expression. The only caller (the FAQ repository) passes named arguments.
drop function if exists public.deactivate_faq_entry_with_audit(uuid, uuid);

create function public.deactivate_faq_entry_with_audit(
  p_actor_user_id uuid,
  p_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor public.admin_user%rowtype;
begin
  select * into actor
  from public.admin_user
  where auth_user_id = p_actor_user_id
    and status = 'active'
    and role in ('staff', 'admin');

  if not found then
    raise exception 'Active staff or admin actor required' using errcode = '42501';
  end if;

  update public.faq_entry set is_active = false where id = p_id;

  if not found then
    raise exception 'FAQ entry not found' using errcode = 'P0002';
  end if;

  insert into public.audit_log (actor_user_id, action, entity, entity_id, detail)
  values (p_actor_user_id, 'faq_entry.deactivate', 'faq_entry', p_id::text, jsonb_strip_nulls(jsonb_build_object('reason', nullif(btrim(p_reason), ''))));
end;
$$;

revoke all on function public.deactivate_faq_entry_with_audit(uuid, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.deactivate_faq_entry_with_audit(uuid, uuid, text) to service_role;
