-- Attendance joins canonical sessions; changing these dimensions would rewrite
-- the meaning/date of a historical fact even on an unbound legacy activity.
create function public.protect_attendance_activity_dimensions() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
 if (new.starts_at,new.ends_at,new.shelter_key,new.template_key) is distinct from (old.starts_at,old.ends_at,old.shelter_key,old.template_key)
 and exists(select 1 from public.volunteer_registration r where r.activity_id=old.id and (r.attendance_status in ('attended','completed','no_show') or exists(select 1 from public.volunteer_attendance_event e where e.registration_id=r.id))) then
 raise exception 'attendance_activity_time_immutable' using errcode='22023';end if;
 return new;
end; $$;
create trigger attendance_activity_dimensions before update on public.volunteer_activity
for each row execute function public.protect_attendance_activity_dimensions();
revoke all on function public.protect_attendance_activity_dimensions() from public,anon,authenticated;

-- The scheduler chooses local calendar dates from each effective policy, using
-- database time. A future version cannot lend its horizon/weekdays to a current
-- version. The existing generation command remains the authoritative admission
-- and audit path, including its exact effective-schedule selection.
create function public.generate_due_volunteer_sessions(p_actor uuid) returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare stamp timestamptz;item record;day date;start_time timestamptz;chosen uuid;result jsonb;total integer:=0;i integer;seen text[]:='{}';identity text;
begin
 perform pg_advisory_xact_lock(hashtextextended('volunteer-domain',0));
 perform public.volunteer_policy_admin(p_actor);stamp:=clock_timestamp();
 for item in select s.*,v.body from public.volunteer_policy_schedule s join public.volunteer_policy_version v on v.id=s.version_id where s.effective_until is null or s.effective_until>stamp order by s.template_key,s.effective_from desc loop
  if coalesce((item.body#>>'{schedule,enabled}')::boolean,false) is not true or coalesce((item.body#>>'{schedule,generation_days}')::integer,0)<1 then continue;end if;
  for i in 0..least(365,(item.body#>>'{schedule,generation_days}')::integer) loop
   day:=(stamp at time zone (item.body->>'timezone'))::date+i;
   start_time:=(day+(item.body#>>'{schedule,start_time}')::time) at time zone (item.body->>'timezone');
   if start_time<item.effective_from or (item.effective_until is not null and start_time>=item.effective_until) or start_time<=stamp then continue;end if;
   if (item.body#>>'{schedule,effective_from}' is not null and day<(item.body#>>'{schedule,effective_from}')::date) or (item.body#>>'{schedule,effective_until}' is not null and day>(item.body#>>'{schedule,effective_until}')::date) then continue;end if;
   select v.id into chosen from public.volunteer_policy_schedule s join public.volunteer_policy_version v on v.id=s.version_id where s.template_key=item.template_key
    and ((day+(v.body#>>'{schedule,start_time}')::time) at time zone (v.body->>'timezone'))>=s.effective_from
    and (s.effective_until is null or ((day+(v.body#>>'{schedule,start_time}')::time) at time zone (v.body->>'timezone'))<s.effective_until) order by s.effective_from desc limit 1;
   if chosen is distinct from item.version_id then continue;end if;
   identity:=item.template_key||':'||day::text;if identity=any(seen) then continue;end if;seen:=array_append(seen,identity);
   result:=public.volunteer_policy_command(p_actor,jsonb_build_object('action','generate','template_key',item.template_key,'date',day::text,'idempotency_key',gen_random_uuid()));
   if result->>'kind'='generated' then total:=total+1;end if;
  end loop;
 end loop;
 return total;
end; $$;
revoke all on function public.generate_due_volunteer_sessions(uuid) from public,anon,authenticated;
grant execute on function public.generate_due_volunteer_sessions(uuid) to service_role;
