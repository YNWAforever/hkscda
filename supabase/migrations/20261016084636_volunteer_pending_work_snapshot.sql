-- Enrich only the requested pending page. Capacity is an observation, never a reservation.
create function public.volunteer_pending_work_snapshot(
 p_actor uuid,p_scope text,p_page integer,p_page_size integer,p_as_of timestamptz,p_query text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $function$
declare query_text text:=btrim(coalesce(p_query,''));
begin
 perform public.volunteer_bulk_admin(p_actor);
 if p_scope is null or p_scope not in('all','upcoming','overdue')
  or p_page is null or p_page not between 1 and 100000
  or p_page_size is null or p_page_size not between 0 and 100
  or p_as_of is null or length(query_text)>100 then
  raise exception 'invalid_pending_query' using errcode='22023';
 end if;
 return (
  with pending as materialized (
   select r.id,r.profile_id,r.contact_name,r.participant_count,r.status,
    a.id activity_id,a.title,a.starts_at,a.ends_at,a.location,a.capacity
   from public.volunteer_registration r join public.volunteer_activity a on a.id=r.activity_id
   where r.status='pending'
  ), totals as (
   select count(*) filter(where starts_at>p_as_of) upcoming,
    count(*) filter(where starts_at<=p_as_of) overdue,count(*) total from pending
  ), matching as materialized (
   select * from pending
   where (p_scope='all' or p_scope='upcoming' and starts_at>p_as_of or p_scope='overdue' and starts_at<=p_as_of)
    and (query_text='' or position(lower(query_text) in lower(contact_name||' '||title||' '||location||' '||id::text))>0)
  ), page_rows as materialized (
   select * from matching order by starts_at,id limit p_page_size offset (p_page-1)*p_page_size
  ), approved as (
   select r.activity_id,sum(r.participant_count) participants
   from public.volunteer_registration r
   join (select distinct activity_id from page_rows) a on a.activity_id=r.activity_id
   where r.status='approved' group by r.activity_id
  ), projected as (
   select p.*,coalesce(a.participants,0) approved_participants,
    greatest(0,p.capacity-coalesce(a.participants,0)) remaining_capacity
   from page_rows p left join approved a on a.activity_id=p.activity_id
  )
  select jsonb_build_object(
   'counts',jsonb_build_object('upcoming',upcoming,'overdue',overdue,'total',total,'asOf',p_as_of),
   'registrations',(select coalesce(jsonb_agg(to_jsonb(p) order by p.starts_at,p.id),'[]'::jsonb) from projected p),
   'filteredTotal',(select count(*) from matching),'page',p_page,'pageSize',p_page_size)
  from totals
 );
end
$function$;
revoke all on function public.volunteer_pending_work_snapshot(uuid,text,integer,integer,timestamptz,text) from public,anon,authenticated;
grant execute on function public.volunteer_pending_work_snapshot(uuid,text,integer,integer,timestamptz,text) to service_role;

create or replace function public.volunteer_pending_snapshot(
 p_actor uuid,p_scope text,p_page integer,p_page_size integer,p_as_of timestamptz
) returns jsonb language sql security definer set search_path=public,pg_temp as $function$
 select public.volunteer_pending_work_snapshot(p_actor,p_scope,p_page,p_page_size,p_as_of,'')
$function$;
revoke all on function public.volunteer_pending_snapshot(uuid,text,integer,integer,timestamptz) from public,anon,authenticated;
grant execute on function public.volunteer_pending_snapshot(uuid,text,integer,integer,timestamptz) to service_role;

-- The server's list composition can omit the unused legacy 200-row projection.
-- Old callers remain unchanged, as does every follow-up/notification mutation.
do $migration$
declare
 definition text:=pg_get_functiondef('public.volunteer_task_command(uuid,jsonb)'::regprocedure);
 old_filter text:=$old$where r.status='pending' and a.starts_at>clock_timestamp()$old$;
 new_filter text:=$new$where coalesce((p_command->>'include_pending')::boolean,true) and r.status='pending' and a.starts_at>clock_timestamp()$new$;
begin
 if (length(definition)-length(replace(definition,old_filter,'')))<>length(old_filter) then
  raise exception 'Unexpected current volunteer task pending projection; review before applying';
 end if;
 execute replace(definition,old_filter,new_filter);
end
$migration$;
