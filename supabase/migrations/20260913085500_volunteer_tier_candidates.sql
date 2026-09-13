-- Policy-driven promotion execution and immutable senior-candidate evidence.
create table if not exists public.volunteer_tier_candidate (
 id uuid primary key default gen_random_uuid(),
 profile_id uuid not null references public.volunteer_profile(id),
 candidate_tier text not null check(candidate_tier='senior'),
 policy_version_id uuid not null references public.volunteer_assessment_policy_version(id),
 trigger_kind text not null check(trigger_kind in ('verified_attendance','monthly_assessment')),
 evidence jsonb not null,
 detected_at timestamptz not null default clock_timestamp(),
 unique(profile_id,candidate_tier,policy_version_id,trigger_kind)
);
alter table public.volunteer_tier_candidate enable row level security;
revoke all on public.volunteer_tier_candidate from public,anon,authenticated;
grant select,insert on public.volunteer_tier_candidate to service_role;
create trigger volunteer_tier_candidate_immutable before update or delete on public.volunteer_tier_candidate
for each row execute function public.volunteer_immutable_fact();
revoke update,delete,truncate on public.volunteer_tier_candidate from service_role;

create or replace function public.volunteer_record_senior_candidate(
 p_profile_id uuid,p_policy_version_id uuid,p_trigger text
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.volunteer_profile%rowtype; v public.volunteer_assessment_policy_version%rowtype;
 regular_since timestamptz; observed int; years numeric; latest_tier text;
begin
 select * into p from public.volunteer_profile where id=p_profile_id and status='active' and tier='regular';
 if not found or p.joined_on is null or p.history_coverage_start is null then return; end if;
 select * into v from public.volunteer_assessment_policy_version where id=p_policy_version_id;
 if not found or v.body->>'promotion_trigger'<>p_trigger then return; end if;
 observed:=(v.body->>'senior_regular_observation_months')::int;
 years:=(v.body->>'senior_years')::numeric;
 select created_at,after_snapshot->>'tier' into regular_since,latest_tier
 from public.volunteer_profile_event
 where profile_id=p.id
 and before_snapshot->>'tier' is distinct from after_snapshot->>'tier'
 order by created_at desc,id desc limit 1;
 if not found or latest_tier<>'regular' then regular_since:=null; end if;
 if regular_since is null
    or p.joined_on + make_interval(years=>floor(years)::int,months=>round((years-floor(years))*12)::int)>(clock_timestamp() at time zone (v.body->>'timezone'))::date
    or regular_since + make_interval(months=>observed)>clock_timestamp() then return; end if;
 insert into public.volunteer_tier_candidate(profile_id,candidate_tier,policy_version_id,trigger_kind,evidence)
 values(p.id,'senior',v.id,p_trigger,jsonb_build_object(
   'joined_on',p.joined_on,'history_coverage_start',p.history_coverage_start,
   'regular_since',regular_since,'senior_years',years,
   'observation_months',observed,'profile_revision',p.revision))
 on conflict do nothing;
end $$;
revoke all on function public.volunteer_record_senior_candidate(uuid,uuid,text) from public,anon,authenticated,service_role;

create or replace function public.volunteer_apply_verified_attendance_policy()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.volunteer_profile%rowtype; v public.volunteer_assessment_policy_version%rowtype;
 verified_count int; before_state jsonb; trigger_shelter text;
begin
 if new.after_fact->>'attendanceStatus' not in ('attended','completed') then return new; end if;
 select vp.* into p from public.volunteer_profile vp join public.volunteer_registration r on r.profile_id=vp.id
 where r.id=new.registration_id and vp.status='active' for update of vp;
 if not found or p.history_coverage_start is null then return new; end if;
 select a.shelter_key into trigger_shelter from public.volunteer_registration r
 join public.volunteer_activity a on a.id=r.activity_id where r.id=new.registration_id;
 select * into v from public.volunteer_assessment_policy_version
 where body->>'timezone'='Asia/Hong_Kong'
 and effective_from<=(clock_timestamp() at time zone (body->>'timezone'))::date
 order by effective_from desc,created_at desc limit 1;
 if not found or v.body->>'promotion_trigger'<>'verified_attendance' then return new; end if;
 select public.volunteer_verified_attendance_count(p.id,v.body,trigger_shelter,((clock_timestamp() at time zone (v.body->>'timezone'))::date+1)) into verified_count;
 if p.tier='newcomer' and verified_count>=(v.body->>'regular_attendance_threshold')::int then
   before_state:=to_jsonb(p);
   update public.volunteer_profile set tier='regular',revision=revision+1 where id=p.id returning * into p;
   insert into public.volunteer_profile_event(profile_id,actor_user_id,event_type,reason,before_snapshot,after_snapshot)
   values(p.id,new.actor_user_id,'verified_attendance_promotion',
     '達到已發布政策的核實出席門檻',before_state,to_jsonb(p));
   insert into public.audit_log(actor_user_id,action,entity,entity_id,detail)
   values(new.actor_user_id,'volunteer_profile.promote_regular','volunteer_profile',p.id::text,
     jsonb_build_object('policy_version_id',v.id,'verified_sessions',verified_count,'profile_revision',p.revision));
 end if;
 perform public.volunteer_record_senior_candidate(p.id,v.id,'verified_attendance');
 return new;
end $$;
revoke all on function public.volunteer_apply_verified_attendance_policy() from public,anon,authenticated,service_role;
drop trigger if exists volunteer_verified_attendance_policy on public.volunteer_attendance_event;
create trigger volunteer_verified_attendance_policy after insert on public.volunteer_attendance_event
for each row execute function public.volunteer_apply_verified_attendance_policy();

create or replace function public.volunteer_assessment_senior_candidate()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare version_id uuid; trigger_name text; actor_id uuid; p public.volunteer_profile%rowtype; before_state jsonb;
begin
 select policy_version_id,completed_by into version_id,actor_id from public.volunteer_monthly_assessment where id=new.assessment_id;
 select body->>'promotion_trigger' into trigger_name from public.volunteer_assessment_policy_version where id=version_id;
 if trigger_name in ('monthly_assessment','verified_attendance') then
   if new.prior_tier='newcomer' and new.recommended_tier='regular' then
     select * into p from public.volunteer_profile where id=new.profile_id for update;
     if p.tier='newcomer' then
       before_state:=to_jsonb(p);
       update public.volunteer_profile set tier='regular',revision=revision+1 where id=p.id returning * into p;
       insert into public.volunteer_profile_event(profile_id,actor_user_id,event_type,reason,before_snapshot,after_snapshot)
       values(p.id,actor_id,case when trigger_name='verified_attendance' then 'monthly_verified_attendance_reconciliation' else 'monthly_assessment_promotion' end,case when trigger_name='verified_attendance' then '月度對帳發現已達逐次核實出席門檻' else '達到已發布每月評核政策的核實出席門檻' end,before_state,to_jsonb(p));
       insert into public.audit_log(actor_user_id,action,entity,entity_id,detail)
       values(actor_id,'volunteer_profile.promote_regular','volunteer_profile',p.id::text,jsonb_build_object('policy_version_id',version_id,'assessment_id',new.assessment_id,'profile_revision',p.revision));
     end if;
   end if;
   perform public.volunteer_record_senior_candidate(new.profile_id,version_id,trigger_name);
 end if;
 return new;
end $$;
revoke all on function public.volunteer_assessment_senior_candidate() from public,anon,authenticated,service_role;
drop trigger if exists volunteer_assessment_senior_candidate on public.volunteer_monthly_assessment_result;
create trigger volunteer_assessment_senior_candidate after insert on public.volunteer_monthly_assessment_result
for each row execute function public.volunteer_assessment_senior_candidate();
