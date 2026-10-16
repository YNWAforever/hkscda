-- Old workspace readers require groups/selection even for an unfamiliar action.
-- Empty arrays keep a rollback read-only: no synthetic legacy apply group is invented.
do $migration$
declare definition text:=pg_get_functiondef(
 'public.volunteer_roster_attendance_result(public.volunteer_bulk_operation)'::regprocedure);
 old_fields text:=$old$'notifications','[]'::jsonb$old$;
 new_fields text:=$new$'groups','[]'::jsonb,'selection','[]'::jsonb,'notifications','[]'::jsonb$new$;
begin
 if (length(definition)-length(replace(definition,old_fields,'')))<>length(old_fields)
  or position($present$'selection'$present$ in definition)>0 then
  raise exception 'Unexpected roster result envelope; review before applying';
 end if;
 execute replace(definition,old_fields,new_fields);
end
$migration$;
