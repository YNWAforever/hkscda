-- Expired claims are recoverable; the attempt number fences stale completions.
alter table public.volunteer_operation_outbox add column retry_attempt_base integer not null default 0;
create or replace function public.claim_volunteer_operation_outbox(p_limit integer,p_lease_until timestamptz) returns setof public.volunteer_operation_outbox language sql security definer set search_path=public,pg_temp as $$
 update public.volunteer_operation_outbox o set status='claimed',attempts=o.attempts+1,claimed_until=least(p_lease_until,clock_timestamp()+interval '10 minutes')
 where o.id in(select q.id from public.volunteer_operation_outbox q where q.kind in('volunteer_monthly_assessment_notification','volunteer_policy_reminder') and (q.status in('queued','failed') or q.status='claimed' and q.claimed_until<clock_timestamp()) and q.available_at<=clock_timestamp() and q.attempts-q.retry_attempt_base<coalesce((q.payload->>'max_attempts')::int,(select (v.body#>>'{notifications,max_attempts}')::int from public.volunteer_monthly_assessment a join public.volunteer_assessment_policy_version v on v.id=a.policy_version_id where a.id=(q.payload->>'assessment_id')::uuid),1) order by q.available_at,q.id for update skip locked limit least(greatest(p_limit,1),100)) returning o.*
$$;
create function public.settle_volunteer_operation_outbox(p_id uuid,p_attempt integer,p_status text,p_reason text,p_available_at timestamptz,p_provider_message_id text default null) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare n integer;
begin
 if p_status not in('queued','failed','provider_accepted') then raise exception 'invalid_notification_status' using errcode='22023';end if;
 if p_status='provider_accepted' and nullif(trim(p_provider_message_id),'') is null then raise exception 'provider_reference_required' using errcode='22023';end if;
 update public.volunteer_operation_outbox set status=p_status,claimed_until=null,last_error=left(p_reason,500),available_at=coalesce(p_available_at,clock_timestamp()),payload=case when p_status='provider_accepted' then payload||jsonb_build_object('providerMessageId',p_provider_message_id,'providerAcceptedAt',clock_timestamp()) else payload end
 where id=p_id and status='claimed' and attempts=p_attempt and claimed_until>=clock_timestamp();get diagnostics n=row_count;return n=1;
end $$;
revoke all on function public.settle_volunteer_operation_outbox(uuid,integer,text,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.settle_volunteer_operation_outbox(uuid,integer,text,text,timestamptz,text) to service_role;
-- Remove the unfenced worker mutation path.
revoke execute on function public.defer_volunteer_operation_outbox(uuid,text,timestamptz) from service_role;
create or replace function public.retry_volunteer_operation_outbox(p_actor uuid,p_id uuid) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare n int;
begin
 if not exists(select 1 from public.admin_user a join auth.users u on u.id=a.auth_user_id where a.auth_user_id=p_actor and a.role in('staff','admin') and a.status='active' and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<=clock_timestamp())) then raise exception 'volunteer_forbidden' using errcode='42501';end if;
 update public.volunteer_operation_outbox set status='queued',available_at=clock_timestamp(),claimed_until=null,last_error=null,retry_attempt_base=attempts where id=p_id and status='failed';get diagnostics n=row_count;
 if n=1 then insert into public.audit_log(actor_user_id,action,entity,entity_id,detail) values(p_actor,'volunteer_outbox.retry','volunteer_operation_outbox',p_id::text,'{}');end if;return n=1;
end $$;
