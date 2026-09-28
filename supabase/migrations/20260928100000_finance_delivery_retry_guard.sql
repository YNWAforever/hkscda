-- T23 failed delivery worklist: bounded status index and current-actor retry guard.
-- Retry only requeues an already committed payment's existing durable job.
create index donation_delivery_failed_queue_idx
  on public.donation_delivery_job(status,created_at,id)
  where status in ('retryable','attention_required');

create or replace function public.retry_donation_delivery_job_with_audit(
  p_job_id uuid,p_actor_user_id uuid
) returns boolean language plpgsql security definer set search_path='' as $$
declare
  v_before text;
begin
  perform 1 from public.admin_user a join auth.users u on u.id=a.auth_user_id
  where a.auth_user_id=p_actor_user_id and a.status='active'
    and a.role in ('treasurer','admin') and u.email_confirmed_at is not null
    and (u.banned_until is null or u.banned_until<=clock_timestamp())
  for share of a,u;
  if not found then
    raise exception 'delivery_retry_forbidden' using errcode='42501';
  end if;

  select j.status into v_before from public.donation_delivery_job j
  where j.id=p_job_id for update;
  if v_before is null or v_before not in ('retryable','attention_required') then
    return false;
  end if;

  perform 1 from public.donation_delivery_job j
    join public.payment p on p.id=j.payment_id
    join public.donation d on d.id=j.donation_id and d.id=p.donation_id
  where j.id=p_job_id and p.status='succeeded' and d.status='succeeded'
  for share of p,d;
  if not found then return false; end if;

  update public.donation_delivery_job
  set status='pending',next_attempt_at=null,error_code=null,
      lease_until=null,lease_owner=null,updated_at=clock_timestamp()
  where id=p_job_id;
  insert into public.audit_log(actor_user_id,action,entity,entity_id,detail)
  values(p_actor_user_id,'donation.delivery_retry','donation_delivery_job',p_job_id::text,
    jsonb_build_object('from',v_before,'to','pending'));
  return true;
end $$;
revoke all on function public.retry_donation_delivery_job_with_audit(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.retry_donation_delivery_job_with_audit(uuid,uuid)
  to service_role;
