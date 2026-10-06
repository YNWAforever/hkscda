-- Staff status transitions use the public-submission activity lock before any row locks.
create or replace function public.set_volunteer_registration_status_with_audit(p_registration_id uuid,p_actor_user_id uuid,p_expected_updated_at timestamptz,p_status text,p_internal_notes text default null,p_update_internal_notes boolean default true)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_activity_id uuid; v_activity public.volunteer_activity%rowtype; v_registration public.volunteer_registration%rowtype; v_used bigint;
begin
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
 insert into public.audit_log(actor_user_id,action,entity,entity_id,detail) values(p_actor_user_id,'volunteer_registration.status_update','volunteer_registration',p_registration_id::text,jsonb_build_object('status',p_status));
 return jsonb_build_object('kind','updated','updatedAt',v_registration.updated_at,'registration',to_jsonb(v_registration));
end $$;
revoke all on function public.set_volunteer_registration_status_with_audit(uuid,uuid,timestamptz,text,text,boolean) from public,anon,authenticated;
grant execute on function public.set_volunteer_registration_status_with_audit(uuid,uuid,timestamptz,text,text,boolean) to service_role;

create or replace function public.update_volunteer_activity_with_audit(p_activity_id uuid,p_actor_user_id uuid,p_expected_updated_at timestamptz,p_input jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_activity public.volunteer_activity%rowtype; v_next public.volunteer_activity%rowtype; v_used bigint;
begin
 if not exists(select 1 from public.admin_user where auth_user_id=p_actor_user_id and status='active' and role in ('staff','admin')) then raise exception 'volunteer_forbidden' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_activity_id::text,0));
 select * into v_activity from public.volunteer_activity where id=p_activity_id for update;
 if not found then return jsonb_build_object('kind','not_found'); end if;
 if p_expected_updated_at is null or v_activity.updated_at<>p_expected_updated_at then return jsonb_build_object('kind','conflict'); end if;
 select * into v_next from jsonb_populate_record(v_activity,p_input);
 select coalesce(sum(participant_count),0) into v_used from public.volunteer_registration where activity_id=p_activity_id and status='approved';
 if v_next.capacity<v_used then return jsonb_build_object('kind','capacity_full'); end if;
 update public.volunteer_activity set type=v_next.type,title=v_next.title,description=v_next.description,starts_at=v_next.starts_at,ends_at=v_next.ends_at,location=v_next.location,capacity=v_next.capacity,min_age=v_next.min_age,underage_policy=v_next.underage_policy,auto_approve=v_next.auto_approve,allow_waitlist=v_next.allow_waitlist,status=v_next.status,registration_modes=v_next.registration_modes where id=p_activity_id returning * into v_activity;
 insert into public.audit_log(actor_user_id,action,entity,entity_id,detail) values(p_actor_user_id,'volunteer_activity.update','volunteer_activity',p_activity_id::text,p_input);
 return jsonb_build_object('kind','updated','updatedAt',v_activity.updated_at);
end $$;
revoke all on function public.update_volunteer_activity_with_audit(uuid,uuid,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.update_volunteer_activity_with_audit(uuid,uuid,timestamptz,jsonb) to service_role;

-- Counts used for refreshed capacity are complete even beyond the API row limit.
create or replace function public.volunteer_activity_counts(p_activity_ids uuid[])
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
 select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from (
 select activity_id,coalesce(sum(participant_count) filter(where status='approved'),0) approved_participants,coalesce(sum(participant_count) filter(where status='pending'),0) pending_participants,coalesce(sum(participant_count) filter(where status='waitlisted'),0) waitlisted_participants
 from public.volunteer_registration where activity_id=any(p_activity_ids) group by activity_id) t;
$$;
revoke all on function public.volunteer_activity_counts(uuid[]) from public,anon,authenticated;
grant execute on function public.volunteer_activity_counts(uuid[]) to service_role;

