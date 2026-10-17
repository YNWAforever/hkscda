-- Count/filter lightweight candidates before projecting an ordinary list page.
-- Shortage is a computed filter: it must still evaluate the complete candidate set.
-- Existing policy evaluation, bulk selection and mutation branches are preserved.
do $migration$
declare current_function record;
begin
 select prosrc,prosecdef,provolatile,proconfig into current_function
 from pg_proc where oid='public.volunteer_activity_workspace_rows(jsonb)'::regprocedure;
 if md5(current_function.prosrc)<>'ab48504596026f742c062cab50c2ca00'
  or not current_function.prosecdef or current_function.provolatile<>'s'
  or current_function.proconfig is distinct from array['search_path=public, pg_temp'] then
  raise exception 'Unexpected volunteer workspace projection definition; review current source before applying';
 end if;
 if to_regprocedure('public.volunteer_activity_workspace_candidates(jsonb)') is not null
  or to_regprocedure('public.volunteer_activity_workspace_project(uuid[],jsonb)') is not null then
  raise exception 'Unexpected existing volunteer workspace pagination helpers';
 end if;
end
$migration$;

-- This is the original base filter, shared by pagination and the legacy full-set adapter.
create function public.volunteer_activity_workspace_candidates(p_filter jsonb)
returns table(id uuid,sort_start text)
language sql stable security definer set search_path=public,pg_temp as $candidates$
 select a.id,to_jsonb(a.starts_at)#>>'{}' as sort_start
 from public.volunteer_activity a
 left join public.volunteer_policy_version v on v.id=a.policy_version_id
 where (nullif(p_filter->>'from','') is null or a.starts_at >= ((p_filter->>'from')::date::timestamp at time zone 'Asia/Hong_Kong'))
 and (nullif(p_filter->>'until','') is null or a.starts_at < (((p_filter->>'until')::date+1)::timestamp at time zone 'Asia/Hong_Kong'))
 and (nullif(p_filter->>'q','') is null or position(lower(p_filter->>'q') in lower(a.title||' '||a.location))>0)
 and (nullif(p_filter->>'shelter','') is null or a.shelter_key=p_filter->>'shelter')
 and (nullif(p_filter->>'template','') is null or a.template_key=p_filter->>'template')
 and (nullif(p_filter->>'status','') is null or a.status=p_filter->>'status')
 and (nullif(p_filter->>'scenario','') is null or v.body#>>'{booking,scenario}'=p_filter->>'scenario')
 and (nullif(p_filter->>'readiness','') is null or (p_filter->>'readiness'='ready')=(a.policy_version_id is not null))
$candidates$;

-- The original summary/eligibility projection, restricted to already-filtered IDs.
create function public.volunteer_activity_workspace_project(p_activity_ids uuid[],p_filter jsonb)
returns table(item jsonb)
language sql stable security definer set search_path=public,pg_temp as $projection$
select jsonb_build_object('id',a.id,'title',a.title,'starts_at',a.starts_at,'ends_at',a.ends_at,'location',a.location,'status',a.status,'capacity',a.capacity,'template_key',a.template_key,'shelter_key',a.shelter_key,'policy_version_id',a.policy_version_id,'policy_revision',a.policy_revision,'updated_at',a.updated_at,'scenario',v.body#>>'{booking,scenario}','registrations_closed_at',a.registrations_closed_at,'approved',coalesce(c.approved,0),'waitlisted',coalesce(c.waitlisted,0),'shortages',coalesce(s.shortages,'[]'::jsonb))
 from public.volunteer_activity a left join public.volunteer_policy_version v on v.id=a.policy_version_id
 left join lateral(select sum(r.participant_count) filter(where r.status='approved') approved,sum(r.participant_count) filter(where r.status='waitlisted') waitlisted from public.volunteer_registration r where r.activity_id=a.id)c on true
 left join lateral(select jsonb_agg(jsonb_build_object('role',role->>'label','missing',(role->>'minimum')::int-n.occupied)) shortages from jsonb_array_elements(coalesce(v.body->'roles','[]'))role cross join lateral(select count(*)::int occupied from public.volunteer_registration r where r.activity_id=a.id and r.status='approved' and (r.duty_role=role->>'key' or v.body#>>'{capacity,role_count_model}'='leader_in_assistants' and role->>'key'='assistant' and r.duty_role='leader') and coalesce((public.volunteer_policy_evaluate(a.id,r.profile_id,r.duty_role,clock_timestamp(),r.id)->>'reason') not in('verified_profile_required','tier_not_allowed','minimum_age_not_met','credentials_required','role_not_allowed'),true))n where n.occupied<(role->>'minimum')::int)s on true
 where a.id=any(p_activity_ids)
 and (not coalesce((p_filter->>'shortage')::boolean,false) or s.shortages is not null)
$projection$;
-- Internal helpers run only inside the existing RPC's definer context.
revoke all on function public.volunteer_activity_workspace_candidates(jsonb),
 public.volunteer_activity_workspace_project(uuid[],jsonb) from public,anon,authenticated,service_role;

-- Keep the original interface and its full-set behavior for select/bulk consumers.
create or replace function public.volunteer_activity_workspace_rows(p_filter jsonb)
returns table(item jsonb)
language sql stable security definer set search_path=public,pg_temp as $adapter$
 select item from public.volunteer_activity_workspace_project(
  array(select id from public.volunteer_activity_workspace_candidates(p_filter)),p_filter)
$adapter$;

-- Patch only the list branch. Do not replace later authorization/mutation fixes.
do $migration$
declare
 definition text:=pg_get_functiondef('public.volunteer_bulk_command(uuid,jsonb)'::regprocedure);
 old_branch text:=$old_branch$  with workspace as materialized (
   select item from public.volunteer_activity_workspace_rows(p_command->'filter')
  )
  select (select count(*) from workspace),
   (select coalesce(jsonb_agg(item),'[]') from (
    select item from workspace
    order by case when p_command#>>'{filter,sort}'='desc' then item->>'starts_at' end desc,
     case when coalesce(p_command#>>'{filter,sort}','asc')='asc' then item->>'starts_at' end,
     item->>'id'
    limit 25 offset greatest(coalesce((p_command->>'page')::int,1)-1,0)*25
   ) page_rows)
  into n,items;
$old_branch$;
 new_branch text:=$new_branch$  if coalesce((p_command#>>'{filter,shortage}')::boolean,false) then
  with workspace as materialized (
   select item from public.volunteer_activity_workspace_rows(p_command->'filter')
  )
  select (select count(*) from workspace),
   (select coalesce(jsonb_agg(item),'[]') from (
    select item from workspace
    order by case when p_command#>>'{filter,sort}'='desc' then item->>'starts_at' end desc,
     case when coalesce(p_command#>>'{filter,sort}','asc')='asc' then item->>'starts_at' end,
     item->>'id'
    limit 25 offset greatest(coalesce((p_command->>'page')::int,1)-1,0)*25
   ) page_rows)
  into n,items;
  else
   with candidates as materialized (
    select * from public.volunteer_activity_workspace_candidates(p_command->'filter')
   ), page_ids as (
    select id from candidates
    order by case when p_command#>>'{filter,sort}'='desc' then sort_start end desc,
     case when coalesce(p_command#>>'{filter,sort}','asc')='asc' then sort_start end,
     id::text
    limit 25 offset greatest(coalesce((p_command->>'page')::int,1)-1,0)*25
   ), projected as materialized (
    select item from public.volunteer_activity_workspace_project(
     array(select id from page_ids),p_command->'filter')
   )
   select (select count(*) from candidates),
    (select coalesce(jsonb_agg(item order by
     case when p_command#>>'{filter,sort}'='desc' then item->>'starts_at' end desc,
     case when coalesce(p_command#>>'{filter,sort}','asc')='asc' then item->>'starts_at' end,
     item->>'id'),'[]') from projected)
   into n,items;
  end if;
$new_branch$;
begin
 if (length(definition)-length(replace(definition,old_branch,'')))<>length(old_branch) then
  raise exception 'Expected exactly one current volunteer workspace list branch';
 end if;
 execute replace(definition,old_branch,new_branch);
end
$migration$;
