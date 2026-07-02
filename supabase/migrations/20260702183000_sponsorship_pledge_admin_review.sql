-- Slice C: sponsorship pledge admin review.
--
-- 1. Relax sponsorship_payment_proof.pledge_id from a unique constraint to a
--    plain index so proof rows can accumulate as history (staff attach a
--    corrected proof after a needs_followup rejection). The most recent row
--    (created_at desc) is "current" for review purposes.
-- 2. Add reviewer-attribution columns and a source flag distinguishing a
--    sponsor's own upload ('public') from a staff-recorded payment ('staff').
-- 3. Add the 3 admin-review RPCs, copying the exact security-definer +
--    admin_user actor-validation + audit_log + revoke/grant template from
--    20260628160000_validate_rpc_actor.sql.

alter table public.sponsorship_payment_proof drop constraint if exists sponsorship_payment_proof_pledge_id_key;

create index if not exists sponsorship_payment_proof_pledge_idx on public.sponsorship_payment_proof (pledge_id);

alter table public.sponsorship_payment_proof
  add column if not exists reviewed_by uuid references public.admin_user(id),
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_note text,
  add column if not exists source text not null default 'public' check (source in ('public', 'staff'));

create or replace function public.record_sponsorship_payment_proof(
  p_pledge_id uuid,
  p_actor_user_id uuid,
  p_storage_path text,
  p_file_name text,
  p_file_type text,
  p_file_size integer,
  p_payment_method text,
  p_reference text,
  p_amount_cents integer,
  p_payment_date date,
  p_note text
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pledge public.sponsorship_pledge%rowtype;
  v_proof_id uuid;
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

  select *
  into v_pledge
  from public.sponsorship_pledge
  where id = p_pledge_id
  for update;

  if not found then
    raise exception 'Sponsorship pledge not found';
  end if;

  if v_pledge.status not in ('pending_payment', 'needs_followup') then
    raise exception 'Sponsorship pledge is not eligible for a recorded payment';
  end if;

  insert into public.sponsorship_payment_proof (
    pledge_id,
    storage_path,
    file_name,
    file_type,
    file_size,
    payment_method,
    reference,
    amount_cents,
    payment_date,
    review_status,
    source
  ) values (
    p_pledge_id,
    p_storage_path,
    p_file_name,
    p_file_type,
    p_file_size,
    p_payment_method,
    p_reference,
    p_amount_cents,
    p_payment_date,
    'pending',
    'staff'
  )
  returning id into v_proof_id;

  update public.sponsorship_pledge
  set status = 'provisional'
  where id = p_pledge_id;

  insert into public.audit_log (
    actor_user_id,
    action,
    entity,
    entity_id,
    detail
  ) values (
    p_actor_user_id,
    'sponsorship_pledge.proof_recorded',
    'sponsorship_pledge',
    p_pledge_id::text,
    jsonb_build_object(
      'proofId', v_proof_id,
      'paymentMethod', p_payment_method,
      'amountCents', p_amount_cents,
      'note', p_note
    )
  );

  return v_proof_id;
end;
$$;

create or replace function public.review_sponsorship_payment_proof(
  p_pledge_id uuid,
  p_decision text,
  p_actor_user_id uuid,
  p_note text
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pledge public.sponsorship_pledge%rowtype;
  v_proof public.sponsorship_payment_proof%rowtype;
  v_new_pledge_status text;
  v_new_review_status text;
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

  if p_decision not in ('approve', 'reject') then
    raise exception 'Invalid review decision %', p_decision;
  end if;

  select *
  into v_pledge
  from public.sponsorship_pledge
  where id = p_pledge_id
  for update;

  if not found then
    raise exception 'Sponsorship pledge not found';
  end if;

  if v_pledge.status <> 'provisional' then
    raise exception 'Sponsorship pledge is not awaiting review';
  end if;

  select *
  into v_proof
  from public.sponsorship_payment_proof
  where pledge_id = p_pledge_id
  order by created_at desc
  limit 1
  for update;

  if not found or v_proof.review_status <> 'pending' then
    raise exception 'Sponsorship pledge has no proof pending review';
  end if;

  if p_decision = 'approve' then
    v_new_review_status := 'approved';
    v_new_pledge_status := 'active';
  else
    v_new_review_status := 'rejected';
    v_new_pledge_status := 'needs_followup';
  end if;

  update public.sponsorship_payment_proof
  set
    review_status = v_new_review_status,
    reviewed_by = (select id from public.admin_user where auth_user_id = p_actor_user_id),
    reviewed_at = now(),
    review_note = p_note
  where id = v_proof.id;

  update public.sponsorship_pledge
  set status = v_new_pledge_status
  where id = p_pledge_id;

  insert into public.audit_log (
    actor_user_id,
    action,
    entity,
    entity_id,
    detail
  ) values (
    p_actor_user_id,
    'sponsorship_pledge.proof_reviewed',
    'sponsorship_pledge',
    p_pledge_id::text,
    jsonb_build_object(
      'proofId', v_proof.id,
      'decision', p_decision,
      'note', p_note
    )
  );
end;
$$;

create or replace function public.cancel_sponsorship_pledge(
  p_pledge_id uuid,
  p_actor_user_id uuid,
  p_note text
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pledge public.sponsorship_pledge%rowtype;
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

  select *
  into v_pledge
  from public.sponsorship_pledge
  where id = p_pledge_id
  for update;

  if not found then
    raise exception 'Sponsorship pledge not found';
  end if;

  if v_pledge.status = 'cancelled' then
    raise exception 'Sponsorship pledge is already cancelled';
  end if;

  update public.sponsorship_pledge
  set status = 'cancelled'
  where id = p_pledge_id;

  insert into public.audit_log (
    actor_user_id,
    action,
    entity,
    entity_id,
    detail
  ) values (
    p_actor_user_id,
    'sponsorship_pledge.cancelled',
    'sponsorship_pledge',
    p_pledge_id::text,
    jsonb_build_object('note', p_note)
  );
end;
$$;

revoke all on function public.record_sponsorship_payment_proof(uuid, uuid, text, text, text, integer, text, text, integer, date, text) from public;
grant execute on function public.record_sponsorship_payment_proof(uuid, uuid, text, text, text, integer, text, text, integer, date, text) to service_role;

revoke all on function public.review_sponsorship_payment_proof(uuid, text, uuid, text) from public;
grant execute on function public.review_sponsorship_payment_proof(uuid, text, uuid, text) to service_role;

revoke all on function public.cancel_sponsorship_pledge(uuid, uuid, text) from public;
grant execute on function public.cancel_sponsorship_pledge(uuid, uuid, text) to service_role;
