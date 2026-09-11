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
  started_on date not null default current_date,
  ended_on date,
  end_reason text,
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
