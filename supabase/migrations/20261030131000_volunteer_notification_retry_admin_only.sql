-- BUG-63: retrying a failed volunteer notification was admin-only on one route and open to
-- staff on another.
--
-- /api/admin/volunteers/jobs/{id}/retry requires an admin, but the tasks route's `retry`
-- action allowed staff, and both reach retry_volunteer_operation_outbox (the tasks route
-- through volunteer_task_command), whose actor check (20260913084120) accepted staff too.
-- Decision: only admins may retry failed volunteer notifications. The API now refuses
-- staff on both routes; this migration makes the same rule hold below the API.
--
-- The only change from 20260913084120 is the role check: a.role = 'admin' instead of
-- a.role in ('staff','admin'). A staff actor gets 42501 volunteer_forbidden, through this
-- function directly and through volunteer_task_command's retry branch; staff keep
-- volunteer_task_command's list and complete actions (that function is not changed).
-- Signature, security definer, search_path, the update, the audit row and grants are
-- unchanged.

create or replace function public.retry_volunteer_operation_outbox(p_actor uuid,p_id uuid) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare n int;
begin
 if not exists(select 1 from public.admin_user a join auth.users u on u.id=a.auth_user_id where a.auth_user_id=p_actor and a.role='admin' and a.status='active' and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<=clock_timestamp())) then raise exception 'volunteer_forbidden' using errcode='42501';end if;
 update public.volunteer_operation_outbox set status='queued',available_at=clock_timestamp(),claimed_until=null,last_error=null,retry_attempt_base=attempts where id=p_id and status='failed';get diagnostics n=row_count;
 if n=1 then insert into public.audit_log(actor_user_id,action,entity,entity_id,detail) values(p_actor,'volunteer_outbox.retry','volunteer_operation_outbox',p_id::text,'{}');end if;return n=1;
end $$;

-- Unchanged from 20260913071639: server-authenticated actors only.
revoke all on function public.retry_volunteer_operation_outbox(uuid,uuid) from public,anon,authenticated;
grant execute on function public.retry_volunteer_operation_outbox(uuid,uuid) to service_role;
