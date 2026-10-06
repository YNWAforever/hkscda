-- Exact persisted selections and preview-bound execution. Existing policy/attendance
-- commands remain authoritative; all business changes, audit and outbox share a transaction.
alter table public.volunteer_activity add column registrations_closed_at timestamptz;
alter table public.volunteer_activity add column registrations_closed_reason text;
create table public.volunteer_bulk_operation (
 id uuid primary key default gen_random_uuid(), actor_user_id uuid not null references auth.users(id),
 request_key uuid not null, request_hash text not null, action text not null,
 input jsonb not null, selection jsonb not null default '[]', groups jsonb not null default '[]',
 created_at timestamptz not null default clock_timestamp(), expires_at timestamptz not null default clock_timestamp()+interval '30 minutes',
 unique(actor_user_id,request_key)
);
alter table public.volunteer_bulk_operation enable row level security;
revoke all on public.volunteer_bulk_operation from public,anon,authenticated;
grant select,insert,update on public.volunteer_bulk_operation to service_role;

alter function public.volunteer_policy_evaluate(uuid,uuid,text,timestamptz,uuid) rename to volunteer_policy_evaluate_before_bulk;
revoke all on function public.volunteer_policy_evaluate_before_bulk(uuid,uuid,text,timestamptz,uuid) from public,anon,authenticated,service_role;
create function public.volunteer_policy_evaluate(p_activity uuid,p_profile uuid,p_role text,p_now timestamptz,p_exclude uuid default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$begin
 if exists(select 1 from public.volunteer_activity where id=p_activity and registrations_closed_at is not null)
 and not exists(select 1 from public.volunteer_registration where id=p_exclude and activity_id=p_activity and status='approved') then
 return jsonb_build_object('allowed',false,'reason','registration_closed');end if;
 return public.volunteer_policy_evaluate_before_bulk(p_activity,p_profile,p_role,p_now,p_exclude);
end $$;
revoke all on function public.volunteer_policy_evaluate(uuid,uuid,text,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.volunteer_policy_evaluate(uuid,uuid,text,timestamptz,uuid) to service_role;

create function public.volunteer_bulk_admin(p_actor uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$begin
 if not exists(select 1 from public.admin_user a join auth.users u on u.id=a.auth_user_id where a.auth_user_id=p_actor and a.role in('staff','admin') and a.status='active' and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<=clock_timestamp())) then raise exception 'volunteer_forbidden' using errcode='42501';end if;
end $$;

-- Summary projection does not return descriptions, personal contact details or policy bodies.
create function public.volunteer_activity_workspace_rows(p_filter jsonb) returns table(item jsonb)
language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('id',a.id,'title',a.title,'starts_at',a.starts_at,'ends_at',a.ends_at,'location',a.location,'status',a.status,'capacity',a.capacity,'template_key',a.template_key,'shelter_key',a.shelter_key,'policy_version_id',a.policy_version_id,'policy_revision',a.policy_revision,'updated_at',a.updated_at,'scenario',v.body#>>'{booking,scenario}','registrations_closed_at',a.registrations_closed_at,'approved',coalesce(c.approved,0),'waitlisted',coalesce(c.waitlisted,0),'shortages',coalesce(s.shortages,'[]'::jsonb))
 from public.volunteer_activity a left join public.volunteer_policy_version v on v.id=a.policy_version_id
 left join lateral(select sum(r.participant_count) filter(where r.status='approved') approved,sum(r.participant_count) filter(where r.status='waitlisted') waitlisted from public.volunteer_registration r where r.activity_id=a.id)c on true
 left join lateral(select jsonb_agg(jsonb_build_object('role',role->>'label','missing',(role->>'minimum')::int-n.occupied)) shortages from jsonb_array_elements(coalesce(v.body->'roles','[]'))role cross join lateral(select count(*)::int occupied from public.volunteer_registration r where r.activity_id=a.id and r.status='approved' and (r.duty_role=role->>'key' or v.body#>>'{capacity,role_count_model}'='leader_in_assistants' and role->>'key'='assistant' and r.duty_role='leader') and coalesce((public.volunteer_policy_evaluate(a.id,r.profile_id,r.duty_role,clock_timestamp(),r.id)->>'reason') not in('verified_profile_required','tier_not_allowed','minimum_age_not_met','credentials_required','role_not_allowed'),true))n where n.occupied<(role->>'minimum')::int)s on true
 where (nullif(p_filter->>'from','') is null or a.starts_at >= ((p_filter->>'from')::date::timestamp at time zone 'Asia/Hong_Kong'))
 and (nullif(p_filter->>'until','') is null or a.starts_at < (((p_filter->>'until')::date+1)::timestamp at time zone 'Asia/Hong_Kong'))
 and (nullif(p_filter->>'q','') is null or position(lower(p_filter->>'q') in lower(a.title||' '||a.location))>0)
 and (nullif(p_filter->>'shelter','') is null or a.shelter_key=p_filter->>'shelter')
 and (nullif(p_filter->>'template','') is null or a.template_key=p_filter->>'template')
 and (nullif(p_filter->>'status','') is null or a.status=p_filter->>'status')
 and (nullif(p_filter->>'scenario','') is null or v.body#>>'{booking,scenario}'=p_filter->>'scenario')
 and (nullif(p_filter->>'readiness','') is null or (p_filter->>'readiness'='ready')=(a.policy_version_id is not null))
 and (not coalesce((p_filter->>'shortage')::boolean,false) or s.shortages is not null)
$$;

-- Includes the entire Hong Kong day's commitments, groups, identity/qualification
-- revisions and policy schedules; a second operator cannot silently stale a preview.
create function public.volunteer_bulk_fingerprint(p_day date) returns text language sql stable security definer set search_path=public,pg_temp as $$
 select md5(jsonb_build_array(
 (select jsonb_agg(to_jsonb(a) order by a.id) from public.volunteer_activity a where (a.starts_at at time zone 'Asia/Hong_Kong')::date=p_day),
 (select jsonb_agg(to_jsonb(r) order by r.id) from public.volunteer_registration r join public.volunteer_activity a on a.id=r.activity_id where (a.starts_at at time zone 'Asia/Hong_Kong')::date=p_day),
 (select jsonb_agg(to_jsonb(g) order by g.id) from public.volunteer_group_request g join public.volunteer_activity a on a.id=g.activity_id where (a.starts_at at time zone 'Asia/Hong_Kong')::date=p_day),
 (select jsonb_agg(to_jsonb(s) order by s.template_key,s.effective_from) from public.volunteer_policy_schedule s where (s.effective_from at time zone 'Asia/Hong_Kong')::date<=p_day and (s.effective_until is null or (s.effective_until at time zone 'Asia/Hong_Kong')::date>=p_day)),
 (select jsonb_agg(to_jsonb(c) order by c.id) from public.volunteer_credential c where c.profile_id in(select r.profile_id from public.volunteer_registration r join public.volunteer_activity a on a.id=r.activity_id where (a.starts_at at time zone 'Asia/Hong_Kong')::date=p_day)),
 (select jsonb_agg(to_jsonb(d) order by d.scope_key) from public.volunteer_daily_policy_binding d where d.service_date=p_day),
 (select jsonb_agg(to_jsonb(p) order by p.id) from public.volunteer_profile p where p.id in(select r.profile_id from public.volunteer_registration r join public.volunteer_activity a on a.id=r.activity_id where (a.starts_at at time zone 'Asia/Hong_Kong')::date=p_day))
 )::text)
$$;

create function public.volunteer_bulk_item(p_actor uuid,p_action text,p_input jsonb,p_item jsonb,p_key uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.volunteer_activity%rowtype;r public.volunteer_registration%rowtype;result jsonb;results jsonb:='[]';before_fact jsonb;v public.volunteer_policy_version%rowtype;candidate jsonb;begin
 if p_action in('generate','copy') then
  if p_action='copy' and not exists(select 1 from public.volunteer_activity where id=(p_item->>'source_id')::uuid and updated_at=(p_item->>'source_updated_at')::timestamptz) then return jsonb_build_object('kind','conflict','reason','stale_preview');end if;
  return public.volunteer_policy_command(p_actor,jsonb_build_object('action','generate','template_key',p_item->>'template_key','date',p_item->>'date','idempotency_key',p_key));
 end if;
 select * into a from public.volunteer_activity where id=(p_item->>'id')::uuid for update;
 if not found then return jsonb_build_object('kind','not_found');end if;
 if a.updated_at is distinct from (p_item->>'updated_at')::timestamptz then return jsonb_build_object('kind','conflict','reason','stale_preview');end if;
 before_fact:=to_jsonb(a);
 if p_action='edit' then
  if exists(select 1 from jsonb_object_keys(p_input->'changes') k where k not in('title','description')) then raise exception 'sensitive_edit_requires_policy' using errcode='22023';end if;
  result:=public.update_volunteer_activity_with_audit(a.id,p_actor,a.updated_at,p_input->'changes');
  if result->>'kind'<>'updated' then return result;end if;
 elsif p_action='rebind' then
  select * into v from public.volunteer_policy_version where id=(p_input->>'version_id')::uuid;
  if not found or not exists(select 1 from public.volunteer_policy_schedule s where s.version_id=v.id and s.effective_from<=a.starts_at and (s.effective_until is null or s.effective_until>a.starts_at)) then return jsonb_build_object('kind','conflict','reason','no_published_policy_for_date');end if;
  if a.status not in('draft','published') or a.starts_at<=clock_timestamp() then return jsonb_build_object('kind','invalid','reason','activity_closed');end if;
  perform set_config('hkscda.policy_command','apply',true);
  update public.volunteer_activity set status='published',starts_at=(((a.starts_at at time zone 'Asia/Hong_Kong')::date+(v.body#>>'{schedule,start_time}')::time) at time zone (v.body->>'timezone')),ends_at=(((a.starts_at at time zone 'Asia/Hong_Kong')::date+(v.body#>>'{schedule,end_time}')::time) at time zone (v.body->>'timezone')),location=v.body#>>'{schedule,location}',shelter_key=v.body->>'shelter' where id=a.id;
  candidate:=public.volunteer_group_candidate(a.id,v.id,a.group_headcount,clock_timestamp());
  if jsonb_array_length(candidate->'issues')>0 then return jsonb_build_object('kind','invalid','issues',candidate->'issues');end if;
  perform set_config('hkscda.policy_command','apply',true);perform set_config('hkscda.group_command','apply',true);
  update public.volunteer_activity set policy_version_id=v.id,policy_revision=policy_revision+1,capacity=(candidate->>'volunteer_capacity')::int,template_key=v.template_key,shelter_key=v.body->>'shelter',min_age=(v.body#>>'{eligibility,min_age}')::int,auto_approve=(v.body#>>'{booking,auto_approve}')::boolean,allow_waitlist=(v.body#>>'{booking,allow_waitlist}')::boolean where id=a.id;
  perform public.volunteer_bind_daily_policy(v.body,(a.starts_at at time zone (v.body->>'timezone'))::date);
  perform set_config('hkscda.policy_command','',true);perform set_config('hkscda.group_command','',true);
 elsif p_action in('close','cancel') then
  if nullif(trim(p_input->>'reason'),'') is null then raise exception 'reason_required' using errcode='22023';end if;
  if a.starts_at<=clock_timestamp() or a.status='cancelled' then return jsonb_build_object('kind','invalid','reason','activity_closed');end if;
  if p_action='close' then
   update public.volunteer_activity set registrations_closed_at=clock_timestamp(),registrations_closed_reason=p_input->>'reason' where id=a.id;
  else
   if exists(select 1 from public.volunteer_registration where activity_id=a.id and attendance_status<>'not_marked') then return jsonb_build_object('kind','invalid','reason','attendance_history_protected');end if;
   update public.volunteer_activity set status='cancelled',registrations_closed_at=clock_timestamp(),registrations_closed_reason=p_input->>'reason' where id=a.id;
   for r in select * from public.volunteer_registration where activity_id=a.id and status in('pending','approved','waitlisted') order by id for update loop
    update public.volunteer_registration set status='cancelled',status_reason=p_input->>'reason' where id=r.id;
    insert into public.volunteer_operation_event(actor_user_id,kind,entity_id,before_fact,after_fact,reason) values(p_actor,'session_cancel',r.id,to_jsonb(r),jsonb_build_object('status','cancelled'),p_input->>'reason');
    insert into public.volunteer_operation_outbox(dedup_key,kind,payload) values('bulk:'||p_key::text||':'||r.id::text,'volunteer_operation_changed',jsonb_build_object('registration_id',r.id,'activity_id',a.id,'operation','session_cancel','reason',p_input->>'reason'));
   end loop;
  end if;
 elsif p_action='attendance' then
  for r in select * from public.volunteer_registration where activity_id=a.id order by id for update loop
   if r.status<>'approved' then results:=results||jsonb_build_array(jsonb_build_object('registration_id',r.id,'kind','skipped','reason','registration_not_approved'));continue;end if;
   result:=public.set_volunteer_attendance_with_audit(r.id,p_actor,r.updated_at,p_input->>'attendance_status',coalesce(p_input->>'command','record'),p_input->>'reason');
   if result->>'kind'<>'updated' then results:=results||jsonb_build_array(jsonb_build_object('registration_id',r.id,'kind','skipped','reason',result->>'kind'));else results:=results||jsonb_build_array(jsonb_build_object('registration_id',r.id,'kind','applied'));end if;
  end loop;
 else raise exception 'invalid_bulk_action' using errcode='22023';end if;
 insert into public.audit_log(actor_user_id,action,entity,entity_id,detail) values(p_actor,'volunteer_bulk.'||p_action,'volunteer_activity',a.id::text,jsonb_build_object('before',before_fact,'input',p_input,'item_key',p_key));
 if p_action in('edit','rebind','close') then insert into public.volunteer_operation_outbox(dedup_key,kind,payload) values('bulk:'||p_key::text,'volunteer_operation_changed',jsonb_build_object('activity_id',a.id,'operation',p_action,'reason',p_input->>'reason'));end if;
 return jsonb_build_object('kind','applied','activity_id',a.id,'registrations',results,'after',(select jsonb_build_object('title',x.title,'starts_at',x.starts_at,'ends_at',x.ends_at,'shelter_key',x.shelter_key,'policy_version_id',x.policy_version_id,'capacity',x.capacity,'status',x.status) from public.volunteer_activity x where x.id=a.id));
end $$;

create function public.volunteer_bulk_result(p_operation public.volunteer_bulk_operation) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('kind','ready','operation',to_jsonb(p_operation)||jsonb_build_object('notifications',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'kind',o.kind,'queue_status',o.status,'follow_up',case when c.outbox_id is not null then 'completed' else 'pending' end,'completed_at',c.completed_at,'provider_message_id',o.payload->>'providerMessageId') order by o.created_at,o.id) from public.volunteer_operation_outbox o left join public.volunteer_task_completion c on c.outbox_id=o.id where exists(select 1 from jsonb_array_elements(p_operation.groups) g cross join lateral jsonb_array_elements(g->'items') i where o.dedup_key='bulk:'||(i->>'item_key') or o.dedup_key like 'bulk:'||(i->>'item_key')||':%')),'[]'::jsonb)));
$$;
revoke all on function public.volunteer_bulk_result(public.volunteer_bulk_operation) from public,anon,authenticated,service_role;

create function public.volunteer_bulk_command(p_actor uuid,p_command jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare op public.volunteer_bulk_operation%rowtype;sel public.volunteer_bulk_operation%rowtype;action text:=p_command->>'action';request_hash text:=md5(p_command::text);items jsonb:='[]';groups jsonb:='[]';group_item jsonb;entry jsonb;result jsonb;results jsonb;payload jsonb;day_key text;source public.volunteer_activity%rowtype;template text;day_value date;n int;idx int;fingerprint text;failed boolean;begin
 perform public.volunteer_bulk_admin(p_actor);
 if action in('select','preview','apply') then perform pg_advisory_xact_lock(hashtextextended('volunteer-domain',0));end if;
 -- Recheck role after waiting for domain locks.
 perform public.volunteer_bulk_admin(p_actor);
 if action in('select','preview') then
  select * into op from public.volunteer_bulk_operation where actor_user_id=p_actor and request_key=(p_command->>'idempotency_key')::uuid;
  if found then if op.request_hash<>request_hash then return jsonb_build_object('kind','conflict','reason','idempotency_payload_changed');end if;return public.volunteer_bulk_result(op);end if;
 end if;
 if action='list' then
  select count(*) into n from public.volunteer_activity_workspace_rows(p_command->'filter');
  select coalesce(jsonb_agg(item),'[]') into items from(select item from public.volunteer_activity_workspace_rows(p_command->'filter') order by case when p_command#>>'{filter,sort}'='desc' then item->>'starts_at' end desc,case when coalesce(p_command#>>'{filter,sort}','asc')='asc' then item->>'starts_at' end,item->>'id' limit 25 offset greatest(coalesce((p_command->>'page')::int,1)-1,0)*25)x;
  return jsonb_build_object('kind','listed','activities',items,'total',n,'page_size',25);
 elsif action='templates' then
  return jsonb_build_object('kind','listed','templates',(select coalesce(jsonb_agg(jsonb_build_object('template_key',v.template_key,'name',v.body->>'name','version_id',v.id,'shelter',v.body->>'shelter','start_time',v.body#>>'{schedule,start_time}','end_time',v.body#>>'{schedule,end_time}') order by v.template_key),'[]') from public.volunteer_policy_version v where exists(select 1 from public.volunteer_policy_schedule s where s.version_id=v.id)));
 elsif action='detail' then
  select * into source from public.volunteer_activity where id=(p_command->>'activity_id')::uuid;
  if not found then return jsonb_build_object('kind','not_found');end if;
  select count(*) into n from public.volunteer_registration where activity_id=source.id;
  select coalesce(jsonb_agg(to_jsonb(x)),'[]') into items from(select id,contact_name,status,attendance_status,duty_role,updated_at from public.volunteer_registration where activity_id=source.id order by created_at,id limit 25 offset greatest(coalesce((p_command->>'page')::int,1)-1,0)*25)x;
  return jsonb_build_object('kind','detail','activity',to_jsonb(source),'registrations',items,'total',n,'history_total',(select count(*) from public.audit_log h where h.entity_id=source.id::text),'history_page',coalesce((p_command->>'history_page')::int,1),'history',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from(select h.id,h.action,h.created_at,h.detail from public.audit_log h where h.entity_id=source.id::text order by h.created_at desc,h.id limit 25 offset greatest(coalesce((p_command->>'history_page')::int,1)-1,0)*25)x));
 elsif action='select' then
  select coalesce(jsonb_agg(item order by item->>'starts_at',item->>'id'),'[]') into items from public.volunteer_activity_workspace_rows(p_command->'filter') where p_command->>'mode'='all' or p_command->'ids' ? (item->>'id');
  if jsonb_array_length(items)>5000 then return jsonb_build_object('kind','invalid','reason','selection_requires_narrower_filter');end if;
  if p_command->>'mode'='page' and jsonb_array_length(items)<>jsonb_array_length(p_command->'ids') then return jsonb_build_object('kind','conflict','reason','selection_changed');end if;
  insert into public.volunteer_bulk_operation(actor_user_id,request_key,request_hash,action,input,selection) values(p_actor,(p_command->>'idempotency_key')::uuid,request_hash,'selection',p_command,items) returning * into op;
 elsif action='preview' then
  payload:=p_command->'input';
  if p_command->>'operation' in('generate','copy') then
   if p_command->>'operation'='copy' then
    select * into source from public.volunteer_activity where id=(payload->>'source_id')::uuid;
    if not found then return jsonb_build_object('kind','not_found');end if;
    if source.template_key is null and nullif(payload->>'template_key','') is null then return jsonb_build_object('kind','invalid','reason','template_mapping_required');end if;
   end if;
   for template in select value from jsonb_array_elements_text(case when p_command->>'operation'='copy' then jsonb_build_array(coalesce(nullif(payload->>'template_key',''),source.template_key)) else payload->'template_keys' end) loop
    for day_value in select value::date from jsonb_array_elements_text(payload->'dates') loop
     items:=items||jsonb_build_array(jsonb_build_object('template_key',template,'date',day_value,'source_id',source.id,'source_updated_at',source.updated_at,'item_key',gen_random_uuid()));
    end loop;
   end loop;
  else
   select * into sel from public.volunteer_bulk_operation where id=(p_command->>'selection_id')::uuid and actor_user_id=p_actor and volunteer_bulk_operation.action='selection';
   if not found then return jsonb_build_object('kind','not_found');end if;
   if sel.expires_at<clock_timestamp() then return jsonb_build_object('kind','conflict','reason','selection_expired');end if;
   for entry in select value from jsonb_array_elements(sel.selection) loop items:=items||jsonb_build_array(entry||jsonb_build_object('date',((entry->>'starts_at')::timestamptz at time zone 'Asia/Hong_Kong')::date,'item_key',gen_random_uuid()));end loop;
  end if;
  if jsonb_array_length(items)=0 or jsonb_array_length(items)>5000 then return jsonb_build_object('kind','invalid','reason','empty_or_excessive_selection');end if;
  for day_key in select distinct value->>'date' from jsonb_array_elements(items) order by 1 loop
   select jsonb_agg(value) into results from jsonb_array_elements(items) where value->>'date'=day_key;
   if jsonb_array_length(results)>100 then return jsonb_build_object('kind','invalid','reason','shared_day_exceeds_100','date',day_key);end if;
   fingerprint:=public.volunteer_bulk_fingerprint(day_key::date);group_item:='[]';
   for entry in select value from jsonb_array_elements(results) loop
    begin
     result:=public.volunteer_bulk_item(p_actor,p_command->>'operation',payload,entry,(entry->>'item_key')::uuid);
     if result->>'kind'='generated' then select entry||jsonb_build_object('title',a.title,'starts_at',a.starts_at,'ends_at',a.ends_at,'shelter_key',a.shelter_key,'policy_version_id',a.policy_version_id,'capacity',a.capacity) into entry from public.volunteer_activity a where a.id=(result->>'activity_id')::uuid;end if;
     raise exception using errcode='PVB01',message='preview_rollback';
    exception when sqlstate 'PVB01' then null;when others then result:=jsonb_build_object('kind','invalid','reason',case when sqlstate='42501' then 'forbidden' else 'domain_validation_failed' end);end;
    group_item:=group_item||jsonb_build_array(entry||jsonb_build_object('preview',result,'state',case when result->>'kind' in('generated','applied','updated') then 'ready' else 'skipped' end));
   end loop;
   groups:=groups||jsonb_build_array(jsonb_build_object('index',jsonb_array_length(groups),'date',day_key,'fingerprint',fingerprint,'state','pending','items',group_item));
  end loop;
  insert into public.volunteer_bulk_operation(actor_user_id,request_key,request_hash,action,input,selection,groups) values(p_actor,(p_command->>'idempotency_key')::uuid,request_hash,p_command->>'operation',payload,items,groups) returning * into op;
 elsif action in('status','apply') then
  select * into op from public.volunteer_bulk_operation where id=(p_command->>'operation_id')::uuid and actor_user_id=p_actor for update;
  if not found then return jsonb_build_object('kind','not_found');end if;
  if action='apply' then
   idx:=(p_command->>'group_index')::int;group_item:=op.groups->idx;
   if group_item is null then return jsonb_build_object('kind','invalid','reason','unknown_group');end if;
   if group_item->>'state'='applied' then return public.volunteer_bulk_result(op);end if;
   if group_item->>'state'='conflicted' then return jsonb_build_object('kind','conflict','reason','stale_preview','operation',to_jsonb(op));end if;
   if op.expires_at<clock_timestamp() or public.volunteer_bulk_fingerprint((group_item->>'date')::date)<>group_item->>'fingerprint' then
    group_item:=group_item||jsonb_build_object('state','conflicted','reason','stale_preview');
   else
    results:='[]';failed:=false;
    begin
     for entry in select value from jsonb_array_elements(group_item->'items') loop
      if entry->>'state'='skipped' then results:=results||jsonb_build_array(entry);continue;end if;
      result:=public.volunteer_bulk_item(p_actor,op.action,op.input,entry,(entry->>'item_key')::uuid);
      if result->>'kind' not in('generated','applied','updated') then failed:=true;raise exception using errcode='PVB02',message='bulk_conflict';end if;
      results:=results||jsonb_build_array(entry||jsonb_build_object('state','applied','result',result));
     end loop;
    exception when sqlstate 'PVB02' then failed:=true;when others then failed:=true;result:=jsonb_build_object('kind','failed','reason','transaction_failed');end;
    if failed then group_item:=group_item||jsonb_build_object('state',case when result->>'kind'='failed' then 'failed' else 'conflicted' end,'reason',coalesce(result->>'reason',result->>'kind'));
    else group_item:=group_item||jsonb_build_object('state','applied','items',results);end if;
   end if;
   update public.volunteer_bulk_operation set groups=jsonb_set(volunteer_bulk_operation.groups,array[idx::text],group_item) where id=op.id returning * into op;
  end if;
 else raise exception 'invalid_bulk_command' using errcode='22023';end if;
 return public.volunteer_bulk_result(op);
end $$;
revoke all on function public.volunteer_bulk_admin(uuid),public.volunteer_activity_workspace_rows(jsonb),public.volunteer_bulk_fingerprint(date),public.volunteer_bulk_item(uuid,text,jsonb,jsonb,uuid) from public,anon,authenticated,service_role;
revoke all on function public.volunteer_bulk_command(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.volunteer_bulk_command(uuid,jsonb) to service_role;

-- Legacy manual creation remains available only as an incomplete draft. A retry
-- with the same key cannot duplicate either the draft or its audit record.
create function public.create_volunteer_draft_with_audit(p_actor uuid,p_key uuid,p_input jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare prior public.volunteer_command_result%rowtype;a public.volunteer_activity%rowtype;result jsonb;begin
 perform pg_advisory_xact_lock(hashtextextended('volunteer-domain',0));perform public.volunteer_bulk_admin(p_actor);
 select * into prior from public.volunteer_command_result where actor_user_id=p_actor and operation='draft_create' and idempotency_key=p_key;
 if found then if prior.payload_hash<>md5(p_input::text) then return jsonb_build_object('kind','conflict','reason','idempotency_payload_changed');end if;return prior.result;end if;
 select * into a from jsonb_populate_record(null::public.volunteer_activity,p_input);
 insert into public.volunteer_activity(type,title,description,starts_at,ends_at,location,capacity,min_age,underage_policy,auto_approve,allow_waitlist,status,registration_modes)
 values(a.type,a.title,a.description,a.starts_at,a.ends_at,a.location,a.capacity,a.min_age,coalesce(a.underage_policy,'allow_with_guardian_pending'),coalesce(a.auto_approve,false),coalesce(a.allow_waitlist,false),'draft',coalesce(a.registration_modes,array['individual'])) returning * into a;
 insert into public.audit_log(actor_user_id,action,entity,entity_id,detail) values(p_actor,'volunteer_activity.create','volunteer_activity',a.id::text,jsonb_build_object('status','draft','title',a.title));
 result:=jsonb_build_object('kind','created','activity_id',a.id);
 insert into public.volunteer_command_result(actor_user_id,operation,idempotency_key,payload_hash,result) values(p_actor,'draft_create',p_key,md5(p_input::text),result);return result;
end $$;
revoke all on function public.create_volunteer_draft_with_audit(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.create_volunteer_draft_with_audit(uuid,uuid,jsonb) to service_role;

-- Supported HTTP updates cannot publish an unbound legacy draft. Session
-- publication is the previewed effective-policy rebind command above.
alter function public.update_volunteer_activity_with_audit(uuid,uuid,timestamptz,jsonb) rename to update_volunteer_activity_before_bulk;
revoke all on function public.update_volunteer_activity_before_bulk(uuid,uuid,timestamptz,jsonb) from public,anon,authenticated,service_role;
create function public.update_volunteer_activity_with_audit(p_activity_id uuid,p_actor_user_id uuid,p_expected_updated_at timestamptz,p_input jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$begin
 perform pg_advisory_xact_lock(hashtextextended('volunteer-domain',0));perform public.volunteer_bulk_admin(p_actor_user_id);
 if p_input->>'status'='published' and exists(select 1 from public.volunteer_activity where id=p_activity_id and (policy_version_id is null or template_key is null or shelter_key is null)) then return jsonb_build_object('kind','invalid','reason','target_date_preview_required');end if;
 return public.update_volunteer_activity_before_bulk(p_activity_id,p_actor_user_id,p_expected_updated_at,p_input);
end $$;
revoke all on function public.update_volunteer_activity_with_audit(uuid,uuid,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.update_volunteer_activity_with_audit(uuid,uuid,timestamptz,jsonb) to service_role;
