-- BUG-02: one animal could be finalised as adopted in two cases, and a closed case could
-- be finalised (and silently set back to approved).
--
-- finalize_successful_adoption checked only that the match was approved. Nothing stopped
-- a second case with an approved match for the same animal from finalising too
-- (successful_adoption.animal_id is indexed, not unique), giving two adoption records for
-- one animal that the reports and impact counts both include. It also never set the
-- animal to adopted, so the animal stayed matchable, and it accepted a case that had been
-- rejected, withdrawn or closed, overwriting that outcome with approved.
--
-- The function now, in the same transaction and with the animal row locked so two
-- finalisations cannot race past the check:
--   * refuses an animal that already has a successful adoption;
--   * refuses a case that already has one;
--   * refuses a case whose current status is closing and is not `approved` (approved is
--     itself a closing status, and moving a case to approved before finalising is the
--     normal workflow, so that stays allowed);
--   * sets the animal to adopted through update_animal_status_with_audit, which also
--     writes its audit row and keeps the animal's draft in step (BUG-01).
-- Refusals are plain-text exceptions, which the coordinator API maps to 409.
--
-- Signature, security definer, search_path and grants are unchanged.

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
  v_case_status public.coordinator_status%rowtype;
  v_outcome public.coordinator_status%rowtype;
  v_approved_status_id uuid;
  v_successful_adoption_id uuid;
  v_animal_status text;
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

  -- BUG-02: one adoption per animal and per case, and never over a closed outcome.
  select status
  into v_animal_status
  from public.animals
  where id = v_match.animal_id
  for update;

  if not found then
    raise exception 'Approved match has no animal';
  end if;

  if exists (
    select 1 from public.successful_adoption where animal_id = v_match.animal_id
  ) then
    raise exception 'Animal already has a successful adoption';
  end if;

  if exists (
    select 1 from public.successful_adoption where adoption_case_id = p_adoption_case_id
  ) then
    raise exception 'Adoption case already finalized';
  end if;

  select *
  into v_case_status
  from public.coordinator_status
  where id = v_case.status_id;

  if found and v_case_status.is_closing and v_case_status.key <> 'approved' then
    raise exception 'Adoption case is closed';
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

  -- The adopted animal leaves the matchable pool and the public listing. Going through the
  -- status RPC writes its own animals.update audit row and keeps the draft in step (BUG-01).
  if v_animal_status is distinct from 'adopted' then
    perform public.update_animal_status_with_audit(
      p_approved_by, v_match.animal_id, 'adopted', now()
    );
  end if;

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
      'caseNumber', p_case_number,
      'animalStatusFrom', v_animal_status
    )
  );

  return v_successful_adoption_id;
end;
$$;

-- Unchanged from 20260913092132: server-authenticated actors only.
revoke execute on function public.finalize_successful_adoption(uuid, uuid, uuid, text, integer, date, date, uuid)
  from public, anon, authenticated;
grant execute on function public.finalize_successful_adoption(uuid, uuid, uuid, text, integer, date, date, uuid)
  to service_role;
