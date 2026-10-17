-- A page-scoped attendance facade. Existing attendance facts/audit remain authoritative.
create function public.volunteer_roster_attendance_fact(p_row public.volunteer_registration)
returns jsonb language sql stable set search_path=public,pg_temp as $function$
 select case when p_row.id is null then null else jsonb_build_object(
  'registration_status',p_row.status,'attendance_status',p_row.attendance_status,'updated_at',p_row.updated_at) end
$function$;
revoke all on function public.volunteer_roster_attendance_fact(public.volunteer_registration) from public,anon,authenticated,service_role;

create function public.volunteer_roster_attendance_reason(p_kind text,p_status text,p_activity_status text)
returns text language sql immutable set search_path=public,pg_temp as $function$
 select case p_kind
  when 'future_attendance' then 'future_attendance'
  when 'attendance_correction_required' then 'attendance_correction_required'
  when 'not_found' then 'registration_missing'
  when 'conflict' then 'stale_registration'
  when 'invalid_attendance_status' then case when p_activity_status='cancelled' then 'activity_cancelled'
   when p_status<>'approved' then 'registration_not_approved' else 'invalid_attendance_status' end
  else 'transaction_failed' end
$function$;
revoke all on function public.volunteer_roster_attendance_reason(text,text,text) from public,anon,authenticated,service_role;

create function public.volunteer_roster_attendance_result(p_operation public.volunteer_bulk_operation)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $function$
 select jsonb_build_object('kind','ready','operation',jsonb_build_object(
  'id',p_operation.id,'action','roster_attendance','created_at',p_operation.created_at,'expires_at',p_operation.expires_at,
  'activity_id',p_operation.input->>'activity_id','activity_title',p_operation.selection->0->>'title',
  'scope',jsonb_build_object('kind','page','page',(p_operation.input->>'page')::integer,'page_size',25,
   'selected_count',jsonb_array_length(p_operation.groups->0->'roster_rows')),
  'state',case when jsonb_typeof(p_operation.groups->0->'roster_results')='array' then 'completed'
   when p_operation.expires_at<clock_timestamp() then 'expired' else 'previewed' end,
  'rows',p_operation.groups->0->'roster_rows','results',p_operation.groups->0->'roster_results',
  'notifications','[]'::jsonb))
$function$;
revoke all on function public.volunteer_roster_attendance_result(public.volunteer_bulk_operation) from public,anon,authenticated,service_role;

create function public.volunteer_roster_attendance_command(p_actor uuid,p_command jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $function$
declare
 action text:=p_command->>'action'; request_hash text; normalized jsonb; entries jsonb; entry jsonb;
 op public.volunteer_bulk_operation%rowtype; a public.volunteer_activity%rowtype;
 r public.volunteer_registration%rowtype;
 ids uuid[]; page_ids uuid[]; rows jsonb:='[]'::jsonb; results jsonb:='[]'::jsonb;
 result jsonb; before_fact jsonb; current_fact jsonb; after_fact jsonb;
 decision text; why text; outcome text; event_id text; audit_id text; expired boolean; stale_activity boolean;
begin
 perform public.volunteer_bulk_admin(p_actor);
 if action not in('attendance_preview','attendance_apply','attendance_lookup') or action is null then
  raise exception 'invalid_attendance_command' using errcode='22023';
 end if;
 if action in('attendance_preview','attendance_apply') then
  perform pg_advisory_xact_lock(hashtextextended('volunteer-domain',0));
  perform public.volunteer_bulk_admin(p_actor);
 end if;
 if action='attendance_lookup' then
  select * into op from public.volunteer_bulk_operation o
   where o.actor_user_id=p_actor and o.request_key=(p_command->>'idempotency_key')::uuid and o.action='roster_attendance';
  if not found then return jsonb_build_object('kind','not_found');end if;
  return public.volunteer_roster_attendance_result(op);
 elsif action='attendance_preview' then
  if coalesce(p_command->>'page_size','')<>'25' or coalesce((p_command->>'page')::integer,0) not between 1 and 100000
   or jsonb_typeof(p_command->'entries') is distinct from 'array' then
   raise exception 'invalid_attendance_input' using errcode='22023';
  end if;
  if jsonb_array_length(p_command->'entries') not between 1 and 25
   or p_command->>'expected_activity_updated_at' is null or p_command->>'idempotency_key' is null then
   raise exception 'invalid_attendance_input' using errcode='22023';
  end if;
  for entry in select value from jsonb_array_elements(p_command->'entries') loop
   if entry->>'registration_id' is null or entry->>'expected_updated_at' is null
    or coalesce(entry->>'attendance_status','') not in('not_marked','attended','completed','no_show')
    or coalesce(entry->>'command','') not in('record','correct')
    or length(coalesce(entry->>'reason',''))>1000
    or (entry->>'command'='correct' and nullif(btrim(entry->>'reason'),'') is null) then
    raise exception 'invalid_attendance_input' using errcode='22023';
   end if;
  end loop;
  select array_agg((value->>'registration_id')::uuid order by (value->>'registration_id')::uuid),
   jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'registration_id',(value->>'registration_id')::uuid,'expected_updated_at',value->>'expected_updated_at',
    'attendance_status',value->>'attendance_status','command',value->>'command',
    'reason',nullif(btrim(value->>'reason'),''))) order by (value->>'registration_id')::uuid)
   into ids,entries from jsonb_array_elements(p_command->'entries');
  if (select count(distinct id) from unnest(ids) id)<>cardinality(ids) then
   raise exception 'duplicate_attendance_target' using errcode='22023';
  end if;
  normalized:=jsonb_set(p_command,'{entries}',entries);
  request_hash:=md5(normalized::text);
  select * into op from public.volunteer_bulk_operation
   where actor_user_id=p_actor and request_key=(p_command->>'idempotency_key')::uuid;
  if found then
   if op.action<>'roster_attendance' or op.request_hash<>request_hash then
    return jsonb_build_object('kind','conflict','reason','idempotency_payload_changed');
   end if;
   return public.volunteer_roster_attendance_result(op);
  end if;
  select * into a from public.volunteer_activity where id=(p_command->>'activity_id')::uuid for update;
  if not found then return jsonb_build_object('kind','not_found');end if;
  perform public.volunteer_bulk_admin(p_actor);
  if a.updated_at is distinct from (p_command->>'expected_activity_updated_at')::timestamptz then
   return jsonb_build_object('kind','conflict','reason','stale_preview');
  end if;
  select array_agg(id) into page_ids from (
   select id from public.volunteer_registration where activity_id=a.id order by created_at,id
   limit 25 offset ((p_command->>'page')::integer-1)*25
  ) page;
  if not ids<@coalesce(page_ids,'{}'::uuid[]) then
   return jsonb_build_object('kind','conflict','reason','selection_changed');
  end if;
  perform 1 from public.volunteer_registration where id=any(ids) order by id for update;
  perform public.volunteer_bulk_admin(p_actor);
  for entry in select value from jsonb_array_elements(entries) loop
   select * into r from public.volunteer_registration where id=(entry->>'registration_id')::uuid;
   if not found then return jsonb_build_object('kind','conflict','reason','selection_changed');end if;
   before_fact:=public.volunteer_roster_attendance_fact(r);result:=null;why:=null;
   if r.updated_at is distinct from (entry->>'expected_updated_at')::timestamptz then
    decision:='conflicted';why:='stale_registration';
   elsif r.attendance_status=entry->>'attendance_status' then decision:='skipped';why:='unchanged';
   else
    -- Exercise the same rule/trigger path, then roll back every fact, audit and internal effect.
    begin
     result:=public.set_volunteer_attendance_with_audit(r.id,p_actor,r.updated_at,
      entry->>'attendance_status',entry->>'command',entry->>'reason');
     raise exception using errcode='PVA01',message='attendance_preview_rollback';
    exception when sqlstate 'PVA01' then null;
     when others then result:=jsonb_build_object('kind','failed');
    end;
    if result->>'kind'='updated' then decision:='ready';
    else
     decision:='skipped';
     why:=public.volunteer_roster_attendance_reason(result->>'kind',r.status,a.status);
    end if;
   end if;
   rows:=rows||jsonb_build_array(jsonb_build_object(
    'registration_id',r.id,'contact_name',r.contact_name,'participant_count',r.participant_count,
    'before',before_fact,'target',entry,'decision',decision,'reason',why));
  end loop;
  insert into public.volunteer_bulk_operation(actor_user_id,request_key,request_hash,action,input,selection,groups)
   values(p_actor,(p_command->>'idempotency_key')::uuid,request_hash,'roster_attendance',normalized,
    jsonb_build_array(to_jsonb(a)),jsonb_build_array(jsonb_build_object(
     'index',0,'date',(a.starts_at at time zone 'Asia/Hong_Kong')::date,'state','pending','items','[]'::jsonb,
     'roster_rows',rows,'roster_results',null))) returning * into op;
  return public.volunteer_roster_attendance_result(op);
 end if;

 select * into op from public.volunteer_bulk_operation
  where id=(p_command->>'operation_id')::uuid and actor_user_id=p_actor for update;
 if not found then return jsonb_build_object('kind','not_found');end if;
 if op.action<>'roster_attendance' then return jsonb_build_object('kind','invalid','reason','invalid_attendance_status');end if;
 perform public.volunteer_bulk_admin(p_actor);
 if jsonb_typeof(op.groups->0->'roster_results')='array' then return public.volunteer_roster_attendance_result(op);end if;
 select * into a from public.volunteer_activity where id=(op.input->>'activity_id')::uuid for update;
 select array_agg((value->>'registration_id')::uuid) into ids from jsonb_array_elements(op.groups->0->'roster_rows');
 perform 1 from public.volunteer_registration where id=any(ids) order by id for update;
 perform public.volunteer_bulk_admin(p_actor);
 expired:=op.expires_at<clock_timestamp();
 stale_activity:=a.id is null or a.updated_at is distinct from (op.input->>'expected_activity_updated_at')::timestamptz;
 for entry in select value from jsonb_array_elements(op.groups->0->'roster_rows') loop
  perform public.volunteer_bulk_admin(p_actor);
  select * into r from public.volunteer_registration
   where id=(entry->>'registration_id')::uuid and activity_id=(op.input->>'activity_id')::uuid;
  before_fact:=entry->'before';current_fact:=public.volunteer_roster_attendance_fact(r);
  after_fact:=null;event_id:=null;audit_id:=null;why:=null;result:=null;
  if expired then outcome:='skipped';why:='operation_expired';
  elsif entry->>'decision'<>'ready' then outcome:=entry->>'decision';why:=entry->>'reason';
  elsif stale_activity then outcome:='conflicted';why:='stale_activity';
  elsif r.id is null then outcome:='conflicted';why:='registration_missing';
  elsif r.updated_at is distinct from (entry#>>'{target,expected_updated_at}')::timestamptz then
   outcome:='conflicted';why:='stale_registration';
  else
   begin
    result:=public.set_volunteer_attendance_with_audit(r.id,p_actor,
     (entry#>>'{target,expected_updated_at}')::timestamptz,entry#>>'{target,attendance_status}',
     entry#>>'{target,command}',entry#>>'{target,reason}');
    if result->>'kind'='updated' then
     event_id:=result->>'eventId';
     select id::text into audit_id from public.audit_log
      where actor_user_id=p_actor and entity_id=r.id::text and detail->>'eventId'=event_id;
     if event_id is null or audit_id is null then raise exception 'attendance_receipt_missing';end if;
     outcome:='applied';
     after_fact:=jsonb_build_object('registration_status',result#>>'{registration,status}',
      'attendance_status',result#>>'{registration,attendance_status}','updated_at',result#>'{registration,updated_at}');
     current_fact:=after_fact;
    else
     why:=public.volunteer_roster_attendance_reason(result->>'kind',r.status,a.status);
     outcome:=case when why in('stale_registration','registration_missing') then 'conflicted' else 'skipped' end;
    end if;
   exception when others then
    outcome:='failed';why:='transaction_failed';after_fact:=null;event_id:=null;audit_id:=null;
   end;
  end if;
  if outcome<>'applied' then
   -- Outside the per-person subtransaction. Failure to persist this or the final receipt aborts ALL.
   insert into public.audit_log(actor_user_id,action,entity,entity_id,detail)
    values(p_actor,'volunteer_registration.attendance_attempt','volunteer_registration',entry->>'registration_id',
     jsonb_build_object('operationId',op.id,'requested',entry->'target','before',before_fact,
      'current',current_fact,'result',jsonb_build_object('kind',outcome,'reason',why)))
    returning id::text into audit_id;
  end if;
  results:=results||jsonb_build_array(jsonb_build_object(
   'registration_id',entry->>'registration_id','kind',outcome,'reason',why,'before',before_fact,
   'current',current_fact,'after',after_fact,'event_id',event_id,'audit_id',audit_id));
 end loop;
 update public.volunteer_bulk_operation set groups=jsonb_set(jsonb_set(groups,'{0,roster_results}',results),'{0,state}','"applied"'::jsonb)
  where id=op.id returning * into op;
 return public.volunteer_roster_attendance_result(op);
end
$function$;
revoke all on function public.volunteer_roster_attendance_command(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.volunteer_roster_attendance_command(uuid,jsonb) to service_role;

-- Wrap the CURRENT legacy result query without replacing it from an old audit snapshot.
do $migration$
declare old_source text; language_name text; wrapped text;
begin
 select p.prosrc,l.lanname into old_source,language_name from pg_proc p join pg_language l on l.oid=p.prolang
  where p.oid='public.volunteer_bulk_result(public.volunteer_bulk_operation)'::regprocedure;
 if language_name<>'sql' or position('roster_attendance' in old_source)>0 then
  raise exception 'Unexpected volunteer bulk result definition; review before applying';
 end if;
 wrapped:='select case when p_operation.action=''roster_attendance'' then public.volunteer_roster_attendance_result(p_operation) else ('
  ||regexp_replace(old_source,';\s*$','')||') end';
 execute format('create or replace function public.volunteer_bulk_result(p_operation public.volunteer_bulk_operation) returns jsonb language sql stable security definer set search_path=public,pg_temp as %L',wrapped);
end
$migration$;

-- Only the detail projection and the new-action apply fence change in the current command.
do $migration$
declare definition text:=pg_get_functiondef('public.volunteer_bulk_command(uuid,jsonb)'::regprocedure);
 old_fields text:='select id,contact_name,status,attendance_status,duty_role,updated_at from';
 old_detail text:=$old$return jsonb_build_object('kind','detail','activity',$old$;
 old_apply text:=$old$if action='apply' then$old$;
begin
 if (length(definition)-length(replace(definition,old_fields,'')))<>length(old_fields)
  or (length(definition)-length(replace(definition,old_detail,'')))<>length(old_detail)
  or (length(definition)-length(replace(definition,old_apply,'')))<>length(old_apply) then
  raise exception 'Unexpected current volunteer bulk branches; review before applying';
 end if;
 definition:=replace(definition,old_fields,'select id,contact_name,status,attendance_status,duty_role,updated_at,participant_count from');
 definition:=replace(definition,old_detail,$new$return jsonb_build_object('kind','detail','attendance_contract',1,'asOf',clock_timestamp(),'activity',$new$);
 definition:=replace(definition,old_apply,$new$if action='apply' then
   if op.action='roster_attendance' then return jsonb_build_object('kind','invalid','reason','invalid_attendance_status');end if;$new$);
 execute definition;
end
$migration$;
