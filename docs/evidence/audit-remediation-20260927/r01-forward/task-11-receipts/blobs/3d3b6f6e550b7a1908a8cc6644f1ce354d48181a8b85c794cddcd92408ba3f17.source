-- Additive policy foundation. Existing canonical activity/registration IDs are retained.
create table public.volunteer_policy_draft (
 template_key text primary key, body jsonb not null, revision bigint not null default 1,
 updated_by uuid references auth.users(id), updated_at timestamptz not null default clock_timestamp()
);
create table public.volunteer_policy_version (
 id uuid primary key default gen_random_uuid(), template_key text not null,
 body jsonb not null, content_hash text not null, effective_from timestamptz not null,
 effective_until timestamptz, source_version_id uuid references public.volunteer_policy_version(id),
 published_by uuid not null references auth.users(id), reason text not null check(length(trim(reason))>0),
 created_at timestamptz not null default clock_timestamp(),
 check(effective_until is null or effective_until>effective_from)
);
create table public.volunteer_policy_preview (
 id uuid primary key default gen_random_uuid(), actor_user_id uuid not null references auth.users(id),
 template_key text not null references public.volunteer_policy_draft(template_key), draft_revision bigint not null,
 candidate jsonb not null, manifest jsonb not null, fingerprint text not null,
 expires_at timestamptz not null, created_at timestamptz not null default clock_timestamp()
);
create table public.volunteer_profile (
 id uuid primary key default gen_random_uuid(), auth_user_id uuid not null unique references auth.users(id),
 supporter_id uuid references public.supporter(id), display_name text not null,
 birth_date date, tier text not null default 'newcomer' check(tier in ('newcomer','regular','senior')),
 status text not null default 'pending' check(status in ('pending','active','suspended')),
 verified_by uuid references auth.users(id), verified_at timestamptz,
 joined_on date, history_coverage_start date, revision bigint not null default 1,
 check(status<>'active' or (verified_by is not null and verified_at is not null))
);
create table public.volunteer_credential_definition (
 key text primary key, label text not null
);
create table public.volunteer_credential (
 id uuid primary key default gen_random_uuid(), profile_id uuid not null references public.volunteer_profile(id),
 credential_key text not null references public.volunteer_credential_definition(key),
 valid_from timestamptz not null, valid_until timestamptz, revoked_at timestamptz,
 verified_by uuid not null references auth.users(id), evidence text not null check(length(trim(evidence))>0),
 check(valid_until is null or valid_until>valid_from)
);
create table public.volunteer_terms_version (
 id uuid primary key default gen_random_uuid(), body text not null, content_hash text not null,
 published_at timestamptz not null, published_by uuid references auth.users(id)
);
create table public.volunteer_terms_acceptance (
 id uuid primary key default gen_random_uuid(), profile_id uuid not null references public.volunteer_profile(id),
 version_id uuid not null references public.volunteer_terms_version(id), accepted_at timestamptz not null default clock_timestamp(),
 source text not null, unique(profile_id,version_id)
);
create table public.volunteer_command_result (
 actor_user_id uuid not null references auth.users(id), operation text not null, idempotency_key uuid not null,
 payload_hash text not null, result jsonb not null, created_at timestamptz not null default clock_timestamp(),
 primary key(actor_user_id,operation,idempotency_key)
);
create table public.volunteer_operation_outbox (
 id uuid primary key default gen_random_uuid(), dedup_key text not null unique, kind text not null,
 payload jsonb not null, status text not null default 'queued' check(status in ('queued','claimed','provider_accepted','delivered','failed')),
 attempts integer not null default 0, available_at timestamptz not null default clock_timestamp(),
 claimed_until timestamptz, last_error text, created_at timestamptz not null default clock_timestamp()
);
alter table public.volunteer_activity add column policy_version_id uuid references public.volunteer_policy_version(id),
 add column policy_revision bigint not null default 0, add column template_key text,
 add column shelter_key text, add column group_headcount integer not null default 0 check(group_headcount>=0);
alter table public.volunteer_registration add column profile_id uuid references public.volunteer_profile(id),
 add column duty_role text, add column booking_policy_version_id uuid references public.volunteer_policy_version(id),
 add column terms_acceptance_id uuid references public.volunteer_terms_acceptance(id);
create unique index volunteer_active_profile_session on public.volunteer_registration(profile_id,activity_id)
 where profile_id is not null and status in ('pending','approved','waitlisted');

-- No direct browser writes; actor authorization is checked again inside commands.
do $$ declare t text; begin
 foreach t in array array['volunteer_policy_draft','volunteer_policy_version','volunteer_policy_preview','volunteer_profile','volunteer_credential_definition','volunteer_credential','volunteer_terms_version','volunteer_terms_acceptance','volunteer_command_result','volunteer_operation_outbox'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 execute format('grant select, insert, update, delete on public.%I to service_role',t);
 end loop;
end $$;

create function public.volunteer_policy_admin(p_actor uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from public.admin_user where auth_user_id=p_actor and role='admin' and status='active') then
 raise exception 'volunteer_forbidden' using errcode='42501'; end if;
end $$;
revoke all on function public.volunteer_policy_admin(uuid) from public,anon,authenticated;
grant execute on function public.volunteer_policy_admin(uuid) to service_role;

create function public.volunteer_immutable_fact() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin raise exception 'immutable_volunteer_fact' using errcode='42501'; end $$;
create trigger volunteer_policy_immutable before update or delete on public.volunteer_policy_version for each row execute function public.volunteer_immutable_fact();
create trigger volunteer_terms_immutable before update or delete on public.volunteer_terms_version for each row execute function public.volunteer_immutable_fact();
create trigger volunteer_acceptance_immutable before update or delete on public.volunteer_terms_acceptance for each row execute function public.volunteer_immutable_fact();

create function public.volunteer_domain_guard() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin perform pg_advisory_xact_lock(hashtextextended('volunteer-domain',0)); return null; end $$;
-- Statement triggers take the guard before row locks, including legacy mutation entry points.
create trigger volunteer_activity_domain_guard before insert or update or delete on public.volunteer_activity for each statement execute function public.volunteer_domain_guard();
create trigger volunteer_registration_domain_guard before insert or update or delete on public.volunteer_registration for each statement execute function public.volunteer_domain_guard();

create function public.volunteer_policy_window(p_window jsonb,p_start timestamptz,p_timezone text) returns timestamptz language plpgsql immutable set search_path=public,pg_temp as $$
begin
 case p_window->>'mode'
 when 'hours_before' then return p_start-make_interval(hours=>(p_window->>'value')::integer);
 when 'calendar_days_before' then return (((p_start at time zone p_timezone)::date-(p_window->>'value')::integer)+(p_window->>'at')::time) at time zone p_timezone;
 when 'unrestricted' then return '-infinity'::timestamptz;
 when 'disabled' then return 'infinity'::timestamptz;
 else raise exception 'invalid_policy_window' using errcode='22023'; end case;
end $$;
revoke all on function public.volunteer_policy_window(jsonb,timestamptz,text) from public,anon,authenticated;
grant execute on function public.volunteer_policy_window(jsonb,timestamptz,text) to service_role;

create table public.volunteer_daily_policy_binding (
 scope_key text not null, service_date date not null, body jsonb not null,
 revision bigint not null default 1, primary key(scope_key,service_date)
);
alter table public.volunteer_daily_policy_binding enable row level security;
revoke all on public.volunteer_daily_policy_binding from anon,authenticated;
grant select,insert,update,delete on public.volunteer_daily_policy_binding to service_role;

create function public.volunteer_policy_credentials(p_profile uuid,p_requirement jsonb,p_at timestamptz) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select case when p_requirement->>'mode'='any' then exists(
 select 1 from jsonb_array_elements_text(p_requirement->'keys') k where exists(select 1 from public.volunteer_credential c where c.profile_id=p_profile and c.credential_key=k and c.revoked_at is null and c.valid_from<=p_at and (c.valid_until is null or c.valid_until>p_at)))
 else not exists(select 1 from jsonb_array_elements_text(p_requirement->'keys') k where not exists(select 1 from public.volunteer_credential c where c.profile_id=p_profile and c.credential_key=k and c.revoked_at is null and c.valid_from<=p_at and (c.valid_until is null or c.valid_until>p_at))) end;
$$;
revoke all on function public.volunteer_policy_credentials(uuid,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.volunteer_policy_credentials(uuid,jsonb,timestamptz) to service_role;

-- One evaluator serves public availability, booking, staff approval and promotion.
-- Its clock is supplied only by trusted commands after acquiring the domain guard.
create function public.volunteer_policy_evaluate(p_activity uuid,p_profile uuid,p_role text,p_now timestamptz,p_exclude uuid default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.volunteer_activity%rowtype; p jsonb; v public.volunteer_profile%rowtype;
 role_config jsonb; q jsonb; r jsonb; pool jsonb; used_count integer; count_value integer; cap integer; role_used integer;
 reserved_remaining integer:=0; released integer; maximum integer; quota_max integer; weekday integer;
 check_at timestamptz; opens timestamptz; closes timestamptz; v_service_date date; v_scope_key text; daily jsonb;
 reason text; next_boundary timestamptz; result jsonb;
begin
 select * into a from public.volunteer_activity where id=p_activity;
 if not found then return jsonb_build_object('allowed',false,'reason','not_found'); end if;
 select body into p from public.volunteer_policy_version where id=a.policy_version_id;
 if p is null then return jsonb_build_object('allowed',false,'reason','legacy_identity_review_required'); end if;
 select * into v from public.volunteer_profile where id=p_profile;
 if not found or v.status<>'active' then return jsonb_build_object('allowed',false,'reason','verified_profile_required'); end if;
 check_at:=case when p#>>'{eligibility,valid_at}'='session' then a.starts_at else p_now end;
 v_service_date:=(a.starts_at at time zone (p->>'timezone'))::date;
 weekday:=extract(dow from v_service_date);
 select coalesce(sum(participant_count),0)::integer into used_count from public.volunteer_registration where activity_id=a.id and status='approved' and (p_exclude is null or id<>p_exclude);
 cap:=(p#>>'{capacity,volunteers,value}')::integer;
 if p#>>'{capacity,shared_total,state}'='value' then cap:=least(cap,(p#>>'{capacity,shared_total,value}')::integer-case when (p#>>'{capacity,group_in_shared_total}')::boolean then a.group_headcount else 0 end); end if;
 result:=jsonb_build_object('policy_version_id',a.policy_version_id,'policy_revision',a.policy_revision,'capacity',cap,'confirmed',used_count,'remaining',greatest(0,cap-used_count));
 if a.status<>'published' or a.starts_at<=p_now or not (p#>>'{schedule,enabled}')::boolean then reason:='activity_closed';
 elsif (p#>>'{schedule,effective_from}' is not null and v_service_date<(p#>>'{schedule,effective_from}')::date) or (p#>>'{schedule,effective_until}' is not null and v_service_date>(p#>>'{schedule,effective_until}')::date) then reason:='date_closed';
 elsif (p#>>'{booking,scenario}'='confirmed_group' and a.group_headcount=0) or (p#>>'{booking,scenario}'='no_confirmed_group' and a.group_headcount>0) then reason:='group_scenario_mismatch';
 elsif not (p#>'{schedule,weekdays}' @> jsonb_build_array(weekday)) or p#>'{schedule,excluded_dates}' @> to_jsonb(array[v_service_date::text]) then reason:='date_closed';
 elsif not (p#>'{eligibility,allowed_tiers}' ? v.tier) then reason:='tier_not_allowed';
 elsif v.birth_date is null or extract(year from age(v_service_date,v.birth_date))<(p#>>'{eligibility,min_age}')::integer then reason:='minimum_age_not_met';
 elsif not public.volunteer_policy_credentials(v.id,p#>'{eligibility,credentials}',check_at) then reason:='credentials_required';
 end if;
 select value into role_config from jsonb_array_elements(p->'roles') where value->>'key'=p_role;
 if role_config is null and jsonb_array_length(p->'roles')=0 and p_role='volunteer' then role_config:=jsonb_build_object('key','volunteer','allowed_tiers',p#>'{eligibility,allowed_tiers}','credentials',p#>'{eligibility,credentials}','maximum',jsonb_build_object('state','unlimited')); end if;
 if reason is null and (role_config is null or not (role_config->'allowed_tiers' ? v.tier)) then reason:='role_not_allowed'; end if;
 if reason is null and not public.volunteer_policy_credentials(v.id,role_config->'credentials',check_at) then reason:='credentials_required'; end if;
 opens:=public.volunteer_policy_window(p#>'{booking,individual_open}',a.starts_at,p->>'timezone');
 closes:=case when p#>>'{booking,individual_close,mode}'='unrestricted' then a.starts_at else public.volunteer_policy_window(p#>'{booking,individual_close}',a.starts_at,p->>'timezone') end;
 if reason is null and p_now<opens then reason:='not_open'; end if;
 if reason is null and p_now>=closes then reason:='registration_closed'; end if;
 next_boundary:=least(case when opens>p_now then opens end,case when closes>p_now then closes end);
 if reason is null and exists(select 1 from public.volunteer_registration b join public.volunteer_activity other on other.id=b.activity_id where b.profile_id=v.id and b.status='approved' and (p_exclude is null or b.id<>p_exclude) and tstzrange(other.starts_at,coalesce(other.ends_at,other.starts_at+interval '1 second'),'[)') && tstzrange(a.starts_at,a.ends_at,'[)')) then reason:='overlapping_duty'; end if;
 if reason is null and exists(select 1 from public.volunteer_registration where profile_id=v.id and activity_id=a.id and status in ('pending','approved','waitlisted') and (p_exclude is null or id<>p_exclude)) then reason:='duplicate_booking'; end if;
 if reason is null and used_count>=cap then reason:='capacity_full'; end if;
 select count(*) into role_used from public.volunteer_registration where activity_id=a.id and duty_role=p_role and status='approved' and (p_exclude is null or id<>p_exclude);
 if reason is null and role_config#>>'{maximum,state}'='value' and role_used>=(role_config#>>'{maximum,value}')::integer then reason:='role_full'; end if;
 -- Retained minimum staffing is informational; only reservations restrict seats.
 for pool in select value from jsonb_array_elements(p->'roles') where value->>'key'<>p_role loop
  select count(*) into role_used from public.volunteer_registration where activity_id=a.id and duty_role=pool->>'key' and status='approved' and (p_exclude is null or id<>p_exclude);
  released:=0;
  for r in select value from jsonb_array_elements(p->'release_rules') order by (value->>'priority')::integer loop
   if r#>>'{action,type}'='release_reserved' and r#>>'{action,pool}'=pool->>'key' and r->'allowed_tiers' ? v.tier and public.volunteer_policy_credentials(v.id,r->'credentials',check_at) then
    if a.starts_at-make_interval(hours=>(r->>'within_hours')::integer)>p_now then next_boundary:=least(next_boundary,a.starts_at-make_interval(hours=>(r->>'within_hours')::integer)); end if;
    select count(*) into count_value from public.volunteer_registration b join public.volunteer_profile bp on bp.id=b.profile_id where b.activity_id=a.id and b.status='approved' and r#>'{condition,tiers}' ? bp.tier;
    if p_now>=a.starts_at-make_interval(hours=>(r->>'within_hours')::integer) and ((r#>>'{condition,operator}'='lt' and count_value<(r#>>'{condition,threshold}')::integer) or (r#>>'{condition,operator}'='lte' and count_value<=(r#>>'{condition,threshold}')::integer)) then released:=(r#>>'{action,quantity}')::integer; end if;
   end if;
  end loop;
  reserved_remaining:=reserved_remaining+greatest(0,(pool->>'reserved')::integer-released-role_used);
 end loop;
 if reason is null and cap-used_count<=reserved_remaining then reason:='reserved_for_core_role'; end if;
 for q in select value from jsonb_array_elements(p->'tier_quotas') where value->'tiers' ? v.tier loop
  quota_max:=case when q#>>'{maximum,state}'='unlimited' then 2147483647 else (q#>>'{maximum,value}')::integer end;
  for r in select value from jsonb_array_elements(p->'release_rules') order by (value->>'priority')::integer loop
   if r#>>'{action,type}'='relax_quota' and r#>>'{action,scope}'='session' and r#>>'{action,quota}'=q->>'key' and r->'allowed_tiers' ? v.tier and public.volunteer_policy_credentials(v.id,r->'credentials',check_at) then
    select count(*) into count_value from public.volunteer_registration b join public.volunteer_profile bp on bp.id=b.profile_id where b.activity_id=a.id and b.status='approved' and r#>'{condition,tiers}' ? bp.tier;
    if p_now>=a.starts_at-make_interval(hours=>(r->>'within_hours')::integer) and ((r#>>'{condition,operator}'='lt' and count_value<(r#>>'{condition,threshold}')::integer) or (r#>>'{condition,operator}'='lte' and count_value<=(r#>>'{condition,threshold}')::integer)) then
     quota_max:=(r#>>'{action,new_maximum}')::integer;
     if jsonb_typeof(r->'weekdays')='array' then q:=jsonb_set(q,'{weekdays}',r->'weekdays'); end if;
    end if;
   end if;
  end loop;
  select count(*) into count_value from public.volunteer_registration b join public.volunteer_profile bp on bp.id=b.profile_id where b.activity_id=a.id and b.status='approved' and q->'tiers' ? bp.tier and (p_exclude is null or b.id<>p_exclude);
  if reason is null and not (q->'weekdays' @> jsonb_build_array(weekday)) then reason:='tier_weekday_not_allowed'; end if;
  if reason is null and count_value>=quota_max then reason:='tier_quota_full'; end if;
 end loop;
 for q in select value from jsonb_array_elements(p->'daily_limits') loop
  v_scope_key:=case when q->>'scope'='all_shelters_day' then 'all' else p->>'shelter' end||':'||(q->>'key');
  select body into daily from public.volunteer_daily_policy_binding where volunteer_daily_policy_binding.scope_key=v_scope_key and volunteer_daily_policy_binding.service_date=v_service_date;
  if daily is null then reason:='daily_policy_not_bound'; continue; end if;
  if not (daily->'tiers' ? v.tier) then continue; end if;
  maximum:=case when daily#>>'{maximum,state}'='unlimited' then 2147483647 else (daily#>>'{maximum,value}')::integer end;
  select case when daily->>'count_mode'='distinct_people' then count(distinct b.profile_id) else count(*) end into count_value
  from public.volunteer_registration b join public.volunteer_activity ba on ba.id=b.activity_id join public.volunteer_profile bp on bp.id=b.profile_id
  where b.status='approved' and (ba.starts_at at time zone (p->>'timezone'))::date=v_service_date and (daily->>'scope'='all_shelters_day' or ba.shelter_key=a.shelter_key) and daily->'tiers' ? bp.tier and (p_exclude is null or b.id<>p_exclude);
  if reason is null and count_value>=maximum and not (daily->>'count_mode'='distinct_people' and exists(select 1 from public.volunteer_registration b join public.volunteer_activity ba on ba.id=b.activity_id where b.profile_id=v.id and b.status='approved' and (ba.starts_at at time zone (p->>'timezone'))::date=v_service_date and (daily->>'scope'='all_shelters_day' or ba.shelter_key=a.shelter_key))) then reason:='daily_quota_full'; end if;
 end loop;
 return result||jsonb_build_object('allowed',reason is null,'reason',coalesce(reason,'available'),'next_boundary',next_boundary,'message',case when reason='credentials_required' then coalesce(p#>>'{eligibility,missing_credentials_message}','本時段需要已核實資格') end);
end $$;
revoke all on function public.volunteer_policy_evaluate(uuid,uuid,text,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.volunteer_policy_evaluate(uuid,uuid,text,timestamptz,uuid) to service_role;

create table public.volunteer_policy_schedule (
 template_key text not null, effective_from timestamptz not null, effective_until timestamptz,
 version_id uuid not null references public.volunteer_policy_version(id),
 primary key(template_key,effective_from), check(effective_until is null or effective_until>effective_from)
);
alter table public.volunteer_policy_schedule enable row level security;
revoke all on public.volunteer_policy_schedule from anon,authenticated;
grant select,insert,update,delete on public.volunteer_policy_schedule to service_role;

create function public.volunteer_validate_policy(p jsonb) returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare issues jsonb:='[]'; r jsonb; total integer; reserved integer; minimum integer; key_name text;
begin
 issues:=public.volunteer_validate_policy_shape(p);
 if jsonb_array_length(issues)>0 then return issues; end if;
 issues:=issues||public.volunteer_validate_daily_policy(p);
 if jsonb_array_length(issues)>0 then return issues; end if;
 if jsonb_typeof(p)<>'object' or p->>'schema_version'<>'1' then return '["invalid_schema"]'::jsonb; end if;
 for key_name in select jsonb_object_keys(p) loop
 if not key_name=any(array['schema_version','template_key','name','shelter','timezone','schedule','capacity','eligibility','roles','tier_quotas','daily_limits','release_rules','booking','remarks','terms','source']) then issues:=issues||jsonb_build_array('unknown_field:'||key_name); end if; end loop;
 if jsonb_path_exists(p,'$.** ? (@.state == "unresolved" || @.state == "inherit")') then issues:=issues||'["unresolved_settings"]'::jsonb; end if;
 if p#>>'{capacity,volunteers,state}'<>'value' or (p#>>'{capacity,volunteers,value}')::integer<=0 then issues:=issues||'["invalid_capacity"]'::jsonb; end if;
 total:=(p#>>'{capacity,volunteers,value}')::integer;
 if p#>>'{schedule,start_time}'>=p#>>'{schedule,end_time}' then issues:=issues||'["invalid_time_range"]'::jsonb; end if;
 if not exists(select 1 from pg_timezone_names where name=p->>'timezone') then issues:=issues||'["invalid_timezone"]'::jsonb; end if;
 if jsonb_array_length(p#>'{eligibility,allowed_tiers}')=0 or not ((p#>'{eligibility,allowed_tiers}') <@ '["newcomer","regular","senior"]'::jsonb) then issues:=issues||'["invalid_tiers"]'::jsonb; end if;
 if (p#>>'{eligibility,min_age}')::integer<0 or (p#>>'{eligibility,min_age}')::integer>120 then issues:=issues||'["invalid_min_age"]'::jsonb; end if;
 if (p#>>'{remarks,max_length}')::integer<1 or (p#>>'{remarks,max_length}')::integer>5000 then issues:=issues||'["invalid_remarks"]'::jsonb; end if;
 select coalesce(sum((value->>'reserved')::integer),0),coalesce(sum((value->>'minimum')::integer),0) into reserved,minimum from jsonb_array_elements(p->'roles');
 if p#>>'{capacity,role_count_model}'='leader_in_assistants' then reserved:=reserved-coalesce((select (r->>'reserved')::integer from jsonb_array_elements(p->'roles') r where r->>'key'='leader'),0); minimum:=minimum-coalesce((select (r->>'minimum')::integer from jsonb_array_elements(p->'roles') r where r->>'key'='leader'),0); end if;
 if reserved>total or minimum>total then issues:=issues||'["impossible_core_capacity"]'::jsonb; end if;
 for r in select value from jsonb_array_elements(p->'roles') loop
 if (r->>'reserved')::integer<0 or (r->>'minimum')::integer<0 or (r#>>'{maximum,state}'='value' and ((r#>>'{maximum,value}')::integer<greatest((r->>'reserved')::integer,(r->>'minimum')::integer))) then issues:=issues||'["invalid_role_quota"]'::jsonb; end if;
 end loop;
 for r in select value from jsonb_array_elements(p->'release_rules') loop
 if r#>>'{action,type}' not in ('release_reserved','relax_quota') or r#>>'{condition,operator}' not in ('lt','lte') or (r->>'within_hours')::integer<0 or (r#>>'{condition,threshold}')::integer<0 then issues:=issues||'["invalid_release"]'::jsonb; end if;
 if r#>>'{action,type}'='release_reserved' and not exists(select 1 from jsonb_array_elements(p->'roles') pool where pool->>'key'=r#>>'{action,pool}' and (pool->>'reserved')::integer>=(r#>>'{action,quantity}')::integer and (r#>>'{action,quantity}')::integer>=0) then issues:=issues||'["invalid_release_pool"]'::jsonb; end if;
 end loop;
 return issues;
exception when others then return '["invalid_policy_value"]'::jsonb;
end $$;
revoke all on function public.volunteer_validate_policy(jsonb) from public,anon,authenticated;
grant execute on function public.volunteer_validate_policy(jsonb) to service_role;

create function public.volunteer_policy_manifest(p_ids jsonb,p_body jsonb,p_now timestamptz) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'title',a.title,'starts_at',a.starts_at,'ends_at',a.ends_at,'capacity',a.capacity,'policy_revision',a.policy_revision,'updated_at',a.updated_at,'group_headcount',a.group_headcount,
 'approved_participants',counts.approved,'waitlisted_participants',counts.waitlisted,'registrations_hash',counts.fingerprint,
 'phase',jsonb_build_object('opened',p_now>=public.volunteer_policy_window(p_body#>'{booking,individual_open}',a.starts_at,p_body->>'timezone'),'closed',p_now>=public.volunteer_policy_window(p_body#>'{booking,individual_close}',a.starts_at,p_body->>'timezone'),'release', (select coalesce(jsonb_agg(p_now>=a.starts_at-make_interval(hours=>(r->>'within_hours')::integer)),'[]'::jsonb) from jsonb_array_elements(p_body->'release_rules') r)),
 'conflicts',case when a.starts_at<=p_now then '["historical_session"]'::jsonb when counts.approved>(p_body#>>'{capacity,volunteers,value}')::integer then '["capacity_below_occupancy"]'::jsonb else '[]'::jsonb end) order by a.id),'[]'::jsonb)
 from public.volunteer_activity a cross join lateral (
 select coalesce(sum(participant_count) filter(where status='approved'),0) approved,coalesce(sum(participant_count) filter(where status='waitlisted'),0) waitlisted,
 md5(coalesce(string_agg(id::text||status||updated_at::text,',' order by id),'')) fingerprint from public.volunteer_registration where activity_id=a.id) counts
 where a.id in(select value::uuid from jsonb_array_elements_text(p_ids));
$$;
revoke all on function public.volunteer_policy_manifest(jsonb,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.volunteer_policy_manifest(jsonb,jsonb,timestamptz) to service_role;

create function public.volunteer_policy_fingerprint(p_manifest jsonb) returns text language sql stable security definer set search_path=public,pg_temp as $$
 select md5(p_manifest::text||coalesce((select string_agg(id::text||revision::text||status||tier,',' order by id) from public.volunteer_profile),'')||coalesce((select string_agg(to_jsonb(c)::text,',' order by id) from public.volunteer_credential c),''));
$$;
revoke all on function public.volunteer_policy_fingerprint(jsonb) from public,anon,authenticated;
grant execute on function public.volunteer_policy_fingerprint(jsonb) to service_role;

create function public.volunteer_policy_command(p_actor uuid,p_command jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare action text:=p_command->>'action'; d public.volunteer_policy_draft%rowtype; prev public.volunteer_policy_preview%rowtype;
 version_row public.volunteer_policy_version%rowtype; command_row public.volunteer_command_result%rowtype;
 body jsonb; manifest jsonb; issues jsonb; result jsonb; current_clock timestamptz; new_id uuid; template text; starts timestamptz; ends timestamptz;
 effective timestamptz; until_time timestamptz; target uuid; ids jsonb; payload_hash text:=md5(p_command::text); q jsonb; daily_key text; existing_daily jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended('volunteer-domain',0));
 perform public.volunteer_policy_admin(p_actor);
 current_clock:=clock_timestamp();
 if action in ('publish','generate') then
  select * into command_row from public.volunteer_command_result where actor_user_id=p_actor and operation=action and idempotency_key=(p_command->>'idempotency_key')::uuid;
  if found then if command_row.payload_hash<>payload_hash then return jsonb_build_object('kind','conflict','reason','idempotency_payload_changed'); end if; return command_row.result; end if;
 end if;
 if action='list' then
  return jsonb_build_object('drafts',(select coalesce(jsonb_agg(to_jsonb(x) order by template_key),'[]') from public.volunteer_policy_draft x),
   'versions',(select coalesce(jsonb_agg(to_jsonb(x) order by created_at desc),'[]') from public.volunteer_policy_version x),
   'activities',(select coalesce(jsonb_agg(to_jsonb(x) order by starts_at),'[]') from (select a.id,a.title,a.starts_at,a.ends_at,a.capacity,a.policy_version_id,a.policy_revision,a.template_key,a.shelter_key,
   coalesce((select sum(participant_count) from public.volunteer_registration where activity_id=a.id and status='approved'),0) approved_participants,
   coalesce((select sum(participant_count) from public.volunteer_registration where activity_id=a.id and status='waitlisted'),0) waitlisted_participants from public.volunteer_activity a where a.starts_at>current_clock order by a.starts_at limit 500) x));
 elsif action in ('save','copy') then
  body:=p_command->'body'; template:=p_command->>'template_key';
  if action='copy' then select * into version_row from public.volunteer_policy_version where id=(p_command->>'version_id')::uuid; if not found then return jsonb_build_object('kind','not_found'); end if; body:=version_row.body; template:=version_row.template_key; end if;
  if body->>'template_key' is distinct from template or body->>'schema_version'<>'1' then raise exception 'invalid_policy' using errcode='22023'; end if;
  select * into d from public.volunteer_policy_draft where template_key=template for update;
  if coalesce(d.revision,0) is distinct from (p_command->>'expected_revision')::bigint then return jsonb_build_object('kind','conflict','current',to_jsonb(d)); end if;
  insert into public.volunteer_policy_draft(template_key,body,revision,updated_by) values(template,body,1,p_actor)
  on conflict(template_key) do update set body=excluded.body,revision=volunteer_policy_draft.revision+1,updated_by=p_actor,updated_at=current_clock returning * into d;
  insert into public.audit_log(actor_user_id,action,entity,entity_id,detail) values(p_actor,'volunteer_policy.draft_saved','volunteer_policy',template,jsonb_build_object('revision',d.revision));
  return jsonb_build_object('kind','saved','draft',to_jsonb(d));
 elsif action='preview' then
  select * into d from public.volunteer_policy_draft where template_key=p_command->>'template_key' for update;
  if not found then return jsonb_build_object('kind','not_found'); end if;
  if d.revision is distinct from (p_command->>'expected_revision')::bigint then return jsonb_build_object('kind','conflict','current',to_jsonb(d)); end if;
  issues:=public.volunteer_validate_policy(d.body);
  if jsonb_array_length(issues)>0 then return jsonb_build_object('kind','invalid','issues',issues); end if;
  effective:=(p_command->>'effective_from')::timestamptz; until_time:=(p_command->>'effective_until')::timestamptz;
  if effective<current_clock or (until_time is not null and until_time<=effective) then return jsonb_build_object('kind','invalid','issues','["invalid_effective_range"]'::jsonb); end if;
  ids:=p_command->'activity_ids';
  if jsonb_array_length(ids)>100 or (select count(distinct value) from jsonb_array_elements_text(ids))<>jsonb_array_length(ids) then raise exception 'invalid_targets' using errcode='22023'; end if;
  manifest:=public.volunteer_policy_manifest(ids,d.body,current_clock);
  if jsonb_array_length(manifest)<>jsonb_array_length(ids) then return jsonb_build_object('kind','invalid','issues','["missing_activity"]'::jsonb); end if;
  if exists(select 1 from jsonb_array_elements(manifest) m where jsonb_array_length(m->'conflicts')>0) then return jsonb_build_object('kind','invalid','manifest',manifest,'issues','["session_conflicts"]'::jsonb); end if;
  if exists(select 1 from public.volunteer_activity where id in(select value::uuid from jsonb_array_elements_text(ids)) and (starts_at<effective or (until_time is not null and starts_at>=until_time) or (template_key is not null and template_key<>d.template_key))) then return jsonb_build_object('kind','invalid','issues','["target_outside_scope"]'::jsonb); end if;
  insert into public.volunteer_policy_preview(actor_user_id,template_key,draft_revision,candidate,manifest,fingerprint,expires_at) values(p_actor,d.template_key,d.revision,jsonb_build_object('body',d.body,'effective_from',effective,'effective_until',until_time,'activity_ids',ids),manifest,public.volunteer_policy_fingerprint(manifest),current_clock+interval '5 minutes') returning id into new_id;
  return jsonb_build_object('kind','preview','preview_id',new_id,'candidate',d.body,'manifest',manifest,'issues',issues,'previous',(select pv.body from public.volunteer_policy_version pv where pv.template_key=d.template_key order by pv.created_at desc limit 1));
 elsif action='publish' then
  select * into prev from public.volunteer_policy_preview where id=(p_command->>'preview_id')::uuid and actor_user_id=p_actor for update;
  if not found then return jsonb_build_object('kind','not_found'); end if;
  select * into d from public.volunteer_policy_draft where template_key=prev.template_key for update;
  body:=prev.candidate->'body'; ids:=prev.candidate->'activity_ids'; effective:=(prev.candidate->>'effective_from')::timestamptz; until_time:=(prev.candidate->>'effective_until')::timestamptz;
  manifest:=public.volunteer_policy_manifest(ids,body,current_clock);
  if d.revision<>prev.draft_revision or prev.expires_at<=current_clock or public.volunteer_policy_fingerprint(manifest)<>prev.fingerprint then return jsonb_build_object('kind','conflict','current',to_jsonb(d),'manifest',manifest); end if;
  issues:=public.volunteer_validate_policy(body);
  if jsonb_array_length(issues)>0 or effective<current_clock then return jsonb_build_object('kind','invalid','issues',issues); end if;
  if length(trim(coalesce(p_command->>'reason','')))=0 then raise exception 'publication_reason_required' using errcode='22023'; end if;
  -- A new schedule closes a previous open interval prospectively; version contents never change.
  if exists(select 1 from public.volunteer_policy_schedule where template_key=d.template_key and effective_from>effective and (until_time is null or effective_from<until_time)) then return jsonb_build_object('kind','invalid','issues','["future_schedule_overlap"]'::jsonb); end if;
  insert into public.volunteer_policy_version(template_key,body,content_hash,effective_from,effective_until,published_by,reason) values(d.template_key,body,md5(body::text),effective,until_time,p_actor,p_command->>'reason') returning id into new_id;
  update public.volunteer_policy_schedule set effective_until=effective where template_key=d.template_key and effective_from<effective and (effective_until is null or effective_until>effective);
  insert into public.volunteer_policy_schedule(template_key,effective_from,effective_until,version_id) values(d.template_key,effective,until_time,new_id) on conflict(template_key,effective_from) do update set effective_until=excluded.effective_until,version_id=excluded.version_id;
  perform set_config('hkscda.policy_command','apply',true);
  for target in select value::uuid from jsonb_array_elements_text(ids) order by value loop
   update public.volunteer_activity set starts_at=((((starts_at at time zone (body->>'timezone'))::date)+(body#>>'{schedule,start_time}')::time) at time zone (body->>'timezone')),ends_at=((((starts_at at time zone (body->>'timezone'))::date)+(body#>>'{schedule,end_time}')::time) at time zone (body->>'timezone')),location=body#>>'{schedule,location}',policy_version_id=new_id,policy_revision=policy_revision+1,template_key=d.template_key,shelter_key=body->>'shelter',capacity=(body#>>'{capacity,volunteers,value}')::integer,min_age=(body#>>'{eligibility,min_age}')::integer,auto_approve=(body#>>'{booking,auto_approve}')::boolean,allow_waitlist=(body#>>'{booking,allow_waitlist}')::boolean where id=target;
  end loop;
  perform set_config('hkscda.policy_command','',true);
  insert into public.audit_log(actor_user_id,action,entity,entity_id,detail) values(p_actor,'volunteer_policy.published','volunteer_policy',new_id::text,jsonb_build_object('manifest',manifest,'reason',p_command->>'reason','hash',md5(body::text)));
  result:=jsonb_build_object('kind','published','version_id',new_id,'activity_ids',ids);
 elsif action='generate' then
  template:=p_command->>'template_key';
  select v.* into version_row from public.volunteer_policy_schedule s join public.volunteer_policy_version v on v.id=s.version_id
   where s.template_key=template and (((p_command->>'date')::date+(v.body#>>'{schedule,start_time}')::time) at time zone (v.body->>'timezone'))>=s.effective_from
   and (s.effective_until is null or (((p_command->>'date')::date+(v.body#>>'{schedule,start_time}')::time) at time zone (v.body->>'timezone'))<s.effective_until) order by s.effective_from desc limit 1;
  if not found then return jsonb_build_object('kind','invalid','issues','["no_published_policy_for_date"]'::jsonb); end if;
  body:=version_row.body; starts:=((p_command->>'date')::date+(body#>>'{schedule,start_time}')::time) at time zone (body->>'timezone'); ends:=((p_command->>'date')::date+(body#>>'{schedule,end_time}')::time) at time zone (body->>'timezone');
  if starts<=current_clock or not (body#>>'{schedule,enabled}')::boolean or not (body#>'{schedule,weekdays}' @> jsonb_build_array(extract(dow from starts at time zone (body->>'timezone'))::integer)) or body#>'{schedule,excluded_dates}' ? (p_command->>'date') then return jsonb_build_object('kind','invalid','issues','["date_closed"]'::jsonb); end if;
  if exists(select 1 from public.volunteer_activity where template_key=template and starts_at=starts) then return jsonb_build_object('kind','conflict','reason','session_already_generated'); end if;
  perform public.volunteer_bind_daily_policy(body,(p_command->>'date')::date);
  insert into public.volunteer_activity(type,title,starts_at,ends_at,location,capacity,min_age,auto_approve,allow_waitlist,status,registration_modes,policy_version_id,policy_revision,template_key,shelter_key)
   values('volunteer_shift',body->>'name',starts,ends,body#>>'{schedule,location}',(body#>>'{capacity,volunteers,value}')::integer,(body#>>'{eligibility,min_age}')::integer,(body#>>'{booking,auto_approve}')::boolean,(body#>>'{booking,allow_waitlist}')::boolean,'published',array['individual'],version_row.id,1,template,body->>'shelter') returning id into new_id;
  insert into public.audit_log(actor_user_id,action,entity,entity_id,detail) values(p_actor,'volunteer_activity.generated','volunteer_activity',new_id::text,jsonb_build_object('policy_version_id',version_row.id));
  result:=jsonb_build_object('kind','generated','activity_id',new_id);
 else raise exception 'invalid_policy_command' using errcode='22023'; end if;
 insert into public.volunteer_command_result(actor_user_id,operation,idempotency_key,payload_hash,result) values(p_actor,action,(p_command->>'idempotency_key')::uuid,payload_hash,result);
 return result;
end $$;
revoke all on function public.volunteer_policy_command(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.volunteer_policy_command(uuid,jsonb) to service_role;

-- Stable, published initial terms; no acceptance is created by this migration.
insert into public.volunteer_terms_version(id,body,content_hash,published_at)
select 'c9c6278a-c73a-4f0c-9b93-6e2b4089141a', terms_body, encode(extensions.digest(terms_body,'sha256'),'hex'), '2026-09-13T00:00:00+08:00'::timestamptz
from (values ($terms$本人同意遵守下列義工守則 :
1. 遵照本會的宗旨及守則，並遵照活動負責人的指導，以免發生意外；
2. 不濫用義工身份，向其他義工及公眾人士索取金錢、物品，或作任何欺詐行為；
3. 不會向服務對象提供本會服務範圍以外的服務或建議；
4. 本人明白香港拯救貓狗協會內所有關於新舊動物主人的資料必須保持機密；
5. 因本人有可能會接觸到動物，本人明白自己需要請教醫生有關防疫注射的問題；
6. 假如本人因事未能履行獲分配的工作，本人應於事前盡早通知義工聯絡人；及
7. 本人明白假若本人在義務工作時受傷，本人並不能得到任何賠償。
本人確認以上資料正確無誤，並同意HKSCDA 有權不時更改義工條款。$terms$)) initial_terms(terms_body);

create function public.volunteer_booking_command(p_actor uuid,p_command jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare profile public.volunteer_profile%rowtype; activity public.volunteer_activity%rowtype;
 prior public.volunteer_command_result%rowtype; registration public.volunteer_registration%rowtype;
 p jsonb; evaluation jsonb; result jsonb; new_id uuid; terms_id uuid; acceptance uuid;
 current_clock timestamptz; payload_hash text:=md5(p_command::text); new_status text; remarks text:=coalesce(p_command->>'remarks',''); action text:=p_command->>'action';
begin
 perform pg_advisory_xact_lock(hashtextextended('volunteer-domain',0));
 current_clock:=clock_timestamp();
 if not exists(select 1 from auth.users where id=p_actor and email_confirmed_at is not null and (banned_until is null or banned_until<=current_clock)) then raise exception 'verified_actor_required' using errcode='42501'; end if;
 select * into profile from public.volunteer_profile where auth_user_id=p_actor;
 if not found or profile.status<>'active' then return jsonb_build_object('kind','denied','reason','verified_profile_required'); end if;
 if action not in ('book','cancel','availability') then raise exception 'invalid_booking_command' using errcode='22023'; end if;
 if action<>'availability' then
 select * into prior from public.volunteer_command_result where actor_user_id=p_actor and operation=action and idempotency_key=(p_command->>'idempotency_key')::uuid;
 if found then if prior.payload_hash<>payload_hash then return jsonb_build_object('kind','conflict','reason','idempotency_payload_changed'); end if; return prior.result; end if;
 end if;
 select * into activity from public.volunteer_activity where id=(p_command->>'activity_id')::uuid for update;
 if not found then return jsonb_build_object('kind','not_found'); end if;
 select body into p from public.volunteer_policy_version where id=activity.policy_version_id;
 if p is null then return jsonb_build_object('kind','denied','reason','legacy_session'); end if;
 if action='cancel' then
 select * into registration from public.volunteer_registration where activity_id=activity.id and profile_id=profile.id and status in ('pending','approved','waitlisted') for update;
 if not found then return jsonb_build_object('kind','not_found'); end if;
 if registration.attendance_status in ('attended','completed') then return jsonb_build_object('kind','denied','reason','attendance_correction_required'); end if;
 update public.volunteer_registration set status='cancelled',status_reason='self_cancelled' where id=registration.id;
 new_id:=registration.id; result:=jsonb_build_object('kind','cancelled','registration_id',new_id);
 else
 evaluation:=public.volunteer_policy_evaluate(activity.id,profile.id,coalesce(p_command->>'role','volunteer'),current_clock);
 if action='availability' then return evaluation||jsonb_build_object('kind','availability'); end if;
 new_status:=case when (p#>>'{booking,auto_approve}')::boolean then 'approved' else 'pending' end;
 if not (evaluation->>'allowed')::boolean then
  if evaluation->>'reason' in ('capacity_full','reserved_for_core_role','role_full','tier_quota_full','daily_quota_full') and (p#>>'{booking,allow_waitlist}')::boolean then
   new_status:='waitlisted';
   if p#>>'{booking,waitlist_limit,state}'='value' and (select count(*) from public.volunteer_registration where activity_id=activity.id and status='waitlisted')>=(p#>>'{booking,waitlist_limit,value}')::integer then return evaluation||jsonb_build_object('kind','denied','reason','waitlist_full'); end if;
  else return evaluation||jsonb_build_object('kind','denied'); end if;
 end if;
 if length(remarks)>(p#>>'{remarks,max_length}')::integer or ((p#>>'{remarks,required}')::boolean and length(trim(remarks))=0) or (not (p#>>'{remarks,allow_free_text}')::boolean and remarks<>'' and not (p#>'{remarks,options}' ? remarks)) then return jsonb_build_object('kind','denied','reason','invalid_remarks'); end if;
 terms_id:=(p#>>'{terms,version_id}')::uuid;
 if terms_id is null then select id into terms_id from public.volunteer_terms_version where published_at<=current_clock order by published_at desc limit 1; end if;
 if terms_id is null or not exists(select 1 from public.volunteer_terms_version where id=terms_id and published_at<=current_clock) then return jsonb_build_object('kind','denied','reason','terms_unavailable'); end if;
 select id into acceptance from public.volunteer_terms_acceptance where profile_id=profile.id and (version_id=terms_id or p#>>'{terms,reconsent}'='existing_acceptance_valid') order by accepted_at desc limit 1;
 if acceptance is null then
  if (p_command->>'terms_version_id')::uuid is distinct from terms_id then return jsonb_build_object('kind','conflict','reason','terms_version_changed'); end if;
  if coalesce((p_command->>'accept_terms')::boolean,false) is not true then return jsonb_build_object('kind','denied','reason','terms_required'); end if;
  insert into public.volunteer_terms_acceptance(profile_id,version_id,source) values(profile.id,terms_id,'verified_volunteer_signup') on conflict(profile_id,version_id) do nothing;
  select id into acceptance from public.volunteer_terms_acceptance where profile_id=profile.id and version_id=terms_id;
 end if;
 insert into public.volunteer_registration(activity_id,supporter_id,registration_type,status,status_reason,participant_count,contact_name,contact_email,contact_phone,language,notes,status_token_hash,status_token_expires_at,profile_id,duty_role,booking_policy_version_id,terms_acceptance_id)
 values(activity.id,profile.supporter_id,'individual',new_status,case when new_status='waitlisted' then evaluation->>'reason' else 'policy_accepted' end,1,profile.display_name,(select email from auth.users where id=p_actor),'','zh-HK',remarks,encode(extensions.gen_random_bytes(32),'hex'),current_clock+interval '90 days',profile.id,coalesce(p_command->>'role','volunteer'),activity.policy_version_id,acceptance) returning id into new_id;
 result:=jsonb_build_object('kind','booked','registration_id',new_id,'status',new_status,'policy_version_id',activity.policy_version_id);
 end if;
 insert into public.audit_log(actor_user_id,action,entity,entity_id,detail) values(p_actor,'volunteer_registration.'||action,'volunteer_registration',new_id::text,jsonb_build_object('policy_version_id',activity.policy_version_id,'result',result));
 insert into public.volunteer_operation_outbox(dedup_key,kind,payload) values(action||':'||new_id::text,'volunteer_booking_changed',jsonb_build_object('registration_id',new_id,'actor_user_id',p_actor));
 insert into public.volunteer_command_result(actor_user_id,operation,idempotency_key,payload_hash,result) values(p_actor,action,(p_command->>'idempotency_key')::uuid,payload_hash,result);
 return result;
end $$;
revoke all on function public.volunteer_booking_command(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.volunteer_booking_command(uuid,jsonb) to service_role;

create function public.volunteer_enforce_registration_policy() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.volunteer_activity%rowtype; evaluation jsonb;
begin
 if tg_op='UPDATE' and old.attendance_status in ('attended','completed') and new.status<>'approved' then raise exception 'attendance_correction_required' using errcode='22023'; end if;
 select * into a from public.volunteer_activity where id=new.activity_id;
 if a.policy_version_id is null then return new; end if;
 if tg_op='UPDATE' and (new.profile_id,new.booking_policy_version_id,new.terms_acceptance_id) is distinct from (old.profile_id,old.booking_policy_version_id,old.terms_acceptance_id) then raise exception 'immutable_booking_identity' using errcode='42501'; end if;
 if new.profile_id is null or new.participant_count<>1 or new.registration_type<>'individual' then raise exception 'verified_profile_required' using errcode='42501'; end if;
 if new.status in ('pending','approved','waitlisted') and (tg_op='INSERT' or new.status is distinct from old.status or new.activity_id is distinct from old.activity_id or new.duty_role is distinct from old.duty_role) then
 evaluation:=public.volunteer_policy_evaluate(a.id,new.profile_id,new.duty_role,clock_timestamp(),case when tg_op='UPDATE' then new.id else null end);
 if not (evaluation->>'allowed')::boolean and not (new.status='waitlisted' and evaluation->>'reason' in ('capacity_full','role_full','tier_quota_full','daily_quota_full','reserved_for_core_role')) then raise exception 'volunteer_policy_denied:%',evaluation->>'reason' using errcode='22023'; end if;
 if new.terms_acceptance_id is null or not exists(select 1 from public.volunteer_terms_acceptance where id=new.terms_acceptance_id and profile_id=new.profile_id) then raise exception 'terms_required' using errcode='22023'; end if;
 end if;
 return new;
end $$;
create trigger volunteer_registration_policy before insert or update on public.volunteer_registration for each row execute function public.volunteer_enforce_registration_policy();
revoke all on function public.volunteer_enforce_registration_policy() from public,anon,authenticated;

create function public.volunteer_enforce_activity_policy() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if tg_op='DELETE' and old.policy_version_id is not null then raise exception 'policy_activity_history_preserved' using errcode='42501'; end if;
 if tg_op='UPDATE' and old.policy_version_id is not null and (new.starts_at,new.ends_at,new.capacity,new.policy_version_id,new.min_age,new.registration_modes,new.auto_approve,new.allow_waitlist) is distinct from (old.starts_at,old.ends_at,old.capacity,old.policy_version_id,old.min_age,old.registration_modes,old.auto_approve,old.allow_waitlist) and coalesce(current_setting('hkscda.policy_command',true),'')<>'apply' then raise exception 'policy_change_requires_versioned_preview' using errcode='42501'; end if;
 if tg_op='UPDATE' and new.status='cancelled' and exists(select 1 from public.volunteer_registration where activity_id=old.id and attendance_status in ('attended','completed')) then raise exception 'attendance_correction_required' using errcode='22023'; end if;
 if tg_op='DELETE' then return old; end if; return new;
end $$;
create trigger volunteer_activity_policy before update or delete on public.volunteer_activity for each row execute function public.volunteer_enforce_activity_policy();

-- Default grants can include TRUNCATE, which row immutability triggers do not cover.
revoke truncate on public.volunteer_policy_version,public.volunteer_terms_version,public.volunteer_terms_acceptance from service_role;

-- Staff status transitions use the public-submission activity lock before any row locks.
create or replace function public.set_volunteer_registration_status_with_audit(p_registration_id uuid,p_actor_user_id uuid,p_expected_updated_at timestamptz,p_status text,p_internal_notes text default null,p_update_internal_notes boolean default true)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_activity_id uuid; v_activity public.volunteer_activity%rowtype; v_registration public.volunteer_registration%rowtype; v_used bigint;
begin
 perform pg_advisory_xact_lock(hashtextextended('volunteer-domain',0));
 if not exists(select 1 from public.admin_user where auth_user_id=p_actor_user_id and status='active' and role in ('staff','admin')) then raise exception 'volunteer_forbidden' using errcode='42501'; end if;
 if p_status is null or p_status not in ('pending','approved','waitlisted','rejected','cancelled') or p_expected_updated_at is null then raise exception 'invalid_volunteer_status' using errcode='22023'; end if;
 select activity_id into v_activity_id from public.volunteer_registration where id=p_registration_id;
 if not found then return jsonb_build_object('kind','not_found'); end if;
 perform pg_advisory_xact_lock(hashtextextended(v_activity_id::text,0));
 select * into v_activity from public.volunteer_activity where id=v_activity_id for update;
 select * into v_registration from public.volunteer_registration where id=p_registration_id for update;
 if not found or v_registration.activity_id<>v_activity_id then return jsonb_build_object('kind','conflict'); end if;
 if v_registration.updated_at<>p_expected_updated_at then return jsonb_build_object('kind','conflict'); end if;
 if p_status='approved' then
  select coalesce(sum(participant_count),0) into v_used from public.volunteer_registration where activity_id=v_activity_id and status='approved' and id<>p_registration_id;
  if v_used+v_registration.participant_count>v_activity.capacity then return jsonb_build_object('kind','capacity_full'); end if;
 end if;
 update public.volunteer_registration set status=p_status,status_reason='manual_review',internal_notes=case when p_update_internal_notes then p_internal_notes else internal_notes end where id=p_registration_id returning * into v_registration;
 insert into public.audit_log(actor_user_id,action,entity,entity_id,detail) values(p_actor_user_id,'volunteer_registration.status_update','volunteer_registration',p_registration_id::text,jsonb_build_object('status',p_status));
 return jsonb_build_object('kind','updated','updatedAt',v_registration.updated_at,'registration',to_jsonb(v_registration));
end $$;
revoke all on function public.set_volunteer_registration_status_with_audit(uuid,uuid,timestamptz,text,text,boolean) from public,anon,authenticated;
grant execute on function public.set_volunteer_registration_status_with_audit(uuid,uuid,timestamptz,text,text,boolean) to service_role;

create or replace function public.update_volunteer_activity_with_audit(p_activity_id uuid,p_actor_user_id uuid,p_expected_updated_at timestamptz,p_input jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_activity public.volunteer_activity%rowtype; v_next public.volunteer_activity%rowtype; v_used bigint;
begin
 perform pg_advisory_xact_lock(hashtextextended('volunteer-domain',0));
 if not exists(select 1 from public.admin_user where auth_user_id=p_actor_user_id and status='active' and role in ('staff','admin')) then raise exception 'volunteer_forbidden' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_activity_id::text,0));
 select * into v_activity from public.volunteer_activity where id=p_activity_id for update;
 if not found then return jsonb_build_object('kind','not_found'); end if;
 if p_expected_updated_at is null or v_activity.updated_at<>p_expected_updated_at then return jsonb_build_object('kind','conflict'); end if;
 select * into v_next from jsonb_populate_record(v_activity,p_input);
 select coalesce(sum(participant_count),0) into v_used from public.volunteer_registration where activity_id=p_activity_id and status='approved';
 if v_next.capacity<v_used then return jsonb_build_object('kind','capacity_full'); end if;
 update public.volunteer_activity set type=v_next.type,title=v_next.title,description=v_next.description,starts_at=v_next.starts_at,ends_at=v_next.ends_at,location=v_next.location,capacity=v_next.capacity,min_age=v_next.min_age,underage_policy=v_next.underage_policy,auto_approve=v_next.auto_approve,allow_waitlist=v_next.allow_waitlist,status=v_next.status,registration_modes=v_next.registration_modes where id=p_activity_id returning * into v_activity;
 insert into public.audit_log(actor_user_id,action,entity,entity_id,detail) values(p_actor_user_id,'volunteer_activity.update','volunteer_activity',p_activity_id::text,p_input);
 return jsonb_build_object('kind','updated','updatedAt',v_activity.updated_at);
end $$;
revoke all on function public.update_volunteer_activity_with_audit(uuid,uuid,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.update_volunteer_activity_with_audit(uuid,uuid,timestamptz,jsonb) to service_role;

-- Counts used for refreshed capacity are complete even beyond the API row limit.
create or replace function public.volunteer_activity_counts(p_activity_ids uuid[])
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
 select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from (
 select activity_id,coalesce(sum(participant_count) filter(where status='approved'),0) approved_participants,coalesce(sum(participant_count) filter(where status='pending'),0) pending_participants,coalesce(sum(participant_count) filter(where status='waitlisted'),0) waitlisted_participants
 from public.volunteer_registration where activity_id=any(p_activity_ids) group by activity_id) t;
$$;
revoke all on function public.volunteer_activity_counts(uuid[]) from public,anon,authenticated;
grant execute on function public.volunteer_activity_counts(uuid[]) to service_role;


create or replace function public.create_volunteer_registration(
  p_activity_id uuid,
  p_supporter_id uuid,
  p_registration_type text,
  p_participant_count integer,
  p_contact_name text,
  p_contact_email text,
  p_contact_phone text,
  p_language text,
  p_organization_name text,
  p_declared_age integer,
  p_youngest_age integer,
  p_guardian_name text,
  p_guardian_phone text,
  p_notes text,
  p_status_token_hash text,
  p_status_token_expires_at timestamptz
) returns public.volunteer_registration
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_activity public.volunteer_activity%rowtype;
  v_approved_participants integer := 0;
  v_age integer;
  v_has_guardian boolean;
  v_status text := 'pending';
  v_reason text := 'manual_review';
  v_registration public.volunteer_registration%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('volunteer-domain',0));
  perform pg_advisory_xact_lock(hashtextextended(p_activity_id::text, 0));

  select *
    into v_activity
    from public.volunteer_activity
   where id = p_activity_id
   for update;

  if not found then
    raise exception 'Volunteer activity not found' using errcode = 'P0002';
  end if;

  v_age := case
    when p_registration_type = 'group' then p_youngest_age
    else p_declared_age
  end;
  v_has_guardian :=
    nullif(btrim(coalesce(p_guardian_name, '')), '') is not null and
    nullif(btrim(coalesce(p_guardian_phone, '')), '') is not null;

  if v_activity.status <> 'published' or v_activity.starts_at <= now() then
    v_status := 'pending';
    v_reason := 'activity_not_available';
  elsif not (p_registration_type = any(v_activity.registration_modes)) then
    v_status := 'pending';
    v_reason := 'registration_mode_unavailable';
  elsif p_registration_type = 'group' and (
    nullif(btrim(coalesce(p_organization_name, '')), '') is null or
    not v_has_guardian
  ) then
    v_status := 'pending';
    v_reason := 'manual_review';
  elsif p_registration_type = 'individual' and p_participant_count <> 1 then
    v_status := 'pending';
    v_reason := 'manual_review';
  elsif v_activity.min_age is not null and v_age is not null and v_age < v_activity.min_age then
    if v_activity.underage_policy = 'block' then
      v_status := 'rejected';
      v_reason := 'minimum_age_not_met';
    elsif v_has_guardian then
      v_status := 'pending';
      v_reason := 'guardian_review_required';
    else
      v_status := 'pending';
      v_reason := 'guardian_details_required';
    end if;
  else
    select coalesce(sum(participant_count), 0)::integer
      into v_approved_participants
      from public.volunteer_registration
     where activity_id = p_activity_id
       and status = 'approved';

    if p_participant_count > greatest(0, v_activity.capacity - v_approved_participants) then
      v_status := case when v_activity.allow_waitlist then 'waitlisted' else 'pending' end;
      v_reason := 'capacity_full';
    elsif not v_activity.auto_approve then
      v_status := 'pending';
      v_reason := 'manual_review';
    else
      v_status := 'approved';
      v_reason := 'auto_approved';
    end if;
  end if;

  insert into public.volunteer_registration (
    activity_id,
    supporter_id,
    registration_type,
    status,
    status_reason,
    participant_count,
    contact_name,
    contact_email,
    contact_phone,
    language,
    organization_name,
    declared_age,
    youngest_age,
    guardian_name,
    guardian_phone,
    notes,
    status_token_hash,
    status_token_expires_at
  ) values (
    p_activity_id,
    p_supporter_id,
    p_registration_type,
    v_status,
    v_reason,
    p_participant_count,
    p_contact_name,
    p_contact_email,
    p_contact_phone,
    p_language,
    p_organization_name,
    p_declared_age,
    p_youngest_age,
    p_guardian_name,
    p_guardian_phone,
    p_notes,
    p_status_token_hash,
    p_status_token_expires_at
  )
  returning * into v_registration;

  return v_registration;
end;
$$;

revoke all on function public.create_volunteer_registration(
  uuid, uuid, text, integer, text, text, text, text, text, integer, integer, text, text, text, text, timestamptz
) from public, anon, authenticated;

grant execute on function public.create_volunteer_registration(
  uuid, uuid, text, integer, text, text, text, text, text, integer, integer, text, text, text, text, timestamptz
) to service_role;


-- Preview computes the exact proposed timestamps and exposes qualification exceptions.
create or replace function public.volunteer_policy_manifest(p_ids jsonb,p_body jsonb,p_now timestamptz) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 with proposed as (
 select a.*, (((a.starts_at at time zone (p_body->>'timezone'))::date)+(p_body#>>'{schedule,start_time}')::time) at time zone (p_body->>'timezone') proposed_start,
 (((a.starts_at at time zone (p_body->>'timezone'))::date)+(p_body#>>'{schedule,end_time}')::time) at time zone (p_body->>'timezone') proposed_end
 from public.volunteer_activity a where a.id in(select value::uuid from jsonb_array_elements_text(p_ids))
 )
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'title',a.title,'starts_at',a.starts_at,'ends_at',a.ends_at,'proposed_starts_at',a.proposed_start,'proposed_ends_at',a.proposed_end,'capacity',a.capacity,'policy_revision',a.policy_revision,'updated_at',a.updated_at,'group_headcount',a.group_headcount,
 'approved_participants',counts.approved,'waitlisted_participants',counts.waitlisted,'registrations_hash',counts.fingerprint,
 'phase',jsonb_build_object('opened',p_now>=public.volunteer_policy_window(p_body#>'{booking,individual_open}',a.proposed_start,p_body->>'timezone'),'closed',p_now>=public.volunteer_policy_window(p_body#>'{booking,individual_close}',a.proposed_start,p_body->>'timezone'),'release',(select coalesce(jsonb_agg(p_now>=a.proposed_start-make_interval(hours=>(r->>'within_hours')::integer)),'[]'::jsonb) from jsonb_array_elements(p_body->'release_rules') r)),
 'qualification_exceptions',(select coalesce(jsonb_agg(jsonb_build_object('registration_id',b.id,'reason','qualification_review_required')),'[]') from public.volunteer_registration b left join public.volunteer_profile bp on bp.id=b.profile_id where b.activity_id=a.id and b.status='approved' and (bp.id is null or bp.status<>'active' or not (p_body#>'{eligibility,allowed_tiers}' ? bp.tier) or not public.volunteer_policy_credentials(bp.id,p_body#>'{eligibility,credentials}',a.proposed_start))),
 'conflicts',case when a.starts_at<=p_now or a.proposed_start<=p_now then '["historical_session"]'::jsonb
 when counts.approved>(p_body#>>'{capacity,volunteers,value}')::integer then '["capacity_below_occupancy"]'::jsonb
 when p_body#>>'{capacity,shared_total,state}'='value' and counts.approved+case when (p_body#>>'{capacity,group_in_shared_total}')::boolean then a.group_headcount else 0 end>(p_body#>>'{capacity,shared_total,value}')::integer then '["shared_capacity_below_occupancy"]'::jsonb
 when exists(select 1 from public.volunteer_registration b join public.volunteer_registration other on other.profile_id=b.profile_id and other.id<>b.id and other.status='approved' join public.volunteer_activity oa on oa.id=other.activity_id left join proposed op on op.id=oa.id where b.activity_id=a.id and b.status='approved' and tstzrange(a.proposed_start,a.proposed_end,'[)') && tstzrange(coalesce(op.proposed_start,oa.starts_at),coalesce(op.proposed_end,oa.ends_at),'[)')) then '["overlapping_duty"]'::jsonb
 else '[]'::jsonb end) order by a.id),'[]'::jsonb)
 from proposed a cross join lateral (
 select coalesce(sum(participant_count) filter(where status='approved'),0) approved,coalesce(sum(participant_count) filter(where status='waitlisted'),0) waitlisted,
 md5(coalesce(string_agg(id::text||status||updated_at::text,',' order by id),'')) fingerprint from public.volunteer_registration where activity_id=a.id) counts;
$$;

create function public.volunteer_calendar_policy_checks(p_ids uuid[]) returns jsonb language sql security definer set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(jsonb_build_object('registration_id',r.id,'tier',p.tier,'evaluation',public.volunteer_policy_evaluate(r.activity_id,r.profile_id,r.duty_role,clock_timestamp(),r.id))),'[]'::jsonb)
 from public.volunteer_registration r join public.volunteer_activity a on a.id=r.activity_id left join public.volunteer_profile p on p.id=r.profile_id
 where r.activity_id=any(p_ids) and r.status='approved' and a.policy_version_id is not null and a.starts_at>clock_timestamp();
$$;
revoke all on function public.volunteer_calendar_policy_checks(uuid[]) from public,anon,authenticated;
grant execute on function public.volunteer_calendar_policy_checks(uuid[]) to service_role;
