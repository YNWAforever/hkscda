-- The bearer token is verified by the server before this service-role-only RPC.
-- Locking and auditing in one transaction makes first-login activation idempotent.
create or replace function public.activate_admin_invite_with_audit(
  p_auth_user_id uuid
)
returns public.admin_user
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  admin_row public.admin_user%rowtype;
  accepted_at timestamptz;
begin
  if p_auth_user_id is null then
    raise exception 'admin_user_not_found' using errcode = 'P0001';
  end if;

  -- Match the lock order used by the admin access mutation RPCs.
  perform pg_advisory_xact_lock(hashtextextended('public.admin_user.active_admin', 0));

  select * into admin_row
  from public.admin_user
  where auth_user_id = p_auth_user_id
  for update;

  if not found or admin_row.status = 'disabled' then
    raise exception 'admin_user_not_found' using errcode = 'P0001';
  end if;
  if admin_row.status = 'active' then
    return admin_row;
  end if;
  if admin_row.status <> 'pending' then
    raise exception 'invalid_status_transition' using errcode = 'P0001';
  end if;

  accepted_at := now();
  update public.admin_user
  set status = 'active',
      invite_accepted_at = accepted_at
  where id = admin_row.id
  returning * into admin_row;

  insert into public.audit_log (
    actor_user_id, action, entity, entity_id, timestamp, detail
  ) values (
    p_auth_user_id,
    'admin_user.activate_from_invite',
    'admin_user',
    admin_row.id::text,
    accepted_at,
    jsonb_build_object(
      'targetEmail', admin_row.email,
      'oldStatus', 'pending',
      'newStatus', 'active',
      'role', admin_row.role
    )
  );

  return admin_row;
end;
$$;

revoke all on function public.activate_admin_invite_with_audit(uuid)
  from public, anon, authenticated;
grant execute on function public.activate_admin_invite_with_audit(uuid)
  to service_role;
