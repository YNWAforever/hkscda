-- Choose the existing 500 eligible tasks before hydrating registration/activity.
-- Keep authorization, completion exclusion, JSON fields, timestamp ordering,
-- notification delivery evidence and every mutation branch unchanged.
do $migration$
declare
 definition text:=pg_get_functiondef('public.volunteer_task_command(uuid,jsonb)'::regprocedure);
 old_projection text:=$old$from(select o.id,o.kind,o.created_at,o.payload,r.id registration_id,r.contact_name,coalesce(a.id,(o.payload->>'activity_id')::uuid) activity_id,a.title,a.starts_at from public.volunteer_operation_outbox o left join public.volunteer_registration r on r.id=(o.payload->>'registration_id')::uuid left join public.volunteer_activity a on a.id=coalesce(r.activity_id,(o.payload->>'activity_id')::uuid) where o.kind in('volunteer_booking_changed','volunteer_qualification_review','volunteer_operation_changed','volunteer_policy_contact') and not exists(select 1 from public.volunteer_task_completion c where c.outbox_id=o.id) order by o.created_at desc limit 500)x$old$;
 new_projection text:=$new$from(
  with selected_tasks as materialized (
   select o.id,o.kind,o.created_at,o.payload
   from public.volunteer_operation_outbox o
   where o.kind in('volunteer_booking_changed','volunteer_qualification_review','volunteer_operation_changed','volunteer_policy_contact')
    and not exists(select 1 from public.volunteer_task_completion c where c.outbox_id=o.id)
   order by o.created_at desc limit 500
  )
  select o.id,o.kind,o.created_at,o.payload,r.id registration_id,r.contact_name,
   coalesce(a.id,(o.payload->>'activity_id')::uuid) activity_id,a.title,a.starts_at
  from selected_tasks o
  left join public.volunteer_registration r on r.id=(o.payload->>'registration_id')::uuid
  left join public.volunteer_activity a on a.id=coalesce(r.activity_id,(o.payload->>'activity_id')::uuid)
 )x$new$;
begin
 if (length(definition)-length(replace(definition,old_projection,'')))<>length(old_projection) then
  raise exception 'Unexpected volunteer task hydration query; review before applying';
 end if;
 execute replace(definition,old_projection,new_projection);
end
$migration$;
