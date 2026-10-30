-- BUG-55: a pending invitee could become active without accepting the invite.
--
-- update_admin_user_with_audit (20261002111418) refused pending -> active but allowed
-- pending -> disabled -> active, so an admin could disable an invite that was never
-- accepted and then reactivate it: the user became active with invite_accepted_at null
-- and no admin_user.activate_from_invite audit row.
--
-- The function now refuses disabled -> active when the user was invited and never
-- accepted (invited_at is not null and invite_accepted_at is null -- the same rule as
-- hasUnacceptedInvite in src/lib/admin/access.ts, which the access service already
-- applies). It raises 'invite_not_accepted' (P0001), which the access repository maps to
-- 422 invite_not_accepted; the admin sends a new invite instead. Users created before
-- invites existed (invited_at null) and users who accepted can still be reactivated.
--
-- Everything else is unchanged from 20261002111418: signature, security definer,
-- search_path = '' (every reference schema-qualified), locks, other checks, audit row.

create or replace function public.update_admin_user_with_audit(
  p_actor_user_id uuid,
  p_target_id uuid,
  p_role text default null,
  p_status text default null
)
returns public.admin_user
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_user_row public.admin_user%rowtype;
  updated_user_row public.admin_user%rowtype;
  next_role text;
  next_status text;
  audit_action text;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('public.admin_user.active_admin', 0));

  perform 1 from auth.users u
  where u.id = p_actor_user_id and u.email_confirmed_at is not null
    and (u.banned_until is null or u.banned_until <= pg_catalog.clock_timestamp())
  for share;
  if not found then
    raise exception 'admin_actor_denied' using errcode = 'P0001';
  end if;

  perform 1 from public.admin_user
  where auth_user_id = p_actor_user_id and role = 'admin' and status = 'active'
  for share;
  if not found then
    raise exception 'admin_actor_denied' using errcode = 'P0001';
  end if;

  select * into current_user_row
  from public.admin_user
  where id = p_target_id
  for update;
  if not found then
    raise exception 'admin_user_not_found' using errcode = 'P0001';
  end if;

  if p_role is null and p_status is null then
    raise exception 'empty_admin_user_update' using errcode = 'P0001';
  end if;
  if p_role is not null and p_role not in ('staff', 'treasurer', 'admin') then
    raise exception 'invalid_role' using errcode = 'P0001';
  end if;
  if p_status is not null and p_status not in ('pending', 'active', 'disabled') then
    raise exception 'invalid_status' using errcode = 'P0001';
  end if;

  next_role := coalesce(p_role, current_user_row.role);
  next_status := coalesce(p_status, current_user_row.status);

  if current_user_row.auth_user_id = p_actor_user_id and p_role is not null
     and p_role <> 'admin' then
    raise exception 'self_demote' using errcode = 'P0001';
  end if;
  if current_user_row.auth_user_id = p_actor_user_id and p_status = 'disabled' then
    raise exception 'self_disable' using errcode = 'P0001';
  end if;
  if p_status = 'pending' and current_user_row.status <> 'pending' then
    raise exception 'invalid_status_transition' using errcode = 'P0001';
  end if;
  if current_user_row.status = 'pending' and p_status = 'active' then
    raise exception 'invalid_status_transition' using errcode = 'P0001';
  end if;
  -- BUG-55: pending -> disabled -> active would skip accepting the invite. A user who
  -- was invited and never accepted goes back through a new invite instead (same rule as
  -- hasUnacceptedInvite in src/lib/admin/access.ts).
  if current_user_row.status = 'disabled' and p_status = 'active'
     and current_user_row.invited_at is not null and current_user_row.invite_accepted_at is null then
    raise exception 'invite_not_accepted' using errcode = 'P0001';
  end if;

  if current_user_row.role = 'admin' and current_user_row.status = 'active'
     and (next_role <> 'admin' or next_status <> 'active')
     and not exists (
       select 1 from public.admin_user
       where id <> p_target_id and role = 'admin' and status = 'active'
     ) then
    raise exception 'last_active_admin' using errcode = 'P0001';
  end if;

  audit_action := case
    when p_role is not null and p_role <> current_user_row.role
      then 'admin_user.role_update'
    when p_status = 'disabled' and current_user_row.status <> 'disabled'
      then 'admin_user.disable'
    when p_status = 'active' and current_user_row.status = 'disabled'
      then 'admin_user.reactivate'
    else 'admin_user.update'
  end;

  update public.admin_user
  set role = next_role, status = next_status
  where id = p_target_id
  returning * into updated_user_row;

  insert into public.audit_log (
    actor_user_id, action, entity, entity_id, timestamp, detail
  ) values (
    p_actor_user_id,
    audit_action,
    'admin_user',
    p_target_id::text,
    pg_catalog.now(),
    pg_catalog.jsonb_build_object(
      'targetEmail', current_user_row.email,
      'oldRole', current_user_row.role,
      'newRole', updated_user_row.role,
      'oldStatus', current_user_row.status,
      'newStatus', updated_user_row.status
    )
  );

  return updated_user_row;
end;
$function$;

-- Unchanged from 20261002111418: server-authenticated actors only.
revoke all on function public.update_admin_user_with_audit(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.update_admin_user_with_audit(uuid, uuid, text, text)
  to service_role;
