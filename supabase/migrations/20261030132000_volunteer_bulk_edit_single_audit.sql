-- BUG-64: a volunteer bulk edit wrote two audit rows for one change.
--
-- volunteer_bulk_item's edit branch (20260914160736) called
-- update_volunteer_activity_with_audit, whose inner update_volunteer_activity_before_bulk
-- writes volunteer_activity.update (detail: the changes only), and then wrote
-- volunteer_bulk.edit (detail: the full row before, the input and the bulk item key) for the
-- same change. Activity history showed the edit twice with two different shapes.
--
-- Choice: keep volunteer_bulk.edit and drop the volunteer_activity.update row. The bulk row is
-- the more complete record: it has the before facts, the input (the changes and any reason),
-- and the item key that ties it to the bulk operation and its notification; the
-- volunteer_activity.update row had only the changes. The edit branch now updates title and
-- description itself (there is no un-audited update function to call: the existing ones all
-- write their own audit row), and the volunteer_bulk.edit row also records the row after the
-- change ('after'), so it carries before and after facts. Detail for the other bulk actions
-- is unchanged.
--
-- Everything else is identical to 20260914160736: signature, security definer, search_path,
-- the other branches, the outbox row and the result. Grants unchanged (internal only:
-- reached through volunteer_bulk_command).

create or replace function public.volunteer_bulk_item(p_actor uuid,p_action text,p_input jsonb,p_item jsonb,p_key uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.volunteer_activity%rowtype;edited public.volunteer_activity%rowtype;r public.volunteer_registration%rowtype;result jsonb;results jsonb:='[]';before_fact jsonb;v public.volunteer_policy_version%rowtype;candidate jsonb;begin
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
  -- BUG-64: write the change here and let the volunteer_bulk.edit row below be its only
  -- audit row. update_volunteer_activity_with_audit (and update_volunteer_activity_before_bulk
  -- under it) also wrote volunteer_activity.update for the same change. Its other checks are
  -- already met: volunteer_bulk_command holds the domain lock and checked volunteer_bulk_admin,
  -- the row is locked above and matched the previewed updated_at, and only title and
  -- description can change, so the status and capacity checks cannot apply. The new values
  -- are read the same way (jsonb_populate_record over the current row).
  select * into edited from jsonb_populate_record(a,p_input->'changes');
  update public.volunteer_activity set title=edited.title,description=edited.description where id=a.id;
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
 insert into public.audit_log(actor_user_id,action,entity,entity_id,detail) values(p_actor,'volunteer_bulk.'||p_action,'volunteer_activity',a.id::text,jsonb_build_object('before',before_fact,'input',p_input,'item_key',p_key)||case when p_action='edit' then jsonb_build_object('after',(select to_jsonb(x) from public.volunteer_activity x where x.id=a.id)) else '{}'::jsonb end);
 if p_action in('edit','rebind','close') then insert into public.volunteer_operation_outbox(dedup_key,kind,payload) values('bulk:'||p_key::text,'volunteer_operation_changed',jsonb_build_object('activity_id',a.id,'operation',p_action,'reason',p_input->>'reason'));end if;
 return jsonb_build_object('kind','applied','activity_id',a.id,'registrations',results,'after',(select jsonb_build_object('title',x.title,'starts_at',x.starts_at,'ends_at',x.ends_at,'shelter_key',x.shelter_key,'policy_version_id',x.policy_version_id,'capacity',x.capacity,'status',x.status) from public.volunteer_activity x where x.id=a.id));
end $$;

-- Unchanged from 20260914160736: not callable directly by any API role.
revoke all on function public.volunteer_bulk_item(uuid,text,jsonb,jsonb,uuid) from public,anon,authenticated,service_role;
