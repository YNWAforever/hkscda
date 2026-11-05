-- BUG-36: the intake inbox never emptied.
--
-- adoption_intake_item.resolved_at is what the inbox's default "open only" filter reads,
-- but nothing ever set it, so every application stayed in the open inbox after its case
-- was closed or finalised.
--
-- An intake item belongs to a case through adoption_intake_item.adoption_case_id, which the
-- public submission writes after creating the case (20260701185227; submission.server.ts).
-- That link step can fail and is only logged, so an item is also matched through the case's
-- public_application_id (adoption_case.public_application_id = item.public_application_id,
-- both unique).
--
-- This migration:
--   * redefines change_adoption_case_status (from 20261030100000, BUG-34) to set resolved_at
--     on the case's open items when the new status is closing;
--   * redefines finalize_successful_adoption (from 20261029160000, BUG-02) to set it when a
--     case is finalised. Every BUG-02 guard and everything else is unchanged;
--   * BACKFILL: sets resolved_at on existing open items whose case is already in a closing
--     status or already has a successful_adoption, using the case's closed_at (or now()).
-- A reopened case's items stay resolved: reopening is done from the case screen, not the
-- inbox. Signatures, security definer, search_path and grants are unchanged.

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
declare
  v_status public.coordinator_status%rowtype;
  v_case public.adoption_case%rowtype;
  v_current public.coordinator_status%rowtype;
begin
  perform 1
  from public.admin_user
  where auth_user_id = p_actor_user_id
    and status = 'active'
    and role in ('staff', 'admin')
  for share;
  if not found then
    raise exception 'Actor % is not an active staff/admin user', p_actor_user_id
      using errcode = '42501';
  end if;

  select * into v_status
  from public.coordinator_status
  where id = p_status_id
    and category = 'adoption_case'
    and is_active
  for share;
  if not found then
    raise exception 'Invalid or inactive adoption case status'
      using errcode = '22023';
  end if;

  -- BUG-34: lock the case, then refuse a finalised case and an unexplained reopen.
  select * into v_case
  from public.adoption_case
  where id = p_case_id
  for update;
  if not found then
    raise exception 'Adoption case not found' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.successful_adoption where adoption_case_id = p_case_id
  ) then
    raise exception 'Finalized adoption case status cannot change';
  end if;

  select * into v_current
  from public.coordinator_status
  where id = v_case.status_id;
  if found
    and v_current.is_closing
    and not v_status.is_closing
    and btrim(coalesce(p_note, '')) = ''
  then
    raise exception 'reason_required';
  end if;

  update public.adoption_case
  set status_id = p_status_id,
      closed_at = case
        when v_status.is_closing then coalesce(p_closed_at, clock_timestamp())
        else null
      end
  where id = p_case_id;
  if not found then
    raise exception 'Adoption case not found' using errcode = 'P0002';
  end if;

  -- BUG-36: a closed case's intake items leave the open inbox. An item is the case's when it
  -- links the case, or (when its link step failed) carries the case's public application.
  if v_status.is_closing then
    update public.adoption_intake_item
    set resolved_at = clock_timestamp()
    where resolved_at is null
      and (
        adoption_case_id = p_case_id
        or public_application_id = v_case.public_application_id
      );
  end if;

  insert into public.coordinator_status_history (
    entity_type, entity_id, status_id, actor_user_id, note
  ) values (
    'adoption_case', p_case_id, p_status_id, p_actor_user_id, p_note
  );

  insert into public.audit_log (
    actor_user_id, action, entity, entity_id, detail
  ) values (
    p_actor_user_id,
    'adoption_case.status_change',
    'adoption_case',
    p_case_id::text,
    jsonb_build_object('statusId', p_status_id, 'note', p_note)
  );
end;
$$;

revoke all on function public.change_adoption_case_status(uuid,uuid,uuid,text,timestamptz)
  from public, anon, authenticated;
grant execute on function public.change_adoption_case_status(uuid,uuid,uuid,text,timestamptz)
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

-- BACKFILL (BUG-36): resolve the open items of cases that are already closed or finalised.
update public.adoption_intake_item as item
set resolved_at = coalesce(adoption_case.closed_at, now())
from public.adoption_case
left join public.coordinator_status
  on coordinator_status.id = adoption_case.status_id
where item.resolved_at is null
  and (
    item.adoption_case_id = adoption_case.id
    or item.public_application_id = adoption_case.public_application_id
  )
  and (
    coordinator_status.is_closing
    or exists (
      select 1
      from public.successful_adoption
      where successful_adoption.adoption_case_id = adoption_case.id
    )
  );
