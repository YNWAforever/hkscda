-- SP-5b-2 M3: internship review audit rows keep the review status and reason in audit_log.detail.
-- The function is the 20260913072454 definition, copied whole; only the detail argument of the final
-- audit_log insert changes. The replay row (internship_command_result) still stores the unchanged result.
create or replace function public.internship_command(p_actor uuid,p_command jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare action text:=p_command->>'action'; app public.internship_application%rowtype; draft public.internship_intake_draft%rowtype; preview public.internship_intake_preview%rowtype; intake public.internship_intake_version%rowtype; prior public.internship_command_result%rowtype; result jsonb; new_id uuid; key_id uuid; current_clock timestamptz; staff boolean; administrator boolean; body jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended('internship-domain',0)); current_clock:=clock_timestamp();
 select * into intake from public.internship_intake_version order by published_at desc,id desc limit 1;
 if action='intake' then return jsonb_build_object('kind','intake','version',intake.id,'settings',intake.body); end if;
 if not exists(select 1 from auth.users where id=p_actor and email_confirmed_at is not null and (banned_until is null or banned_until<=current_clock)) then raise exception 'verified_actor_required' using errcode='42501'; end if;
 staff:=exists(select 1 from public.admin_user where auth_user_id=p_actor and status='active' and role in ('staff','admin'));
 administrator:=exists(select 1 from public.admin_user where auth_user_id=p_actor and status='active' and role='admin');
 if action in ('list','review') and not staff then raise exception 'internship_staff_required' using errcode='42501'; end if;
 if action in ('settings','save_intake','preview_intake','publish_intake') and not administrator then raise exception 'internship_admin_required' using errcode='42501'; end if;
 if action in ('list','mine') then
  return jsonb_build_object('kind','applications','applications',coalesce((select jsonb_agg(to_jsonb(a)||jsonb_build_object('events',(select coalesce(jsonb_agg(to_jsonb(e) order by created_at),'[]') from public.internship_event e where application_id=a.id),'attachments',(select coalesce(jsonb_agg(to_jsonb(f) order by created_at),'[]') from public.internship_attachment f where application_id=a.id)) order by a.created_at desc) from (select * from public.internship_application where (action='list' or applicant_id=p_actor) order by created_at desc limit 500) a),'[]'));
 end if;
 select * into draft from public.internship_intake_draft where id=true for update;
 if action='settings' then return jsonb_build_object('kind','settings','draft',to_jsonb(draft),'current',to_jsonb(intake),'history',(select jsonb_agg(to_jsonb(v) order by published_at desc) from public.internship_intake_version v)); end if;
 if action in ('save_intake','preview_intake') then
  if (p_command->>'expected_revision')::bigint is distinct from draft.revision then return jsonb_build_object('kind','conflict','current',to_jsonb(draft)); end if;
  if action='save_intake' then
   body:=p_command->'body';
   if public.internship_validate_intake(body) is not true or (body->>'opens_at' is not null and body->>'closes_at' is not null and (body->>'opens_at')::timestamptz >= (body->>'closes_at')::timestamptz) then raise exception 'invalid_intake' using errcode='22023'; end if;
   update public.internship_intake_draft set body=p_command->'body',revision=revision+1 where id=true returning revision into draft.revision;
   return jsonb_build_object('kind','saved','revision',draft.revision);
  end if;
  insert into public.internship_intake_preview(actor,revision,body,expires_at) values(p_actor,draft.revision,draft.body,current_clock+interval '5 minutes') returning id into new_id;
  return jsonb_build_object('kind','preview','preview_id',new_id,'before',intake.body,'after',draft.body,'existing_applications_preserved',(select count(*) from public.internship_application));
 end if;
 key_id:=(p_command->>'idempotency_key')::uuid;
 if key_id is null then raise exception 'idempotency_key_required' using errcode='22023'; end if;
 select * into prior from public.internship_command_result where actor=p_actor and key=key_id;
 if found then if prior.payload_hash<>md5(p_command::text) then return jsonb_build_object('kind','conflict','reason','idempotency_payload_changed'); end if; return prior.result; end if;
 if action='publish_intake' then
  select * into preview from public.internship_intake_preview where id=(p_command->>'preview_id')::uuid and actor=p_actor;
  if not found or preview.revision<>draft.revision or preview.expires_at<=current_clock then return jsonb_build_object('kind','conflict'); end if;
  if length(trim(coalesce(p_command->>'reason','')))=0 then raise exception 'reason_required' using errcode='22023'; end if;
  insert into public.internship_intake_version(body,published_by,reason) values(preview.body,p_actor,p_command->>'reason') returning id into new_id;
  result:=jsonb_build_object('kind','published','version_id',new_id);
 elsif action='submit' then
  if (p_command->>'intake_version_id')::uuid is distinct from intake.id then return jsonb_build_object('kind','conflict','reason','intake_changed'); end if;
  if (intake.body->>'enabled')::boolean is not true or current_clock<coalesce((intake.body->>'opens_at')::timestamptz,'-infinity') or current_clock>=coalesce((intake.body->>'closes_at')::timestamptz,'infinity') then return jsonb_build_object('kind','denied','reason','intake_closed'); end if;
  if (p_command->>'veterinary_student')::boolean is not true then return jsonb_build_object('kind','denied','reason','veterinary_student_required'); end if;
  if not (intake.body->'shelters' ? (p_command->>'shelter')) or length(trim(coalesce(p_command->>'institution','')))=0 or length(trim(coalesce(p_command->>'course','')))=0 or length(trim(coalesce(p_command->>'name','')))=0 then raise exception 'invalid_student_details' using errcode='22023'; end if;
  if exists(select 1 from public.internship_application where applicant_id=p_actor and status in ('submitted','needs_information','approved')) then return jsonb_build_object('kind','conflict','reason','active_application_exists'); end if;
  insert into public.internship_application(applicant_id,intake_version_id,contact_snapshot,student_snapshot,shelter) values(p_actor,intake.id,jsonb_build_object('name',p_command->>'name','email',(select email from auth.users where id=p_actor),'phone',p_command->>'phone'),jsonb_build_object('veterinary_student',true,'institution',p_command->>'institution','course',p_command->>'course','statement',p_command->>'statement'),p_command->>'shelter') returning id into new_id;
  insert into public.internship_event(application_id,actor,kind,detail) values(new_id,p_actor,'submitted',jsonb_build_object('intake_version_id',intake.id));
  result:=jsonb_build_object('kind','submitted','application_id',new_id);
 elsif action in ('review','withdraw','supplement','attach') then
  select * into app from public.internship_application where id=(p_command->>'application_id')::uuid for update;
  if not found then return jsonb_build_object('kind','not_found'); end if;
  if action<>'review' and app.applicant_id<>p_actor then raise exception 'internship_owner_required' using errcode='42501'; end if;
  if (p_command->>'expected_revision')::bigint is distinct from app.revision then return jsonb_build_object('kind','conflict','current_revision',app.revision); end if;
  if action='review' then
   if app.status not in ('submitted','needs_information') or p_command->>'status' not in ('approved','rejected','needs_information') or length(trim(coalesce(p_command->>'reason','')))=0 then raise exception 'invalid_review_transition' using errcode='22023'; end if;
   if p_command->>'status'='approved' and ((p_command->>'student_verified')::boolean is not true or length(trim(coalesce(p_command->>'evidence','')))=0) then return jsonb_build_object('kind','denied','reason','verified_student_evidence_required'); end if;
   update public.internship_application set status=p_command->>'status',revision=revision+1 where id=app.id;
  elsif action='withdraw' then
   if app.status='withdrawn' then return jsonb_build_object('kind','conflict'); end if;
   update public.internship_application set status='withdrawn',revision=revision+1 where id=app.id;
  elsif action='supplement' then
   if app.status<>'needs_information' or length(trim(coalesce(p_command->>'statement','')))=0 then raise exception 'supplement_not_requested' using errcode='22023'; end if;
   update public.internship_application set status='submitted',revision=revision+1 where id=app.id;
  else
   if app.status not in ('submitted','needs_information') then raise exception 'application_closed' using errcode='22023'; end if;
   if p_command->>'object_path' not like p_actor::text||'/'||app.id::text||'/%' or not exists(select 1 from storage.objects where bucket_id='internship-private' and name=p_command->>'object_path') then raise exception 'invalid_private_attachment_reference' using errcode='22023'; end if;
   insert into public.internship_attachment(application_id,object_path,content_hash,label,mime_type,byte_size,uploaded_by) values(app.id,p_command->>'object_path',p_command->>'content_hash',p_command->>'label',p_command->>'mime_type',(p_command->>'byte_size')::integer,p_actor);
   update public.internship_application set revision=revision+1 where id=app.id;
  end if;
  new_id:=app.id;
  insert into public.internship_event(application_id,actor,kind,detail) values(app.id,p_actor,action,p_command-'idempotency_key'-'action'-'application_id');
  result:=jsonb_build_object('kind','updated','application_id',app.id,'revision',app.revision+1);
 else raise exception 'invalid_internship_command' using errcode='22023'; end if;
 insert into public.audit_log(actor_user_id,action,entity,entity_id,detail) values(p_actor,'internship.'||action,'internship',new_id::text,case when action = 'review' then result || pg_catalog.jsonb_build_object('status', p_command->>'status', 'reason', pg_catalog.btrim(p_command->>'reason')) else result end);
 insert into public.internship_command_result(actor,key,payload_hash,result) values(p_actor,key_id,md5(p_command::text),result);
 return result;
end $$;
revoke all on function public.internship_command(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.internship_command(uuid,jsonb) to service_role;
