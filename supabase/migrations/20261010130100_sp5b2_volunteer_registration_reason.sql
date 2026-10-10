-- SP-5b-2 M2: rejecting a volunteer registration records the reason staff gave.
-- Backward compatible (plan D1): p_reason defaults to null and the audit detail then stays
-- {"status": ...}, exactly what the previous definition wrote, so the deployed app keeps working.
-- The body is the 20260913062837 definition verbatim apart from the added argument and the
-- audit detail expression. Both callers (the admin repository and the waitlist promotion job)
-- pass named arguments, so the default keeps them working.
drop function if exists public.set_volunteer_registration_status_with_audit(uuid, uuid, timestamptz, text, text, boolean);

-- Staff status transitions use the public-submission activity lock before any row locks.
create function public.set_volunteer_registration_status_with_audit(p_registration_id uuid,p_actor_user_id uuid,p_expected_updated_at timestamptz,p_status text,p_internal_notes text default null,p_update_internal_notes boolean default true,p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_activity_id uuid; v_activity public.volunteer_activity%rowtype; v_registration public.volunteer_registration%rowtype; v_used bigint;
begin
 perform pg_advisory_xact_lock(hashtextextended('volunteer-domain',0));
 if not exists(select 1 from public.admin_user where auth_user_id=p_actor_user_id and status='active' and role in ('staff','admin')) then raise exception 'volunteer_forbidden' using errcode='42501'; end if;
 if p_status is null or p_status not in ('pending','approved','waitlisted','rejected','cancelled') or p_expected_updated_at is null then raise exception 'invalid_volunteer_status' using errcode='22023'; end if;
 select activity_id into v_activity_id from public.volunteer_registration where id=p_registration_id;
 if not found then return jsonb_build_object('kind','not_found'); end if;
 perform pg_advisory_xact_lock(hashtextextended(v_activity_id::text,0));
 select * into v_activity from public.volunteer_activity where id=v_activity_id for update;
 select * into v_registration from public.volunteer_registration where id=p_registration_id for update;
 if not found or v_registration.activity_id<>v_activity_id then return jsonb_build_object('kind','conflict'); end if;
 if v_registration.updated_at<>p_expected_updated_at then return jsonb_build_object('kind','conflict'); end if;
 if p_status='approved' then
  select coalesce(sum(participant_count),0) into v_used from public.volunteer_registration where activity_id=v_activity_id and status='approved' and id<>p_registration_id;
  if v_used+v_registration.participant_count>v_activity.capacity then return jsonb_build_object('kind','capacity_full'); end if;
 end if;
 update public.volunteer_registration set status=p_status,status_reason='manual_review',internal_notes=case when p_update_internal_notes then p_internal_notes else internal_notes end where id=p_registration_id returning * into v_registration;
 insert into public.audit_log(actor_user_id,action,entity,entity_id,detail) values(p_actor_user_id,'volunteer_registration.status_update','volunteer_registration',p_registration_id::text,pg_catalog.jsonb_strip_nulls(jsonb_build_object('status', p_status, 'reason', nullif(btrim(p_reason), ''))));
 return jsonb_build_object('kind','updated','updatedAt',v_registration.updated_at,'registration',to_jsonb(v_registration));
end $$;

revoke all on function public.set_volunteer_registration_status_with_audit(uuid,uuid,timestamptz,text,text,boolean,text) from public,anon,authenticated,service_role;
grant execute on function public.set_volunteer_registration_status_with_audit(uuid,uuid,timestamptz,text,text,boolean,text) to service_role;
