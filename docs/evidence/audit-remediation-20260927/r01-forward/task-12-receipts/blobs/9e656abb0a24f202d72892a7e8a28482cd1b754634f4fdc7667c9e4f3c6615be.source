-- Read-only operations projection. No canonical records or facts are changed.
-- Rollback: drop function public.volunteer_admin_directory_read(uuid,jsonb);
create function public.volunteer_admin_directory_read(p_actor uuid,p_query jsonb)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare
 search_text text:=btrim(coalesce(p_query->>'q',''));
 filter_status text:=p_query->>'status'; filter_tier text:=p_query->>'tier';
 page_number integer:=coalesce((p_query->>'page')::integer,1);
 page_limit integer:=coalesce((p_query->>'limit')::integer,25);
 selected_id uuid:=(p_query->>'profile_id')::uuid;
 person jsonb; result jsonb;
begin
 if not exists(select 1 from public.admin_user a join auth.users u on u.id=a.auth_user_id
  where a.auth_user_id=p_actor and a.status='active' and a.role in ('staff','admin')
  and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<=now()))
 then raise exception 'volunteer_forbidden' using errcode='42501'; end if;
 if length(search_text)>200 or page_number not between 1 and 1000000 or page_limit not between 1 and 50
  or (filter_status is not null and filter_status not in ('pending','active','suspended'))
  or (filter_tier is not null and filter_tier not in ('newcomer','regular','senior'))
 then raise exception 'invalid_directory_query' using errcode='22023'; end if;
 with matched as (
  select p.id,p.display_name,p.birth_date,p.tier,p.status,p.verified_at,p.joined_on,p.history_coverage_start,p.revision,
   u.email as linked_email,(u.email_confirmed_at is not null) as email_verified,(u.id is not null) as account_linked
  from public.volunteer_profile p left join auth.users u on u.id=p.auth_user_id
  where (selected_id is null or p.id=selected_id)
   and (selected_id is not null or (
    (filter_status is null or p.status=filter_status) and (filter_tier is null or p.tier=filter_tier)
    and (search_text='' or strpos(lower(p.display_name),lower(search_text))>0 or strpos(lower(coalesce(u.email,'')),lower(search_text))>0)))
 ), paged as (select * from matched order by lower(display_name),id limit page_limit offset (page_number-1)*page_limit)
 select case when selected_id is not null then (select to_jsonb(m) from matched m)
 else jsonb_build_object('profiles',coalesce((select jsonb_agg(to_jsonb(p) order by lower(p.display_name),p.id) from paged p),'[]'::jsonb),
 'total',(select count(*) from matched),'page',page_number,'limit',page_limit) end into person;
 if selected_id is null or person is null then return person; end if;
 select jsonb_build_object('profile',person,
 'credentials',coalesce((select jsonb_agg(to_jsonb(c) order by c.valid_from desc,c.id) from (
  select c.id,c.credential_key,d.label,c.valid_from,c.valid_until,c.revoked_at,c.evidence
  from public.volunteer_credential c join public.volunteer_credential_definition d on d.key=c.credential_key
  where c.profile_id=selected_id order by c.valid_from desc,c.id limit 100) c),'[]'::jsonb),
 'registrations',coalesce((select jsonb_agg(to_jsonb(r) order by r.starts_at desc,r.id) from (
  select r.id,r.activity_id,a.title,a.starts_at,a.ends_at,r.status,r.attendance_status,r.volunteer_hours,r.duty_role
  from public.volunteer_registration r join public.volunteer_activity a on a.id=r.activity_id
  where r.profile_id=selected_id order by a.starts_at desc,r.id limit 100) r),'[]'::jsonb),
 'attendance_events',coalesce((select jsonb_agg(to_jsonb(e) order by e.recorded_at desc,e.id) from (
  select e.id,e.registration_id,e.command,e.reason,e.before_fact,e.after_fact,e.recorded_at
  from public.volunteer_attendance_event e join public.volunteer_registration r on r.id=e.registration_id
  where r.profile_id=selected_id order by e.recorded_at desc,e.id limit 100) e),'[]'::jsonb),
 'verification_history',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at desc,e.id) from (
  select id,event_type,reason,created_at,actor_user_id from public.volunteer_profile_event
  where profile_id=selected_id order by created_at desc,id limit 100) e),'[]'::jsonb),
 'coverage',jsonb_build_object('history_coverage_start',person->'history_coverage_start','scope','linked_profile_records_only','records_limit',100,
  'credential_total',(select count(*) from public.volunteer_credential where profile_id=selected_id),
  'registration_total',(select count(*) from public.volunteer_registration where profile_id=selected_id),
  'attendance_event_total',(select count(*) from public.volunteer_attendance_event e join public.volunteer_registration r on r.id=e.registration_id where r.profile_id=selected_id),
  'verification_event_total',(select count(*) from public.volunteer_profile_event where profile_id=selected_id))) into result;
 return result;
end $$;
revoke all on function public.volunteer_admin_directory_read(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.volunteer_admin_directory_read(uuid,jsonb) to service_role;
