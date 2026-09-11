-- Confirmed supporter-animal relationships.
--
-- Phase 3 §6.2 separates a pledge (an intention), a period (one month's
-- commitment), a payment (money that moved) and an ASSIGNMENT (a confirmed
-- supporter-animal relationship). The first three exist. This adds the fourth.
--
-- sponsorship_preference is only a wish: ranked 1-10, written once at
-- submission, never mutated by any RPC. Nothing recorded that the association
-- agreed to it, so "two sponsors for the same animal" could not be shown.
--
-- The money model is UNCHANGED. A pledge's monthly amount is not divided per
-- animal, so sponsorship_period and sponsorship_payment_allocation are
-- untouched and an assignment carries no amount. It is a relationship, not a
-- second set of books.
--
-- Additive and reversible: no existing row is modified.

create table if not exists public.sponsorship_assignment (
  id uuid primary key default gen_random_uuid(),
  pledge_id uuid not null references public.sponsorship_pledge(id) on delete cascade,
  -- Animals are retired via retired_at, never deleted, so `set null` is a
  -- safety net rather than a live path. The snapshot below is what makes
  -- history survive it.
  animal_id uuid references public.animals(id) on delete set null,
  animal_name_snapshot text not null,
  -- The association operates in Hong Kong; the database runs in UTC. A UTC
  -- date mis-stamps early-morning work as the previous day (anything before
  -- 08:00 local) and shifts month-boundary reporting, so take the date from
  -- Hong Kong -- which is also the zone src/ renders dates in.
  started_on date not null default (now() at time zone 'Asia/Hong_Kong')::date,
  ended_on date,
  end_reason text,
  -- Why the relationship ENDED, kept apart from `note` (why it began). Two
  -- notes written by two people at two moments belong in two columns.
  end_note text,
  note text,
  created_by uuid references public.admin_user(id),
  ended_by uuid references public.admin_user(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sponsorship_assignment_ends_after_start
    check (ended_on is null or ended_on >= started_on),
  -- A reason is recorded exactly when the relationship ends: an ended
  -- assignment with no reason, or a reason on an open one, are both nonsense.
  constraint sponsorship_assignment_reason_with_end
    check ((ended_on is null) = (end_reason is null)),
  constraint sponsorship_assignment_end_reason_known
    check (end_reason is null or end_reason in (
      'adopted', 'deceased', 'ineligible', 'retired',
      'supporter_request', 'transferred', 'other'
    ))
);

-- One OPEN assignment per supporter per animal. Deliberately NOT unique on
-- animal_id alone: the plan forbids treating an animal as inventory that
-- permits only one sponsor, and §6.4 requires two sponsors on one animal.
create unique index if not exists sponsorship_assignment_one_open_per_animal
  on public.sponsorship_assignment (pledge_id, animal_id)
  where ended_on is null;

create index if not exists sponsorship_assignment_pledge_open_idx
  on public.sponsorship_assignment (pledge_id)
  where ended_on is null;

-- The review scan joins from the animal side; nothing indexed that before.
create index if not exists sponsorship_assignment_animal_open_idx
  on public.sponsorship_assignment (animal_id)
  where ended_on is null;

do $$
begin
  execute 'drop trigger if exists set_updated_at on public.sponsorship_assignment';
  execute 'create trigger set_updated_at before update on public.sponsorship_assignment '
       || 'for each row execute function public.set_updated_at()';
end;
$$;

alter table public.sponsorship_assignment enable row level security;

-- Staff data. Treasurer reads, consistent with the ledger tables and with
-- §6.3's note that treasurers read payments but do not review sponsorship.
-- Nothing is exposed to the public status page: its token cannot be revoked or
-- re-issued, and end_reason carries values like 'deceased', which must reach a
-- supporter from a person rather than from a web page.
drop policy if exists "staff can read sponsorship assignments" on public.sponsorship_assignment;
create policy "staff can read sponsorship assignments"
  on public.sponsorship_assignment for select
  to authenticated
  using (private.has_admin_role(array['staff', 'admin', 'treasurer']));

grant select on public.sponsorship_assignment to authenticated;
revoke all on public.sponsorship_assignment from anon;

-- Hygiene: 20260911190000 gave these two tables RLS and an authenticated grant
-- but omitted the anon revoke. Latent today because RLS default-denies with no
-- anon policy, but it leaves them one accidental policy away from exposure.
revoke all on public.sponsorship_period from anon;
revoke all on public.sponsorship_payment_allocation from anon;

comment on table public.sponsorship_assignment is
  'A confirmed supporter-animal relationship for a span of time. Carries no amount: '
  'the pledge''s monthly commitment is not divided per animal.';

-- Confirms one animal for a pledge.
--
-- The caller decides WHICH animal (src/lib/sponsorshipAdmin/autoAssign.ts);
-- this re-checks that the choice is still valid and refuses otherwise, so a
-- stale plan or a hand-built call cannot confirm a relationship against an
-- animal that has been adopted, has died, or has been withdrawn from the
-- programme. Same defence-in-depth as the allocation planner and its triggers.
create or replace function public.assign_sponsorship_animal_with_audit(
  p_pledge_id uuid,
  p_animal_id uuid,
  p_actor_user_id uuid,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_actor_admin_id uuid;
  v_pledge public.sponsorship_pledge%rowtype;
  v_animal public.animals%rowtype;
  v_deceased_at date;
  v_assignment_id uuid;
begin
  select id into v_actor_admin_id
  from public.admin_user
  where auth_user_id = p_actor_user_id
    and status = 'active'
    and role in ('staff', 'admin');
  if v_actor_admin_id is null then
    raise exception 'Actor % is not an active staff/admin user', p_actor_user_id
      using errcode = '42501';
  end if;

  select * into v_pledge
  from public.sponsorship_pledge
  where id = p_pledge_id
  for update;
  if not found then
    raise exception 'Sponsorship pledge not found';
  end if;

  if v_pledge.status = 'cancelled' then
    raise exception 'Sponsorship pledge is already cancelled';
  end if;

  select * into v_animal from public.animals where id = p_animal_id;
  if not found then
    raise exception 'Animal not found';
  end if;

  -- Death is recorded on a different table by a different form; animals.status
  -- has no 'deceased' value. A missing profile row means nothing was recorded,
  -- not that the animal died, so this must not become an inner join.
  select deceased_at into v_deceased_at
  from public.animal_profile_internal
  where animal_id = p_animal_id;

  if not v_animal.sponsorship_eligible
     or v_animal.status = 'adopted'
     or v_animal.retired_at is not null
     or v_animal.publication_state <> 'published'
     or v_deceased_at is not null then
    raise exception 'Animal % cannot be sponsored', p_animal_id;
  end if;

  insert into public.sponsorship_assignment (
    pledge_id, animal_id, animal_name_snapshot, note, created_by
  ) values (
    p_pledge_id, p_animal_id, v_animal.name, p_note, v_actor_admin_id
  )
  returning id into v_assignment_id;

  insert into public.audit_log (actor_user_id, action, entity, entity_id, detail)
  values (
    p_actor_user_id,
    'sponsorship_pledge.animal_assigned',
    'sponsorship_pledge',
    p_pledge_id::text,
    jsonb_build_object(
      'assignmentId', v_assignment_id,
      'animalId', p_animal_id,
      'animalName', v_animal.name,
      'note', p_note
    )
  );

  return v_assignment_id;
end;
$fn$;

revoke all on function public.assign_sponsorship_animal_with_audit(uuid, uuid, uuid, text) from public;
revoke all on function public.assign_sponsorship_animal_with_audit(uuid, uuid, uuid, text) from anon;
revoke all on function public.assign_sponsorship_animal_with_audit(uuid, uuid, uuid, text) from authenticated;
grant execute on function public.assign_sponsorship_animal_with_audit(uuid, uuid, uuid, text) to service_role;

-- Ends one assignment. Always a staff decision: there is deliberately no
-- trigger that ends assignments when an animal leaves, because the money keeps
-- arriving and a person must decide what happens to it. A derived query
-- surfaces the ones that need that conversation.
create or replace function public.end_sponsorship_assignment_with_audit(
  p_assignment_id uuid,
  p_actor_user_id uuid,
  p_reason text,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_actor_admin_id uuid;
  v_assignment public.sponsorship_assignment%rowtype;
begin
  select id into v_actor_admin_id
  from public.admin_user
  where auth_user_id = p_actor_user_id
    and status = 'active'
    and role in ('staff', 'admin');
  if v_actor_admin_id is null then
    raise exception 'Actor % is not an active staff/admin user', p_actor_user_id
      using errcode = '42501';
  end if;

  if p_reason is null or p_reason not in (
    'adopted', 'deceased', 'ineligible', 'retired',
    'supporter_request', 'transferred', 'other'
  ) then
    raise exception 'Invalid end reason %', p_reason;
  end if;

  select * into v_assignment
  from public.sponsorship_assignment
  where id = p_assignment_id
  for update;
  if not found then
    raise exception 'Sponsorship assignment not found';
  end if;

  if v_assignment.ended_on is not null then
    raise exception 'Sponsorship assignment is already ended';
  end if;

  update public.sponsorship_assignment
  set ended_on = (now() at time zone 'Asia/Hong_Kong')::date,
      end_reason = p_reason,
      ended_by = v_actor_admin_id,
      end_note = p_note
  where id = p_assignment_id;

  insert into public.audit_log (actor_user_id, action, entity, entity_id, detail)
  values (
    p_actor_user_id,
    'sponsorship_pledge.animal_assignment_ended',
    'sponsorship_pledge',
    v_assignment.pledge_id::text,
    jsonb_build_object(
      'assignmentId', p_assignment_id,
      'animalId', v_assignment.animal_id,
      'reason', p_reason,
      'note', p_note
    )
  );
end;
$fn$;

revoke all on function public.end_sponsorship_assignment_with_audit(uuid, uuid, text, text) from public;
revoke all on function public.end_sponsorship_assignment_with_audit(uuid, uuid, text, text) from anon;
revoke all on function public.end_sponsorship_assignment_with_audit(uuid, uuid, text, text) from authenticated;
grant execute on function public.end_sponsorship_assignment_with_audit(uuid, uuid, text, text) to service_role;

-- Approving a payment now also confirms the supporter's animal, in the same
-- transaction that approves and allocates it.
--
-- Three changes from the 20260911190000 definition, and nothing else:
--   1. a sixth parameter, p_assign_animal_id, defaulted so existing calls work;
--   2. v_actor_admin_id is now resolved once, unconditionally, instead of
--      inside the allocation branch -- not a bug fix (its only consumer,
--      private.apply_sponsorship_allocations, is called from inside that same
--      branch, so the value was never read before it was set); just tidying,
--      so it is available regardless of which branch runs;
--   3. an auto-assign step, which runs only when the pledge has no assignment
--      rows at all.
--
-- The drop is unavoidable: Postgres cannot disambiguate a five-argument call
-- between the old function and a defaulted six-argument one, so both cannot
-- coexist.
drop function if exists public.review_sponsorship_payment_proof(uuid, text, uuid, text, jsonb);

create or replace function public.review_sponsorship_payment_proof(
  p_pledge_id uuid,
  p_decision text,
  p_actor_user_id uuid,
  p_note text,
  p_allocations jsonb default '[]'::jsonb,
  p_assign_animal_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_pledge public.sponsorship_pledge%rowtype;
  v_proof public.sponsorship_payment_proof%rowtype;
  v_new_pledge_status text;
  v_new_review_status text;
  v_actor_admin_id uuid;
  v_allocation jsonb := null;
  v_assignment_id uuid := null;
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

  -- Deliberately no pledge-status gate here. The thing being reviewed is the
  -- proof, and the check that it is pending (below) is the real precondition.
  -- Requiring status='provisional' conflated the supporter's commitment with the
  -- review queue -- exactly what the plan says not to do -- and made a second
  -- month's payment unreviewable.

  -- The OLDEST proof still awaiting review, not the newest row overall.
  --
  -- Asking "is the newest proof pending?" worked only while a pledge could
  -- hold one proof. Now that a running sponsorship accumulates one per month,
  -- that question strands rows: an older pending proof can never become the
  -- newest again, so no future review would ever reach it and a recorded
  -- payment would sit unreviewed with no way to act on it. Two pending proofs
  -- are reachable in ordinary use precisely because recording a payment on an
  -- active pledge now leaves it active, so a second can be recorded while a
  -- first is still queued.
  --
  -- `created_at` alone is not a total order -- two proofs written in one
  -- transaction share now() -- so `id` breaks the tie deterministically. The
  -- matching rule in application code is src/lib/sponsorshipAdmin/proofReview.ts
  -- (`selectReviewTargetProof`); the two must agree, or staff approve one
  -- payment while looking at another document.
  select *
  into v_proof
  from public.sponsorship_payment_proof
  where pledge_id = p_pledge_id
    and review_status = 'pending'
  order by created_at asc, id asc
  limit 1
  for update;

  if not found then
    raise exception 'Sponsorship pledge has no proof pending review';
  end if;

  if p_decision = 'approve' then
    v_new_review_status := 'approved';
    v_new_pledge_status := 'active';
  else
    v_new_review_status := 'rejected';
    -- 'needs_followup' is reachable from both directions and still permits a
    -- corrected proof, so a rejected month flags staff follow-up without
    -- cancelling a sponsorship whose earlier months were paid.
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

  -- CHANGE 2: resolve the actor's admin id once, unconditionally, rather than
  -- inside the allocation branch below where the 20260911190000 definition
  -- resolved it. Not a bug fix -- its only consumer sits inside that same
  -- branch, so the value was never read before it was set -- just tidying, so
  -- it no longer depends on which branch runs.
  select id into v_actor_admin_id
  from public.admin_user
  where auth_user_id = p_actor_user_id;

  -- Attribute the verified payment to months in the SAME transaction that
  -- approves it. Two transactions would leave a window in which money is
  -- approved but attributed to no month, and a crash inside that window would
  -- make it permanent; section 3.1 puts financial consistency in the database
  -- transaction. If any allocation violates an invariant, the approval rolls
  -- back with it and the caller retries -- nothing is half-applied.
  --
  -- A rejected proof allocates nothing: money that was refused was never
  -- received.
  if p_decision = 'approve' and p_allocations is not null
     and jsonb_array_length(p_allocations) > 0 then
    v_allocation := private.apply_sponsorship_allocations(
      v_proof.id, v_actor_admin_id, p_allocations
    );
  end if;

  -- CHANGE 3: confirm the supporter's animal on the FIRST approval only.
  -- "First" means the pledge has never had an assignment -- not that it has
  -- none open now. A supporter whose animal was adopted, and whose assignment
  -- staff ended, must be given a new animal by a person rather than silently
  -- by the next payment.
  --
  -- If the animal the caller chose has become ineligible since they chose it,
  -- assign_sponsorship_animal_with_audit raises and the ENTIRE approval rolls
  -- back -- deliberately: approving the payment while silently skipping the
  -- assignment would leave a paying supporter with no animal and no signal
  -- that anything went wrong. The caller re-reads state on retry and picks
  -- the next eligible choice.
  if p_decision = 'approve' and p_assign_animal_id is not null
     and not exists (
       select 1 from public.sponsorship_assignment where pledge_id = p_pledge_id
     ) then
    v_assignment_id := public.assign_sponsorship_animal_with_audit(
      p_pledge_id, p_assign_animal_id, p_actor_user_id, null
    );
  end if;

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
      'note', p_note,
      'allocation', v_allocation,
      'assignmentId', v_assignment_id
    )
  );
end;
$fn$;

revoke all on function public.review_sponsorship_payment_proof(uuid, text, uuid, text, jsonb, uuid) from public;
revoke all on function public.review_sponsorship_payment_proof(uuid, text, uuid, text, jsonb, uuid) from anon;
revoke all on function public.review_sponsorship_payment_proof(uuid, text, uuid, text, jsonb, uuid) from authenticated;
grant execute on function public.review_sponsorship_payment_proof(uuid, text, uuid, text, jsonb, uuid) to service_role;
