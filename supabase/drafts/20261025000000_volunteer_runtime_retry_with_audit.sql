-- DRAFT ONLY — NOT APPLIED. This directory is outside supabase/migrations.
-- Requires separate target verification, schema review and application approval.
-- No tables, role policies, cron behavior or existing claim/finish RPCs are changed.
begin;
create function public.retry_volunteer_runtime_job_with_audit(
  p_actor uuid,
  p_bucket timestamptz,
  p_expected_updated_at timestamptz,
  p_owner uuid,
  p_confirmed boolean,
  p_reason text
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_run public.volunteer_runtime_job_run%rowtype;
  v_now timestamptz;
  v_reason text := btrim(p_reason, E' \t\r\n');
begin
  perform public.volunteer_policy_admin(p_actor);
  if p_confirmed is distinct from true or p_bucket is null
     or p_expected_updated_at is null or p_owner is null
     or v_reason is null or char_length(v_reason) not between 1 and 500 then
    raise exception 'invalid_hourly_retry' using errcode = '22023';
  end if;

  -- The same row lock serializes this command with cron claims and finishes.
  select * into v_run from public.volunteer_runtime_job_run
    where job_key = 'volunteer-hourly' and bucket = p_bucket
    for update;
  if not found then return false; end if;
  -- Evaluate AFTER waiting on the lock, including an hour rollover while waiting.
  v_now := clock_timestamp();
  if p_bucket <> (date_trunc('hour', v_now at time zone 'UTC') at time zone 'UTC')
     or v_run.status <> 'failed'
     or v_run.updated_at <> p_expected_updated_at
     or (v_run.lease_until is not null and
       (not isfinite(v_run.lease_until) or v_run.lease_until > v_now)) then
    return false;
  end if;

  update public.volunteer_runtime_job_run
    set status = 'running', lease_owner = p_owner,
        lease_until = v_now + interval '10 minutes', updated_at = v_now
    where job_key = 'volunteer-hourly' and bucket = p_bucket;

  -- Deliberately no exception handler: audit failure rolls back the claim.
  -- The requester is the audit actor; the worker keeps its configured system actor.
  insert into public.audit_log(actor_user_id, action, entity, entity_id, detail)
    values (p_actor, 'volunteer_runtime_job.retry', 'volunteer_runtime_job_run',
      'volunteer-hourly:' || p_bucket::text,
      jsonb_build_object('reason', v_reason, 'bucket', p_bucket,
        'expected_updated_at', p_expected_updated_at, 'lease_owner', p_owner));
  return true;
end;
$$;

revoke all on function public.retry_volunteer_runtime_job_with_audit(
  uuid, timestamptz, timestamptz, uuid, boolean, text
) from public, anon, authenticated;
grant execute on function public.retry_volunteer_runtime_job_with_audit(
  uuid, timestamptz, timestamptz, uuid, boolean, text
) to service_role;
commit;
