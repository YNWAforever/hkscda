-- BUG-65: the qualifications page loaded every volunteer profile on each visit.
--
-- volunteer_profile_command's `list` branch (20260913075040) returned every volunteer_profile
-- row (including birth_date) and every volunteer_credential row (including evidence), with
-- no bound, to any active staff member, and the qualifications page called it on load.
--
-- The page now finds a profile through the paginated directory search and reads that one
-- profile with its credentials through volunteer_admin_directory_read (profile_id; capped at
-- 100 records each). `list` keeps only what the page still needs from it: the credential
-- definitions (a small catalogue with no personal data). It can no longer return the profile
-- or credential tables.
--
-- Callers checked: the only caller of `list` is the qualifications API
-- (src/lib/volunteers/policy/qualifications.server.ts) used by VolunteerQualifications.tsx;
-- the booking repository and the verify-* scripts use claim/verify/credential/me, and the
-- legacy reconciliation panel now takes the chosen profile from the page.
--
-- Everything else is identical to 20260913075040: signature, security definer, search_path,
-- the actor checks, the other actions, the audit and the grants.

create or replace function public.volunteer_profile_command(p_actor uuid,p_command jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare action text:=p_command->>'action'; profile public.volunteer_profile%rowtype; before_state jsonb; credential_id uuid; current_clock timestamptz; reason text;
begin
 perform pg_advisory_xact_lock(hashtextextended('volunteer-domain',0));
 current_clock:=clock_timestamp();
 if not exists(select 1 from auth.users where id=p_actor and email_confirmed_at is not null and (banned_until is null or banned_until<=current_clock)) then raise exception 'verified_actor_required' using errcode='42501'; end if;
 if action='me' then
  select * into profile from public.volunteer_profile where auth_user_id=p_actor;
  return jsonb_build_object('profile',case when profile.id is null then null else jsonb_build_object('id',profile.id,'display_name',profile.display_name,'birth_date',profile.birth_date,'tier',profile.tier,'status',profile.status,'revision',profile.revision) end,
   'registrations',(select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'activity_id',r.activity_id,'status',r.status,'role',r.duty_role,'remarks',r.notes,'attendance_status',r.attendance_status,'title',a.title,'starts_at',a.starts_at,'ends_at',a.ends_at) order by a.starts_at desc),'[]') from public.volunteer_registration r join public.volunteer_activity a on a.id=r.activity_id where r.profile_id=profile.id));
 elsif action='claim' then
  select * into profile from public.volunteer_profile where auth_user_id=p_actor;
  if found then return jsonb_build_object('kind','existing','profile_id',profile.id,'status',profile.status); end if;
  if length(trim(coalesce(p_command->>'display_name',''))) not between 1 and 120 or (p_command->>'birth_date')::date>current_clock::date or (p_command->>'birth_date')::date<date '1900-01-01' then raise exception 'invalid_profile' using errcode='22023'; end if;
  insert into public.volunteer_profile(auth_user_id,display_name,birth_date,status) values(p_actor,trim(p_command->>'display_name'),(p_command->>'birth_date')::date,'pending') returning * into profile;
  reason:='本人提交身份資料，等待職員核實';
 else
  if not exists(select 1 from public.admin_user where auth_user_id=p_actor and status='active' and role in ('staff','admin')) then raise exception 'volunteer_forbidden' using errcode='42501'; end if;
  -- BUG-65: `list` returns only the credential definitions. Profiles and their credentials
  -- are read one profile at a time through volunteer_admin_directory_read.
  if action='list' then return jsonb_build_object(
   'credential_definitions',(select coalesce(jsonb_agg(to_jsonb(c) order by label),'[]') from public.volunteer_credential_definition c)); end if;
  select * into profile from public.volunteer_profile where id=(p_command->>'profile_id')::uuid for update;
  if not found then return jsonb_build_object('kind','not_found'); end if;
  if profile.revision is distinct from (p_command->>'expected_revision')::bigint then return jsonb_build_object('kind','conflict','current',to_jsonb(profile)); end if;
  before_state:=to_jsonb(profile); reason:=trim(coalesce(p_command->>'reason',''));
  if length(reason) not between 1 and 1000 then raise exception 'verification_reason_required' using errcode='22023'; end if;
  if action='verify' then
   if p_command->>'tier' not in ('newcomer','regular','senior') then raise exception 'invalid_tier' using errcode='22023'; end if;
   if (p_command->>'joined_on')::date>(current_clock at time zone 'Asia/Hong_Kong')::date or (p_command->>'history_coverage_start')::date>(current_clock at time zone 'Asia/Hong_Kong')::date then raise exception 'verified_history_cannot_start_in_future' using errcode='22023'; end if;
   update public.volunteer_profile set joined_on=case when p_command ? 'joined_on' then (p_command->>'joined_on')::date else joined_on end,history_coverage_start=case when p_command ? 'history_coverage_start' then (p_command->>'history_coverage_start')::date else history_coverage_start end,tier=p_command->>'tier',status='active',verified_by=p_actor,verified_at=current_clock,revision=revision+1 where id=profile.id returning * into profile;
  elsif action='suspend' then
   update public.volunteer_profile set status='suspended',revision=revision+1 where id=profile.id returning * into profile;
  elsif action='credential' then
   if not exists(select 1 from public.volunteer_credential_definition where key=p_command->>'credential_key') or length(trim(coalesce(p_command->>'evidence','')))=0 then raise exception 'invalid_credential' using errcode='22023'; end if;
   insert into public.volunteer_credential(profile_id,credential_key,valid_from,valid_until,verified_by,evidence)
    values(profile.id,p_command->>'credential_key',(p_command->>'valid_from')::timestamptz,(p_command->>'valid_until')::timestamptz,p_actor,p_command->>'evidence') returning id into credential_id;
   update public.volunteer_profile set revision=revision+1 where id=profile.id returning * into profile;
  elsif action='revoke' then
   update public.volunteer_credential set revoked_at=current_clock where id=(p_command->>'credential_id')::uuid and profile_id=profile.id and revoked_at is null returning id into credential_id;
   if not found then return jsonb_build_object('kind','conflict','reason','credential_changed'); end if;
   update public.volunteer_profile set revision=revision+1 where id=profile.id returning * into profile;
  else raise exception 'invalid_profile_action' using errcode='22023'; end if;
  -- Future registrations retain seats and history, with an explicit follow-up task.
  insert into public.volunteer_operation_outbox(dedup_key,kind,payload)
   select 'qualification:'||r.id::text||':'||profile.revision,'volunteer_qualification_review',jsonb_build_object('registration_id',r.id,'profile_id',profile.id,'profile_revision',profile.revision)
   from public.volunteer_registration r join public.volunteer_activity a on a.id=r.activity_id where r.profile_id=profile.id and r.status in ('pending','approved','waitlisted') and a.starts_at>current_clock;
 end if;
 insert into public.volunteer_profile_event(profile_id,actor_user_id,event_type,reason,before_snapshot,after_snapshot) values(profile.id,p_actor,action,reason,before_state,to_jsonb(profile));
 insert into public.audit_log(actor_user_id,action,entity,entity_id,detail) values(p_actor,'volunteer_profile.'||action,'volunteer_profile',profile.id::text,jsonb_build_object('reason',reason,'revision',profile.revision,'credential_id',credential_id));
 return jsonb_build_object('kind','updated','profile_id',profile.id,'status',profile.status,'revision',profile.revision);
end $$;

-- Unchanged from 20260913064921: server-authenticated actors only.
revoke all on function public.volunteer_profile_command(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.volunteer_profile_command(uuid,jsonb) to service_role;
