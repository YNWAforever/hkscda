-- Isolated schema clone only. All synthetic identities and jobs roll back.
begin;
insert into auth.users(id,email,email_confirmed_at) values ('a1111111-1111-4111-8111-111111111148','export-role@example.test',now());
insert into public.admin_user(auth_user_id,email,role,status) values ('a1111111-1111-4111-8111-111111111148','export-role@example.test','treasurer','active');
set local role service_role;
do $$
declare actor uuid := 'a1111111-1111-4111-8111-111111111148'; owner uuid := gen_random_uuid(); job jsonb; claimed jsonb; result jsonb; job_id uuid;
begin
  job := public.enqueue_crm_export_job(actor,'supporters','{"q":"synthetic-missing-export-fixture-148"}'::jsonb);
  job_id := (job->>'id')::uuid;
  if (job->>'total')::integer <> 0 then raise exception 'Expected empty synthetic snapshot'; end if;
  claimed := public.claim_crm_export_job(owner);
  if (claimed->>'id')::uuid is distinct from job_id then raise exception 'Unexpected claim'; end if;
  if public.crm_export_job_page(job_id,owner,0,500) <> '[]'::jsonb then raise exception 'Unexpected rows'; end if;
  result := public.append_crm_export_job_page(job_id,owner,'id,name',0);
  if result->>'status' <> 'ready' then raise exception 'Not ready'; end if;
  if public.crm_export_job_download(job_id,actor) is distinct from 'id,name' then raise exception 'Download failed'; end if;
  if public.crm_export_job_download(job_id,gen_random_uuid()) is not null then raise exception 'Other actor gained access'; end if;
  if not public.cancel_crm_export_job(job_id,actor) then raise exception 'Cancellation failed'; end if;
  if public.crm_export_job_download(job_id,actor) is not null then raise exception 'Cancelled artifact remains accessible'; end if;
  perform public.cleanup_expired_crm_export_jobs();
  raise notice 'service-role enqueue/claim/page/append/download/actor denial/cancel/cleanup passed';
end;
$$;
rollback;
