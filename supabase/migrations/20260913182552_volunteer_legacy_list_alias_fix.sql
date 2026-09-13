-- Forward-only repair: list_legacy SQL aliases collided with PL/pgSQL records r/a.
-- Preserve the existing function's authorization, link mutation, attributes and ACL.
do $migration$
declare
 function_definition text := pg_get_functiondef('public.volunteer_legacy_identity_command(uuid,jsonb)'::regprocedure);
 old_fragment text := $fragment$jsonb_build_object('registrations',(select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'contact_name',r.contact_name,'contact_email',r.contact_email,'status',r.status,'updated_at',r.updated_at,'title',a.title,'starts_at',a.starts_at,'policy_bound',a.policy_version_id is not null) order by a.starts_at),'[]') from public.volunteer_registration r join public.volunteer_activity a on a.id=r.activity_id where r.profile_id is null and r.registration_type='individual' and r.participant_count=1 and r.status in ('pending','waitlisted') and a.starts_at>clock_timestamp()))$fragment$;
 new_fragment text;
begin
 if (length(function_definition)-length(replace(function_definition,old_fragment,'')))/length(old_fragment) <> 1 then
  raise exception 'Expected exactly one legacy list fragment; review current function before applying alias repair';
 end if;
 new_fragment := replace(replace(replace(replace(old_fragment,
  'r.','legacy_registration.'),'a.','legacy_activity.'),
  'public.volunteer_registration r ','public.volunteer_registration legacy_registration '),
  'public.volunteer_activity a ','public.volunteer_activity legacy_activity ');
 execute replace(function_definition,old_fragment,new_fragment);
end $migration$;
