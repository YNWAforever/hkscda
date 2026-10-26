-- The lease stops another worker from claiming the bucket. It must not also stop the
-- worker that still owns the row from recording the outcome after the lease time passes.
-- A later claim changes lease_owner, so the original worker's finish still matches nothing.
create or replace function public.finish_volunteer_runtime_job(
  p_job_key text,
  p_bucket timestamptz,
  p_owner uuid,
  p_status text,
  p_result jsonb
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n int;
begin
  if p_status not in ('complete', 'failed') then
    raise exception 'invalid job status' using errcode = '22023';
  end if;
  update public.volunteer_runtime_job_run
    set status = p_status,
        result = p_result,
        lease_until = null,
        lease_owner = null,
        updated_at = clock_timestamp()
    where job_key = p_job_key
      and bucket = p_bucket
      and status = 'running'
      and lease_owner = p_owner;
  get diagnostics n = row_count;
  return n = 1;
end;
$$;

revoke all on function public.finish_volunteer_runtime_job(text, timestamptz, uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.finish_volunteer_runtime_job(text, timestamptz, uuid, text, jsonb)
  to service_role;
