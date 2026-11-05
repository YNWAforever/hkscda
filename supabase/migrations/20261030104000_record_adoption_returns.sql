-- BUG-33: a returned animal could never be adopted again (regression from BUG-02).
--
-- finalize_successful_adoption (BUG-02) refuses an animal that has any successful_adoption
-- row, and nothing ended such a row, so an animal that came back and was set to available
-- could be matched and approved on a new case but never finalised: 409 for good.
--
-- Decision: record the return. This migration:
--   * adds returned_at, returned_by and return_reason to public.successful_adoption
--     (nullable; all three set together, and a returned row needs a non-blank reason);
--   * adds public.record_adoption_return_with_audit, which, for an active staff/admin actor
--     and with the adoption row, the animal's draft and the animal locked (draft before
--     animal, the order publication and the status RPC use), refuses an unknown adoption
--     (P0002), an adoption already returned ('Adoption already returned') and a blank reason
--     ('reason_required'); records the return; sets an animal still 'adopted' back to
--     'available' through update_animal_status_with_audit (which audits and syncs the draft,
--     BUG-01); and writes a 'successful_adoption.return' audit_log row, all in one
--     transaction. security definer, search_path = public, pg_temp, service_role only;
--   * redefines finalize_successful_adoption from 20261030101000 (BUG-36) so the per-animal
--     refusal counts only unreturned adoptions. The one-adoption-per-case guard, the
--     closed-case guard, the locks and everything else are unchanged.
--
-- No unique index on (animal_id) where returned_at is null: rows written before BUG-02
-- (20261029160000) may hold two adoptions for one animal, and such an index would fail on
-- them. The animal row lock in finalize keeps new duplicates out.
--
-- The case of a returned adoption stays closed and finalised: change_adoption_case_status
-- still refuses it (BUG-34). Adoption counts in reports are unchanged.

alter table public.successful_adoption
  add column if not exists returned_at timestamptz,
  add column if not exists returned_by uuid,
  add column if not exists return_reason text;

alter table public.successful_adoption
  drop constraint if exists successful_adoption_return_recorded_check;

alter table public.successful_adoption
  add constraint successful_adoption_return_recorded_check check (
    (returned_at is null and returned_by is null and return_reason is null)
    or (
      returned_at is not null
      and returned_by is not null
      and btrim(return_reason) <> ''
    )
  );

create or replace function public.record_adoption_return_with_audit(
  p_actor uuid,
  p_successful_adoption_id uuid,
  p_reason text,
  p_returned_at timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_adoption public.successful_adoption%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_animal_status text;
  v_returned_at timestamptz := coalesce(p_returned_at, now());
begin
  if not exists (
    select 1
    from public.admin_user
    where auth_user_id = p_actor
      and status = 'active'
      and role in ('staff', 'admin')
  ) then
    raise exception 'Actor % is not an active staff/admin user', p_actor
      using errcode = '42501';
  end if;

  if v_reason = '' then
    raise exception 'reason_required';
  end if;

  select *
  into v_adoption
  from public.successful_adoption
  where id = p_successful_adoption_id
  for update;

  if not found then
    raise exception 'Successful adoption not found' using errcode = 'P0002';
  end if;

  if v_adoption.returned_at is not null then
    raise exception 'Adoption already returned';
  end if;

  -- Draft before animal, as publication, the status RPC and finalize lock them.
  perform 1
  from public.animal_draft
  where id = v_adoption.animal_id
  for update;

  select status
  into v_animal_status
  from public.animals
  where id = v_adoption.animal_id
  for update;

  update public.successful_adoption
  set
    returned_at = v_returned_at,
    returned_by = p_actor,
    return_reason = v_reason
  where id = p_successful_adoption_id;

  -- The animal can be matched and adopted again. Only an animal still marked adopted moves;
  -- staff may already have set it to fostered or available.
  if v_animal_status = 'adopted' then
    perform public.update_animal_status_with_audit(
      p_actor, v_adoption.animal_id, 'available', now()
    );
  end if;

  insert into public.audit_log (
    actor_user_id,
    action,
    entity,
    entity_id,
    detail
  ) values (
    p_actor,
    'successful_adoption.return',
    'adoption_case',
    v_adoption.adoption_case_id::text,
    jsonb_build_object(
      'successfulAdoptionId', v_adoption.id,
      'animalId', v_adoption.animal_id,
      'caseNumber', v_adoption.case_number,
      'returnedAt', v_returned_at,
      'reason', v_reason,
      'animalStatusFrom', v_animal_status
    )
  );

  return jsonb_build_object('id', v_adoption.id, 'returnedAt', v_returned_at);
end;
$$;

revoke all on function public.record_adoption_return_with_audit(uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.record_adoption_return_with_audit(uuid, uuid, text, timestamptz)
  to service_role;

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
  -- Publication and the status RPC lock draft, then animal. Taking animals first
  -- here would deadlock when the status RPC waits for a concurrently publishing draft.
  perform 1
  from public.animal_draft
  where id = v_match.animal_id
  for update;

  select status
  into v_animal_status
  from public.animals
  where id = v_match.animal_id
  for update;

  if not found then
    raise exception 'Approved match has no animal';
  end if;

  -- BUG-33: only a current (unreturned) adoption blocks finalising the animal again.
  if exists (
    select 1 from public.successful_adoption
    where animal_id = v_match.animal_id and returned_at is null
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

  -- BUG-36: a finalised case's intake items leave the open inbox (same rule as closing).
  update public.adoption_intake_item
  set resolved_at = now()
  where resolved_at is null
    and (
      adoption_case_id = p_adoption_case_id
      or public_application_id = v_case.public_application_id
    );

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

-- Unchanged: server-authenticated actors only.
revoke execute on function public.finalize_successful_adoption(uuid, uuid, uuid, text, integer, date, date, uuid)
  from public, anon, authenticated;
grant execute on function public.finalize_successful_adoption(uuid, uuid, uuid, text, integer, date, date, uuid)
  to service_role;
