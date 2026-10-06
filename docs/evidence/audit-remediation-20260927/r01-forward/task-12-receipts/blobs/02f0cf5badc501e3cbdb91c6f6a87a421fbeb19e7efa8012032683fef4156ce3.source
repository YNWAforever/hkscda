-- Validate the caller-supplied actor inside the coordinator workflow RPCs.
--
-- change_adoption_case_status and finalize_successful_adoption are SECURITY
-- DEFINER functions granted to service_role and called by the server route
-- handlers, which already gate on requireCoordinator (active admin_user with
-- role staff/admin). But the functions trusted p_actor_user_id / p_approved_by
-- verbatim and wrote it straight into coordinator_status_history + audit_log.
-- Anything holding the service-role key could therefore forge the audit trail
-- with an arbitrary or non-admin actor. Add a defense-in-depth check: the actor
-- must be an active admin_user with a coordinator role (staff/admin), matching
-- the route-layer requireCoordinator gate.
--
-- The actor value is the Supabase auth user id (admin.authUserId), so it is
-- matched against admin_user.auth_user_id. Note: has_admin_role() can't be used
-- here -- it reads auth.uid(), which is null under the service-role client.
--
-- create or replace keeps the bodies identical to
-- 20260626144836_adoption_coordinator_workflow_rpcs.sql except for the guard.

create or replace function public.change_adoption_case_status(
  p_case_id uuid,
  p_status_id uuid,
  p_actor_user_id uuid,
  p_note text,
  p_closed_at timestamptz
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1
    from public.admin_user
    where auth_user_id = p_actor_user_id
      and status = 'active'
      and role in ('staff', 'admin')
  ) then
    raise exception 'Actor % is not an active staff/admin user', p_actor_user_id
      using errcode = '42501';
  end if;

  update public.adoption_case
  set
    status_id = p_status_id,
    closed_at = p_closed_at
  where id = p_case_id;

  if not found then
    raise exception 'Adoption case not found';
  end if;

  insert into public.coordinator_status_history (
    entity_type,
    entity_id,
    status_id,
    actor_user_id,
    note
  ) values (
    'adoption_case',
    p_case_id,
    p_status_id,
    p_actor_user_id,
    p_note
  );

  insert into public.audit_log (
    actor_user_id,
    action,
    entity,
    entity_id,
    detail
  ) values (
    p_actor_user_id,
    'adoption_case.status_change',
    'adoption_case',
    p_case_id::text,
    jsonb_build_object(
      'statusId', p_status_id,
      'note', p_note
    )
  );
end;
$$;

create or replace function public.finalize_successful_adoption(
  p_adoption_case_id uuid,
  p_match_id uuid,
  p_outcome_status_id uuid,
  p_case_number text,
  p_adoption_fee_cents integer,
  p_approval_date date,
  p_pickup_date date,
  p_approved_by uuid
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_match record;
  v_case public.adoption_case%rowtype;
  v_outcome public.coordinator_status%rowtype;
  v_approved_status_id uuid;
  v_successful_adoption_id uuid;
begin
  if not exists (
    select 1
    from public.admin_user
    where auth_user_id = p_approved_by
      and status = 'active'
      and role in ('staff', 'admin')
  ) then
    raise exception 'Actor % is not an active staff/admin user', p_approved_by
      using errcode = '42501';
  end if;

  select
    animal_match.id,
    animal_match.animal_id,
    animal_match.is_approved,
    coordinator_status.key as status_key,
    coordinator_status.is_active as status_is_active,
    coordinator_status.is_final as status_is_final
  into v_match
  from public.animal_match
  join public.coordinator_status
    on coordinator_status.category = 'match'
   and coordinator_status.id = animal_match.status_id
  where animal_match.id = p_match_id
    and animal_match.adoption_case_id = p_adoption_case_id
  for update of animal_match;

  if not found then
    raise exception 'Match not found for adoption case';
  end if;

  if v_match.is_approved is not true
    or v_match.status_key <> 'approved'
    or v_match.status_is_active is not true
    or v_match.status_is_final is not true
  then
    raise exception 'Match must be approved before finalization';
  end if;

  select *
  into v_outcome
  from public.coordinator_status
  where id = p_outcome_status_id;

  if not found
    or v_outcome.category <> 'final_outcome'
    or v_outcome.is_active is not true
    or v_outcome.is_final is not true
    or v_outcome.key <> 'adopted'
  then
    raise exception 'Invalid successful adoption outcome status';
  end if;

  select *
  into v_case
  from public.adoption_case
  where id = p_adoption_case_id
  for update;

  if not found then
    raise exception 'Adoption case not found';
  end if;

  if v_case.supporter_id is null then
    raise exception 'Adoption case is missing supporter';
  end if;

  if v_case.adopter_profile_id is null then
    raise exception 'Adoption case is missing adopter profile';
  end if;

  select id
  into v_approved_status_id
  from public.coordinator_status
  where category = 'adoption_case'
    and key = 'approved';

  if not found then
    raise exception 'Approved adoption case status not found';
  end if;

  insert into public.successful_adoption (
    adoption_case_id,
    animal_id,
    supporter_id,
    adopter_profile_id,
    outcome_status_id,
    case_number,
    adoption_fee_cents,
    approval_date,
    pickup_date,
    approved_by
  ) values (
    p_adoption_case_id,
    v_match.animal_id,
    v_case.supporter_id,
    v_case.adopter_profile_id,
    p_outcome_status_id,
    p_case_number,
    p_adoption_fee_cents,
    p_approval_date,
    p_pickup_date,
    p_approved_by
  )
  returning id into v_successful_adoption_id;

  update public.animal_match
  set
    is_approved = true,
    updated_by = p_approved_by
  where id = p_match_id;

  update public.adoption_case
  set
    approved_animal_id = v_match.animal_id,
    status_id = v_approved_status_id,
    processed = true,
    closed_at = coalesce(closed_at, now())
  where id = p_adoption_case_id;

  insert into public.coordinator_status_history (
    entity_type,
    entity_id,
    status_id,
    actor_user_id,
    note
  ) values (
    'adoption_case',
    p_adoption_case_id,
    v_approved_status_id,
    p_approved_by,
    null
  );

  insert into public.audit_log (
    actor_user_id,
    action,
    entity,
    entity_id,
    detail
  ) values (
    p_approved_by,
    'successful_adoption.finalize',
    'adoption_case',
    p_adoption_case_id::text,
    jsonb_build_object(
      'successfulAdoptionId', v_successful_adoption_id,
      'animalId', v_match.animal_id,
      'matchId', p_match_id,
      'caseNumber', p_case_number
    )
  );

  return v_successful_adoption_id;
end;
$$;

revoke all on function public.change_adoption_case_status(uuid, uuid, uuid, text, timestamptz) from public;
grant execute on function public.change_adoption_case_status(uuid, uuid, uuid, text, timestamptz) to service_role;

revoke all on function public.finalize_successful_adoption(uuid, uuid, uuid, text, integer, date, date, uuid) from public;
grant execute on function public.finalize_successful_adoption(uuid, uuid, uuid, text, integer, date, date, uuid) to service_role;
