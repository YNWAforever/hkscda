create table public.volunteer_runtime_job_run (
 job_key text not null, bucket timestamptz not null, status text not null check(status in ('running','complete','failed')),
 lease_until timestamptz, lease_owner uuid, result jsonb, updated_at timestamptz not null default clock_timestamp(), primary key(job_key,bucket)
);
alter table public.volunteer_runtime_job_run enable row level security;
revoke all on public.volunteer_runtime_job_run from anon,authenticated;
grant select,insert,update on public.volunteer_runtime_job_run to service_role;
create function public.claim_volunteer_runtime_job(p_job_key text,p_bucket timestamptz,p_owner uuid,p_lease_until timestamptz) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare n int; begin
 insert into public.volunteer_runtime_job_run(job_key,bucket,status,lease_owner,lease_until) values(p_job_key,p_bucket,'running',p_owner,p_lease_until)
 on conflict(job_key,bucket) do update set status='running',lease_owner=excluded.lease_owner,lease_until=excluded.lease_until,updated_at=clock_timestamp()
 where volunteer_runtime_job_run.status='failed' or volunteer_runtime_job_run.status='running' and volunteer_runtime_job_run.lease_until<clock_timestamp(); get diagnostics n=row_count; return n=1; end $$;
create function public.finish_volunteer_runtime_job(p_job_key text,p_bucket timestamptz,p_owner uuid,p_status text,p_result jsonb) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare n int;begin if p_status not in('complete','failed') then raise exception 'invalid job status' using errcode='22023';end if;update public.volunteer_runtime_job_run set status=p_status,result=p_result,lease_until=null,lease_owner=null,updated_at=clock_timestamp() where job_key=p_job_key and bucket=p_bucket and status='running' and lease_owner=p_owner and lease_until>=clock_timestamp();get diagnostics n=row_count;return n=1;end $$;
create function public.claim_volunteer_operation_outbox(p_limit integer,p_lease_until timestamptz) returns setof public.volunteer_operation_outbox language sql security definer set search_path=public,pg_temp as $$
 update public.volunteer_operation_outbox o set status='claimed',attempts=o.attempts+1,claimed_until=p_lease_until
 where o.id in(select id from public.volunteer_operation_outbox where kind in('volunteer_monthly_assessment_notification','volunteer_policy_reminder') and status in('queued','failed') and available_at<=clock_timestamp() and (claimed_until is null or claimed_until<clock_timestamp()) order by available_at,id for update skip locked limit least(greatest(p_limit,1),100)) returning o.* $$;
create function public.defer_volunteer_operation_outbox(p_id uuid,p_reason text,p_available_at timestamptz) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$declare n int;begin update public.volunteer_operation_outbox set status='queued',claimed_until=null,last_error=left(p_reason,500),available_at=p_available_at where id=p_id and status='claimed';get diagnostics n=row_count;return n=1;end$$;
revoke all on function public.claim_volunteer_runtime_job(text,timestamptz,uuid,timestamptz),public.finish_volunteer_runtime_job(text,timestamptz,uuid,text,jsonb),public.claim_volunteer_operation_outbox(integer,timestamptz),public.defer_volunteer_operation_outbox(uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.claim_volunteer_runtime_job(text,timestamptz,uuid,timestamptz),public.finish_volunteer_runtime_job(text,timestamptz,uuid,text,jsonb),public.claim_volunteer_operation_outbox(integer,timestamptz),public.defer_volunteer_operation_outbox(uuid,text,timestamptz) to service_role;

create function public.retry_volunteer_operation_outbox(p_actor uuid,p_id uuid) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$declare n int;begin perform public.volunteer_policy_admin(p_actor);update public.volunteer_operation_outbox set status='queued',available_at=clock_timestamp(),claimed_until=null,last_error=null where id=p_id and status='failed';get diagnostics n=row_count;if n=1 then insert into public.audit_log(actor_user_id,action,entity,entity_id,detail) values(p_actor,'volunteer_outbox.retry','volunteer_operation_outbox',p_id::text,'{}');end if;return n=1;end$$;
revoke all on function public.retry_volunteer_operation_outbox(uuid,uuid) from public,anon,authenticated;
grant execute on function public.retry_volunteer_operation_outbox(uuid,uuid) to service_role;
