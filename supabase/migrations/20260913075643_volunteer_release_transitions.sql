-- Immutable once-release evidence; reads only calculate virtual eligibility.
create table public.volunteer_release_transition (
 binding_key text not null,rule_key text not null,rule_snapshot jsonb not null,
 triggered_at timestamptz not null,primary key(binding_key,rule_key)
);
alter table public.volunteer_release_transition enable row level security;
revoke all on public.volunteer_release_transition from public,anon,authenticated,service_role;
grant select on public.volunteer_release_transition to service_role;
create trigger immutable_release_transition before update or delete on public.volunteer_release_transition for each row execute function public.volunteer_immutable_fact();

create function public.volunteer_release_is_active(p_binding text,p_rule jsonb,p_anchor timestamptz,p_count integer,p_now timestamptz)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select (p_rule->>'semantics'='once' and exists(select 1 from public.volunteer_release_transition t where t.binding_key=p_binding and t.rule_key=p_rule->>'key' and t.rule_snapshot=p_rule)) or
 (p_now>=p_anchor-make_interval(hours=>(p_rule->>'within_hours')::integer) and ((p_rule#>>'{condition,operator}'='lt' and p_count<(p_rule#>>'{condition,threshold}')::integer) or (p_rule#>>'{condition,operator}'='lte' and p_count<=(p_rule#>>'{condition,threshold}')::integer)));
$$;
revoke all on function public.volunteer_release_is_active(text,jsonb,timestamptz,integer,timestamptz) from public,anon,authenticated,service_role;

create function public.volunteer_persist_releases(p_activity uuid,p_stamp timestamptz) returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.volunteer_activity%rowtype;d public.volunteer_daily_policy_binding%rowtype;r jsonb;body jsonb;anchor timestamptz;binding_key text;core_count integer;inserted integer:=0;affected integer;stamp timestamptz;day_shelter text;begin
 perform pg_advisory_xact_lock(hashtextextended('volunteer-domain',0));
 stamp:=clock_timestamp(); -- caller timestamps cannot backdate or advance a transition
 select * into a from public.volunteer_activity where id=p_activity;
 if not found or a.policy_version_id is null or a.status<>'published' or a.starts_at<=stamp then return 0;end if;
 select v.body into body from public.volunteer_policy_version v where v.id=a.policy_version_id;
 binding_key:='session:'||a.id::text||':'||a.policy_version_id::text;
 for r in select value from jsonb_array_elements(body->'release_rules') where value->>'semantics'='once' and (value#>>'{action,type}'='release_reserved' or value#>>'{action,scope}'='session') loop
  select count(*) into core_count from public.volunteer_registration b join public.volunteer_profile v on v.id=b.profile_id where b.activity_id=a.id and b.status='approved' and r#>'{condition,tiers}' ? v.tier;
  if public.volunteer_release_is_active(binding_key,r,a.starts_at,core_count,stamp) then
   insert into public.volunteer_release_transition values(binding_key,r->>'key',r,stamp) on conflict do nothing;get diagnostics affected=row_count;inserted:=inserted+affected;
  end if;
 end loop;
 for d in select * from public.volunteer_daily_policy_binding x where split_part(x.scope_key,':',1) in('all',a.shelter_key) and x.service_date=(a.starts_at at time zone x.timezone)::date loop
  day_shelter:=split_part(d.scope_key,':',1);binding_key:='day:'||d.scope_key||':'||d.service_date::text||':'||d.revision::text;
  for r in select value from jsonb_array_elements(d.release_rules) where value->>'semantics'='once' loop
   select case when r#>>'{action,daily_anchor}'='first_session' then min(x.starts_at) else max(x.starts_at) end into anchor from public.volunteer_activity x where x.status='published' and x.policy_version_id is not null and (x.starts_at at time zone d.timezone)::date=d.service_date and (day_shelter='all' or x.shelter_key=day_shelter);
   select count(*) into core_count from public.volunteer_registration b join public.volunteer_activity x on x.id=b.activity_id join public.volunteer_profile v on v.id=b.profile_id where b.status='approved' and (x.starts_at at time zone d.timezone)::date=d.service_date and (day_shelter='all' or x.shelter_key=day_shelter) and r#>'{condition,tiers}' ? v.tier;
   if anchor is not null and public.volunteer_release_is_active(binding_key,r,anchor,core_count,stamp) then
    insert into public.volunteer_release_transition values(binding_key,r->>'key',r,stamp) on conflict do nothing;get diagnostics affected=row_count;inserted:=inserted+affected;
   end if;
  end loop;
 end loop;
 return inserted;
end $$;
revoke all on function public.volunteer_persist_releases(uuid,timestamptz) from public,anon,authenticated,service_role;

create or replace function public.volunteer_validate_daily_policy(p jsonb) returns jsonb
language plpgsql immutable set search_path=public,pg_temp as $$
declare r jsonb;q jsonb;begin
 if exists(select 1 from jsonb_array_elements(p->'release_rules') where coalesce(value->>'semantics','') not in('once','dynamic')) then return '["release_semantics_required"]'::jsonb;end if;
 for r in select value from jsonb_array_elements(p->'release_rules') where value#>>'{action,type}'='relax_quota' and value#>>'{action,scope}'<>'session' loop
  if coalesce(r#>>'{action,daily_anchor}','') not in ('first_session','last_session') then return '["daily_release_anchor_required"]'::jsonb;end if;
  select value into q from jsonb_array_elements(p->'daily_limits') where value->>'key'=r#>>'{action,quota}' and value->>'scope'=r#>>'{action,scope}';
  if q is null then return '["daily_release_quota_missing"]'::jsonb;end if;
  if not ((r->'allowed_tiers') <@ (q->'tiers')) then return '["daily_release_recipient_outside_quota"]'::jsonb;end if;
  if q#>>'{maximum,state}'='value' and (r#>>'{action,new_maximum}')::integer<(q#>>'{maximum,value}')::integer then return '["daily_release_cannot_reduce_quota"]'::jsonb;end if;
 end loop;
 for q in select value from jsonb_array_elements(p->'daily_limits') loop
  if (q->>'include_group_visitors')::boolean and q->>'count_mode'='distinct_people' then return '["distinct_group_visitor_identity_required"]'::jsonb;end if;
 end loop;
 return '[]'::jsonb;
end $$;

create or replace function public.volunteer_daily_state(p_key text,p_date date,p_profile uuid,p_now timestamptz,p_exclude uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare binding public.volunteer_daily_policy_binding%rowtype;profile public.volunteer_profile%rowtype;
 r jsonb;day_shelter text;anchor timestamptz;next_boundary timestamptz;maximum integer;used integer;core_count integer;visitors integer;already_counted boolean;override_days jsonb;begin
 select * into binding from public.volunteer_daily_policy_binding where scope_key=p_key and service_date=p_date;
 if not found then return jsonb_build_object('reason','daily_policy_not_bound');end if;
 select * into profile from public.volunteer_profile where id=p_profile;
 if not (binding.body->'tiers' ? profile.tier) then return jsonb_build_object('applies',false);end if;
 day_shelter:=split_part(p_key,':',1);
 maximum:=case when binding.body#>>'{maximum,state}'='unlimited' then 2147483647 else (binding.body#>>'{maximum,value}')::integer end;
 select case when binding.body->>'count_mode'='distinct_people' then count(distinct b.profile_id) else count(*) end,
 coalesce(bool_or(b.profile_id=p_profile),false) into used,already_counted
 from public.volunteer_registration b join public.volunteer_activity a on a.id=b.activity_id join public.volunteer_profile v on v.id=b.profile_id
 where b.status='approved' and (a.starts_at at time zone binding.timezone)::date=p_date and (day_shelter='all' or a.shelter_key=day_shelter) and binding.body->'tiers' ? v.tier and (p_exclude is null or b.id<>p_exclude);
 if (binding.body->>'include_group_visitors')::boolean then
  select coalesce(sum(a.group_headcount),0) into visitors from public.volunteer_activity a where a.status='published' and (a.starts_at at time zone binding.timezone)::date=p_date and (day_shelter='all' or a.shelter_key=day_shelter);
  used:=used+visitors;
 end if;
 for r in select value from jsonb_array_elements(binding.release_rules) order by (value->>'priority')::integer loop
  if not (r->'allowed_tiers' ? profile.tier) then continue;end if;
  select case when r#>>'{action,daily_anchor}'='first_session' then min(a.starts_at) else max(a.starts_at) end into anchor from public.volunteer_activity a where a.status='published' and a.policy_version_id is not null and (a.starts_at at time zone binding.timezone)::date=p_date and (day_shelter='all' or a.shelter_key=day_shelter);
  if anchor is null then continue;end if;
  if anchor-make_interval(hours=>(r->>'within_hours')::integer)>p_now and not public.volunteer_release_is_active('day:'||p_key||':'||p_date::text||':'||binding.revision::text,r,anchor,2147483647,p_now) then next_boundary:=least(next_boundary,anchor-make_interval(hours=>(r->>'within_hours')::integer));continue;end if;
  if not public.volunteer_policy_credentials(p_profile,r->'credentials',anchor) then continue;end if;
  select count(*) into core_count from public.volunteer_registration b join public.volunteer_activity a on a.id=b.activity_id join public.volunteer_profile v on v.id=b.profile_id where b.status='approved' and (a.starts_at at time zone binding.timezone)::date=p_date and (day_shelter='all' or a.shelter_key=day_shelter) and r#>'{condition,tiers}' ? v.tier and (p_exclude is null or b.id<>p_exclude);
  if public.volunteer_release_is_active('day:'||p_key||':'||p_date::text||':'||binding.revision::text,r,anchor,core_count,p_now) then
   maximum:=greatest(maximum,(r#>>'{action,new_maximum}')::integer);
   if jsonb_typeof(r->'weekdays')='array' then override_days:=r->'weekdays';end if;
  end if;
 end loop;
 return jsonb_build_object('applies',true,'maximum',maximum,'used',used,'already_counted',binding.body->>'count_mode'='distinct_people' and already_counted,'weekdays_override',override_days,'next_boundary',next_boundary,'revision',binding.revision,'scope_key',p_key);
end $$;

create or replace function public.volunteer_policy_evaluate(p_activity uuid,p_profile uuid,p_role text,p_now timestamptz,p_exclude uuid default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.volunteer_activity%rowtype; p jsonb; v public.volunteer_profile%rowtype;
 role_config jsonb; q jsonb; r jsonb; pool jsonb; used_count integer; count_value integer; cap integer; role_used integer;
 reserved_remaining integer:=0; released integer; maximum integer; quota_max integer; weekday integer;
 check_at timestamptz; opens timestamptz; closes timestamptz; v_service_date date; v_scope_key text; daily jsonb;
 daily_states jsonb:='[]'; daily_override jsonb; daily_binding record; reason text; next_boundary timestamptz; result jsonb;
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
 reason:=public.volunteer_policy_session_reason(p,a.status,a.starts_at,a.group_headcount,p_now);
 if reason is not null then null;
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
 if p#>>'{capacity,role_count_model}'='leader_in_assistants' and p_role='assistant' then
  role_used:=role_used+greatest((select count(*) from public.volunteer_registration where activity_id=a.id and duty_role='leader' and status='approved' and (p_exclude is null or id<>p_exclude)),coalesce((select (value->>'reserved')::integer from jsonb_array_elements(p->'roles') where value->>'key'='leader'),0));
 end if;
 if reason is null and p#>>'{capacity,role_count_model}'='leader_in_assistants' and p_role='leader' then
  select value into q from jsonb_array_elements(p->'roles') where value->>'key'='assistant';
  if q#>>'{maximum,state}'='value' and (select count(*) from public.volunteer_registration where activity_id=a.id and duty_role in ('leader','assistant') and status='approved' and (p_exclude is null or id<>p_exclude))>=(q#>>'{maximum,value}')::integer then reason:='role_full';end if;
 end if;
 if reason is null and role_config#>>'{maximum,state}'='value' and role_used>=(role_config#>>'{maximum,value}')::integer then reason:='role_full'; end if;
 -- Retained minimum staffing is informational; only reservations restrict seats.
 for pool in select value from jsonb_array_elements(p->'roles') where value->>'key'<>p_role loop
  select count(*) into role_used from public.volunteer_registration where activity_id=a.id and duty_role=pool->>'key' and status='approved' and (p_exclude is null or id<>p_exclude);
  released:=0;
  for r in select value from jsonb_array_elements(p->'release_rules') order by (value->>'priority')::integer loop
   if r#>>'{action,type}'='release_reserved' and r#>>'{action,pool}'=pool->>'key' and r->'allowed_tiers' ? v.tier and public.volunteer_policy_credentials(v.id,r->'credentials',check_at) then
    if a.starts_at-make_interval(hours=>(r->>'within_hours')::integer)>p_now then next_boundary:=least(next_boundary,a.starts_at-make_interval(hours=>(r->>'within_hours')::integer)); end if;
    select count(*) into count_value from public.volunteer_registration b join public.volunteer_profile bp on bp.id=b.profile_id where b.activity_id=a.id and b.status='approved' and r#>'{condition,tiers}' ? bp.tier;
    if public.volunteer_release_is_active('session:'||a.id::text||':'||a.policy_version_id::text,r,a.starts_at,count_value,p_now) then released:=(r#>>'{action,quantity}')::integer; end if;
   end if;
  end loop;
  reserved_remaining:=reserved_remaining+greatest(0,(pool->>'reserved')::integer-case when p#>>'{capacity,role_count_model}'='leader_in_assistants' and pool->>'key'='assistant' then coalesce((select (value->>'reserved')::integer from jsonb_array_elements(p->'roles') where value->>'key'='leader'),0) else 0 end-released-role_used);
 end loop;
 if reason is null and cap-used_count<=reserved_remaining then reason:='reserved_for_core_role'; end if;
 for q in select value from jsonb_array_elements(p->'daily_limits') loop
  v_scope_key:=case when q->>'scope'='all_shelters_day' then 'all' else p->>'shelter' end||':'||(q->>'key');
  if not exists(select 1 from public.volunteer_daily_policy_binding b where b.scope_key=v_scope_key and b.service_date=(a.starts_at at time zone b.timezone)::date) and reason is null then reason:='daily_policy_not_bound';end if;
 end loop;
 -- Existing service-day bindings apply even when a newer entry template omits
 -- a daily limit. A template revision cannot silently evade a shared day scope.
 for daily_binding in select d.scope_key,d.service_date from public.volunteer_daily_policy_binding d where split_part(d.scope_key,':',1) in ('all',p->>'shelter') and d.service_date=(a.starts_at at time zone d.timezone)::date order by d.scope_key loop
  daily:=public.volunteer_daily_state(daily_binding.scope_key,daily_binding.service_date,v.id,p_now,p_exclude);
  if daily->>'reason' is not null and reason is null then reason:=daily->>'reason';end if;
  if coalesce((daily->>'applies')::boolean,false) then
   daily_states:=daily_states||jsonb_build_array(daily);
   next_boundary:=least(next_boundary,(daily->>'next_boundary')::timestamptz);
   if jsonb_typeof(daily->'weekdays_override')='array' then
    if daily_override is null then daily_override:=daily->'weekdays_override';
    else select coalesce(jsonb_agg(value),'[]'::jsonb) into daily_override from jsonb_array_elements(daily_override) where daily->'weekdays_override' @> jsonb_build_array(value);end if;
   end if;
  end if;
 end loop;
 for q in select value from jsonb_array_elements(p->'tier_quotas') where value->'tiers' ? v.tier loop
  if daily_override is not null then q:=jsonb_set(q,'{weekdays}',daily_override);end if;
  quota_max:=case when q#>>'{maximum,state}'='unlimited' then 2147483647 else (q#>>'{maximum,value}')::integer end;
  for r in select value from jsonb_array_elements(p->'release_rules') order by (value->>'priority')::integer loop
   if r#>>'{action,type}'='relax_quota' and r#>>'{action,scope}'='session' and r#>>'{action,quota}'=q->>'key' and r->'allowed_tiers' ? v.tier and public.volunteer_policy_credentials(v.id,r->'credentials',check_at) then
    select count(*) into count_value from public.volunteer_registration b join public.volunteer_profile bp on bp.id=b.profile_id where b.activity_id=a.id and b.status='approved' and r#>'{condition,tiers}' ? bp.tier;
    if public.volunteer_release_is_active('session:'||a.id::text||':'||a.policy_version_id::text,r,a.starts_at,count_value,p_now) then
     quota_max:=(r#>>'{action,new_maximum}')::integer;
     if jsonb_typeof(r->'weekdays')='array' then q:=jsonb_set(q,'{weekdays}',r->'weekdays'); end if;
    end if;
   end if;
  end loop;
  select count(*) into count_value from public.volunteer_registration b join public.volunteer_profile bp on bp.id=b.profile_id where b.activity_id=a.id and b.status='approved' and q->'tiers' ? bp.tier and (p_exclude is null or b.id<>p_exclude);
  if reason is null and not (q->'weekdays' @> jsonb_build_array(weekday)) then reason:='tier_weekday_not_allowed'; end if;
  if reason is null and count_value>=quota_max then reason:='tier_quota_full'; end if;
 end loop;
 for daily in select value from jsonb_array_elements(daily_states) loop
  if reason is null and (daily->>'used')::integer>=(daily->>'maximum')::integer and not (daily->>'already_counted')::boolean then reason:='daily_quota_full';end if;
 end loop;
 result:=result||jsonb_build_object('daily_limits',daily_states);
 return result||jsonb_build_object('allowed',reason is null,'reason',coalesce(reason,'available'),'next_boundary',next_boundary,'message',case when reason='credentials_required' then coalesce(p#>>'{eligibility,missing_credentials_message}','本時段需要已核實資格') end);
end $$;

create function public.volunteer_persist_due_releases(p_actor uuid) returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare activity_id uuid;n integer:=0;stamp timestamptz;begin
 perform public.volunteer_policy_admin(p_actor);
 perform pg_advisory_xact_lock(hashtextextended('volunteer-domain',0));stamp:=clock_timestamp();
 for activity_id in select id from public.volunteer_activity where policy_version_id is not null and status='published' and starts_at>stamp order by starts_at,id loop
  n:=n+public.volunteer_persist_releases(activity_id,stamp);
 end loop;
 return n;
end $$;
revoke all on function public.volunteer_persist_due_releases(uuid) from public,anon,authenticated;
grant execute on function public.volunteer_persist_due_releases(uuid) to service_role;
