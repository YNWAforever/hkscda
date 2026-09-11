# Sponsorship Assignments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record which animals a supporter is confirmed to sponsor, so a pledge's money has a relationship to point at and §6.4's "two sponsors for the same animal" can be demonstrated.

**Architecture:** A new `sponsorship_assignment` table holds date-ranged supporter↔animal relationships. The rule for *which* animal is auto-assigned lives in a pure TypeScript function; the database re-validates it and enforces every invariant. Auto-assignment happens inside `review_sponsorship_payment_proof`, the same transaction that already approves a payment and allocates it to months. Ending is always a manual staff action; a derived query flags assignments whose animal has left.

**Tech Stack:** TypeScript 5 (strict, zero `any`), TanStack Start, Supabase Postgres with RLS, Bun + `bun:test`, zod.

**Spec:** `docs/superpowers/specs/2026-09-12-sponsorship-assignments-design.md`

---

## Reconciliation with the spec

The spec places the selection predicate in SQL. The immediately-preceding slice
(the monthly ledger) established the opposite convention and it is the better
one: **TypeScript plans, SQL validates.** `planPaymentAllocation` computes the
allocation in the service and passes it into the RPC, which enforces the
invariants independently.

This plan follows that precedent. `selectAutoAssignAnimal` decides which animal;
the RPC receives that animal's id and re-checks eligibility before inserting.
The predicate therefore exists twice on purpose — once as a testable rule, once
as a guard that cannot be bypassed — exactly as the allocation planner and the
allocation triggers do.

## Environment

Every command runs from `C:\Users\laich\Documents\HKCSDA\HKCSDA\hkscda`
(note the doubled path segment). Branch: `feat/hkscda-phase3-sponsorship`.

**The local Supabase stack is the only rehearsal target.** `.env.local` points at
production; never run a migration or seed against it. Start the stack with
`bunx supabase start` if it is not running (API `127.0.0.1:55321`, DB
`127.0.0.1:55322`).

**This worktree is shared with other sessions.** Other files will be modified by
someone else. Always `git add` by explicit path — never `git add -A` or `git add .`.

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/sponsorshipAdmin/autoAssign.ts` | **New.** Pure rule: given preferences and their animals' state, which one is assignable, and which wins. |
| `src/lib/sponsorshipAdmin/autoAssign.test.ts` | **New.** Tests for that rule. |
| `supabase/migrations/20260912120000_sponsorship_assignments.sql` | **New.** Table, constraints, indexes, RLS, grants, two RPCs, the auto-assign step in the review RPC, and two hygiene fixes. |
| `src/lib/sponsorshipAdmin/types.ts` | Add `SponsorshipAssignmentRecord`, `AssignmentEndReason`; add required `assignments` to `PledgeDetail`. |
| `src/lib/sponsorshipAdmin/repository.server.ts` | Read assignments and preference-animal state; two new RPC-calling methods. |
| `src/lib/sponsorshipAdmin/service.ts` | Validation, the auto-assign plan, the attention signal, two new service methods. |
| `src/lib/sponsorshipAdmin/schemas.ts` | Two zod schemas. |
| `src/lib/sponsorshipAdmin/http.server.ts` | Two handlers; new domain-error strings. |
| `src/routes/api/admin/sponsorships/pledges/$id/assignments.ts` | **New.** POST — assign an animal. |
| `src/routes/api/admin/sponsorships/pledges/$id/assignments/$assignmentId/end.ts` | **New.** POST — end an assignment. |
| `src/components/admin/adminPageCopy.ts` | Copy strings, `zh` **and** `en`. |
| `src/components/admin/sponsorship/PledgeDetailDrawer.tsx` | The assignments section. |
| `supabase/rls-tests/sponsorshipAssignment.rls.test.ts` | **New.** Anon denied, staff can read, no client writes. |
| `docs/evidence/hkscda-revision/16-phase3-assignments.md` | **New.** Rehearsal evidence. |

---

### Task 1: The auto-assign rule (pure)

**Files:**
- Create: `src/lib/sponsorshipAdmin/autoAssign.ts`
- Test: `src/lib/sponsorshipAdmin/autoAssign.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/sponsorshipAdmin/autoAssign.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import { isAssignable, selectAutoAssignAnimal } from "./autoAssign";
import type { PreferenceCandidate } from "./autoAssign";

function candidate(overrides: Partial<PreferenceCandidate> = {}): PreferenceCandidate {
  return {
    rank: 1,
    animalId: "11111111-2222-4333-8444-555555555555",
    animalNameSnapshot: "小白",
    animal: {
      sponsorshipEligible: true,
      status: "available",
      retiredAt: null,
      publicationState: "published",
      deceasedAt: null,
    },
    ...overrides,
  };
}

const baseAnimal = candidate().animal!;

describe("isAssignable", () => {
  test("accepts an eligible, published, living animal", () => {
    expect(isAssignable(candidate())).toBe(true);
  });

  test("accepts a FOSTERED animal", () => {
    // A fostered animal is in temporary care and still needs a sponsor.
    // Naming the excluded state beats requiring a single permitted one.
    expect(isAssignable(candidate({ animal: { ...baseAnimal, status: "fostered" } }))).toBe(true);
  });

  test("rejects an adopted animal", () => {
    expect(isAssignable(candidate({ animal: { ...baseAnimal, status: "adopted" } }))).toBe(false);
  });

  test("rejects a deceased animal", () => {
    // Death is recorded on animal_profile_internal, not on animals.status,
    // which has no 'deceased' value at all.
    expect(isAssignable(candidate({ animal: { ...baseAnimal, deceasedAt: "2026-08-01" } }))).toBe(
      false,
    );
  });

  test("rejects a retired record", () => {
    expect(
      isAssignable(candidate({ animal: { ...baseAnimal, retiredAt: "2026-08-01T00:00:00.000Z" } })),
    ).toBe(false);
  });

  test("rejects an animal withdrawn from the sponsorship programme", () => {
    expect(isAssignable(candidate({ animal: { ...baseAnimal, sponsorshipEligible: false } }))).toBe(
      false,
    );
  });

  test("rejects an unpublished animal", () => {
    // Opening a new public-facing commitment against a withheld profile is
    // wrong, even though withholding never ENDS an existing assignment.
    expect(isAssignable(candidate({ animal: { ...baseAnimal, publicationState: "draft" } }))).toBe(
      false,
    );
  });

  test("rejects a name-only wish with no animal", () => {
    expect(isAssignable(candidate({ animalId: null, animal: null }))).toBe(false);
  });

  test("rejects a preference whose animal row could not be read", () => {
    expect(isAssignable(candidate({ animal: null }))).toBe(false);
  });
});

describe("selectAutoAssignAnimal", () => {
  test("returns null when there are no preferences", () => {
    expect(selectAutoAssignAnimal([])).toBeNull();
  });

  test("takes the lowest rank, which is the supporter's first choice", () => {
    const second = candidate({ rank: 2, animalId: "a-2", animalNameSnapshot: "阿花" });
    const first = candidate({ rank: 1, animalId: "a-1", animalNameSnapshot: "小白" });
    expect(selectAutoAssignAnimal([second, first])?.animalId).toBe("a-1");
  });

  test("skips ineligible choices and takes the next the supporter wanted", () => {
    const first = candidate({
      rank: 1,
      animalId: "a-1",
      animal: { ...baseAnimal, status: "adopted" },
    });
    const second = candidate({ rank: 2, animalId: "a-2" });
    expect(selectAutoAssignAnimal([first, second])?.animalId).toBe("a-2");
  });

  test("returns null when nothing on the shortlist is assignable", () => {
    // The pledge then shows as active with no animal, which the attention
    // query surfaces for staff. It must NOT fall back to an arbitrary animal.
    const all = [
      candidate({ rank: 1, animal: { ...baseAnimal, status: "adopted" } }),
      candidate({ rank: 2, animal: { ...baseAnimal, deceasedAt: "2026-08-01" } }),
    ];
    expect(selectAutoAssignAnimal(all)).toBeNull();
  });

  test("does not mutate or reorder the caller's list", () => {
    const list = [candidate({ rank: 3, animalId: "c" }), candidate({ rank: 1, animalId: "a" })];
    selectAutoAssignAnimal(list);
    expect(list.map((c) => c.animalId)).toEqual(["c", "a"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/lib/sponsorshipAdmin/autoAssign.test.ts`

Expected: FAIL — `Cannot find module './autoAssign'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/sponsorshipAdmin/autoAssign.ts`:

```ts
/**
 * Which animal a first payment approval confirms.
 *
 * The supporter ranks up to ten animals at submission; those are wishes, not
 * agreements. On the first approved payment, the highest-ranked one that is
 * still assignable becomes a confirmed assignment.
 *
 * The rule lives here rather than only in SQL so it can be read and tested
 * without a database, matching `planPaymentAllocation` and
 * `selectReviewTargetProof`. `assign_sponsorship_animal_with_audit` re-checks
 * the same conditions before inserting, so a stale or hand-built call cannot
 * bypass them — the same defence-in-depth the allocation planner and its
 * triggers already use.
 */

export type CandidateAnimalState = {
  sponsorshipEligible: boolean;
  status: "available" | "fostered" | "adopted";
  retiredAt: string | null;
  publicationState: "draft" | "published" | "unpublished";
  /** Recorded on `animal_profile_internal`; `animals.status` has no deceased value. */
  deceasedAt: string | null;
};

export type PreferenceCandidate = {
  rank: number;
  animalId: string | null;
  animalNameSnapshot: string;
  /** `null` when the preference names no animal, or its row could not be read. */
  animal: CandidateAnimalState | null;
};

/**
 * Whether this preference can become a confirmed assignment right now.
 *
 * `status` names the excluded state rather than requiring `available`: a
 * fostered animal is in temporary care and still needs a sponsor, which is the
 * same reasoning that published fostered animals to the public catalogue.
 *
 * `publicationState` is checked because confirming an assignment opens a new
 * public-facing commitment. It deliberately plays no part in ENDING one —
 * withholding a profile is an editorial act, not a reason to stop a
 * sponsorship someone is already paying for.
 */
export function isAssignable(candidate: PreferenceCandidate): boolean {
  if (!candidate.animalId || !candidate.animal) return false;

  const animal = candidate.animal;
  return (
    animal.sponsorshipEligible &&
    animal.status !== "adopted" &&
    animal.retiredAt === null &&
    animal.deceasedAt === null &&
    animal.publicationState === "published"
  );
}

/**
 * The supporter's highest-ranked assignable choice, or `null` when none is.
 *
 * Returning `null` is a real outcome, not a failure: the pledge is active with
 * no animal, which the attention query surfaces so a person can choose one.
 * Falling back to an unranked animal would assign someone's money to an animal
 * they never asked for.
 */
export function selectAutoAssignAnimal(
  candidates: readonly PreferenceCandidate[],
): PreferenceCandidate | null {
  let best: PreferenceCandidate | null = null;
  for (const candidate of candidates) {
    if (!isAssignable(candidate)) continue;
    if (best === null || candidate.rank < best.rank) best = candidate;
  }
  return best;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/lib/sponsorshipAdmin/autoAssign.test.ts`

Expected: PASS, 15 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sponsorshipAdmin/autoAssign.ts src/lib/sponsorshipAdmin/autoAssign.test.ts
git commit -m "feat(sponsorship): add the auto-assign selection rule"
```

---

### Task 2: Migration — table, constraints, RLS, grants

**Files:**
- Create: `supabase/migrations/20260912120000_sponsorship_assignments.sql`
- Modify: `src/lib/supabaseMigrations.test.ts`

- [ ] **Step 1: Write the failing test**

Open `src/lib/supabaseMigrations.test.ts` and read how the neighbouring tests
load a migration's text — copy that helper rather than inventing a reader. Then
add, inside the existing top-level `describe`:

```ts
  test("adds sponsorship assignments with explicit grants, RLS and an anon revoke", () => {
    const sql = readMigration("20260912120000_sponsorship_assignments.sql");

    // Many sponsors per animal is the point: only the OPEN assignment is
    // unique, and only per (pledge, animal).
    expect(sql).toContain(
      "create unique index if not exists sponsorship_assignment_one_open_per_animal",
    );
    expect(sql).toContain("where ended_on is null");
    expect(sql).not.toContain("unique (animal_id)");

    // A reason is recorded exactly when the relationship ends.
    expect(sql).toContain("(ended_on is null) = (end_reason is null)");

    expect(sql).toContain("alter table public.sponsorship_assignment enable row level security");
    expect(sql).toContain("revoke all on public.sponsorship_assignment from anon");

    // The ledger tables shipped without an anon revoke; close it here.
    expect(sql).toContain("revoke all on public.sponsorship_period from anon");
    expect(sql).toContain("revoke all on public.sponsorship_payment_allocation from anon");
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/lib/supabaseMigrations.test.ts -t "sponsorship assignments"`

Expected: FAIL — the migration file does not exist.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260912120000_sponsorship_assignments.sql`:

```sql
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
```

- [ ] **Step 4: Apply it from zero and run the test**

```bash
bunx supabase db reset --local
```

Expected: exit 0, 63 migrations applied.

Run: `bun test src/lib/supabaseMigrations.test.ts -t "sponsorship assignments"`

Expected: PASS.

- [ ] **Step 5: Verify two sponsors can back one animal**

```bash
docker exec -i supabase_db_hkscda psql -U postgres -d postgres -c "
begin;
insert into auth.users (id,email) values ('aa000000-0000-4000-8000-000000000001','s@e.test');
insert into public.admin_user (auth_user_id,email,role,status) values ('aa000000-0000-4000-8000-000000000001','s@e.test','staff','active');
insert into public.supporter (id,name,email,language,source) values ('bb000000-0000-4000-8000-000000000001','A','a@e.test','zh-HK','sponsorship_pledge_form');
insert into public.supporter (id,name,email,language,source) values ('bb000000-0000-4000-8000-000000000002','B','b@e.test','zh-HK','sponsorship_pledge_form');
insert into public.animals (id,name,type,status) values ('99000000-0000-4000-8000-000000000001','小白','cat','available');
insert into public.sponsorship_pledge (id,supporter_id,monthly_tier,amount_cents,language,status) values ('cc000000-0000-4000-8000-000000000001','bb000000-0000-4000-8000-000000000001','100',10000,'zh-HK','active');
insert into public.sponsorship_pledge (id,supporter_id,monthly_tier,amount_cents,language,status) values ('cc000000-0000-4000-8000-000000000002','bb000000-0000-4000-8000-000000000002','100',10000,'zh-HK','active');
insert into public.sponsorship_assignment (pledge_id,animal_id,animal_name_snapshot) values ('cc000000-0000-4000-8000-000000000001','99000000-0000-4000-8000-000000000001','小白');
insert into public.sponsorship_assignment (pledge_id,animal_id,animal_name_snapshot) values ('cc000000-0000-4000-8000-000000000002','99000000-0000-4000-8000-000000000001','小白');
select count(*) as two_sponsors_one_animal from public.sponsorship_assignment;
rollback;"
```

Expected: `two_sponsors_one_animal = 2`.

Then confirm the open-uniqueness constraint rejects a duplicate:

```bash
docker exec -i supabase_db_hkscda psql -U postgres -d postgres -c "
begin;
insert into public.supporter (id,name,email,language,source) values ('bb000000-0000-4000-8000-000000000003','C','c@e.test','zh-HK','sponsorship_pledge_form');
insert into public.animals (id,name,type,status) values ('99000000-0000-4000-8000-000000000002','阿花','cat','available');
insert into public.sponsorship_pledge (id,supporter_id,monthly_tier,amount_cents,language,status) values ('cc000000-0000-4000-8000-000000000003','bb000000-0000-4000-8000-000000000003','100',10000,'zh-HK','active');
insert into public.sponsorship_assignment (pledge_id,animal_id,animal_name_snapshot) values ('cc000000-0000-4000-8000-000000000003','99000000-0000-4000-8000-000000000002','阿花');
insert into public.sponsorship_assignment (pledge_id,animal_id,animal_name_snapshot) values ('cc000000-0000-4000-8000-000000000003','99000000-0000-4000-8000-000000000002','阿花');
rollback;"
```

Expected: `ERROR: duplicate key value violates unique constraint "sponsorship_assignment_one_open_per_animal"`.

And that an end without a reason is refused:

```bash
docker exec -i supabase_db_hkscda psql -U postgres -d postgres -c "
begin;
insert into public.supporter (id,name,email,language,source) values ('bb000000-0000-4000-8000-000000000004','D','d@e.test','zh-HK','sponsorship_pledge_form');
insert into public.sponsorship_pledge (id,supporter_id,monthly_tier,amount_cents,language,status) values ('cc000000-0000-4000-8000-000000000004','bb000000-0000-4000-8000-000000000004','100',10000,'zh-HK','active');
insert into public.sponsorship_assignment (pledge_id,animal_name_snapshot,ended_on) values ('cc000000-0000-4000-8000-000000000004','小白',current_date);
rollback;"
```

Expected: `ERROR: new row ... violates check constraint "sponsorship_assignment_reason_with_end"`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260912120000_sponsorship_assignments.sql src/lib/supabaseMigrations.test.ts
git commit -m "feat(sponsorship): add the sponsorship_assignment table"
```

---

### Task 3: Migration — the assign and end RPCs

**Files:**
- Modify: `supabase/migrations/20260912120000_sponsorship_assignments.sql`

- [ ] **Step 1: Append both RPCs**

Append to `supabase/migrations/20260912120000_sponsorship_assignments.sql`:

```sql
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
  set ended_on = current_date,
      end_reason = p_reason,
      ended_by = v_actor_admin_id,
      note = coalesce(p_note, note)
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
```

- [ ] **Step 2: Apply and verify assignment refuses an adopted animal**

```bash
bunx supabase db reset --local
```

Expected: exit 0, 63 migrations.

```bash
docker exec -i supabase_db_hkscda psql -U postgres -d postgres -c "
begin;
insert into auth.users (id,email) values ('aa000000-0000-4000-8000-000000000001','s@e.test');
insert into public.admin_user (auth_user_id,email,role,status) values ('aa000000-0000-4000-8000-000000000001','s@e.test','staff','active');
insert into public.supporter (id,name,email,language,source) values ('bb000000-0000-4000-8000-000000000001','A','a@e.test','zh-HK','sponsorship_pledge_form');
insert into public.sponsorship_pledge (id,supporter_id,monthly_tier,amount_cents,language,status) values ('cc000000-0000-4000-8000-000000000001','bb000000-0000-4000-8000-000000000001','100',10000,'zh-HK','active');
insert into public.animals (id,name,type,status,sponsorship_eligible,publication_state) values ('99000000-0000-4000-8000-000000000001','小白','cat','available',true,'published');
insert into public.animals (id,name,type,status,sponsorship_eligible,publication_state) values ('99000000-0000-4000-8000-000000000002','已領養','cat','adopted',true,'published');
select 'assign ok: '||(public.assign_sponsorship_animal_with_audit('cc000000-0000-4000-8000-000000000001','99000000-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000001','first') is not null)::text;
select public.assign_sponsorship_animal_with_audit('cc000000-0000-4000-8000-000000000001','99000000-0000-4000-8000-000000000002','aa000000-0000-4000-8000-000000000001','adopted animal');
rollback;"
```

Expected: `assign ok: true`, then
`ERROR: Animal 99000000-0000-4000-8000-000000000002 cannot be sponsored`.

- [ ] **Step 3: Verify ending works once and refuses twice**

```bash
docker exec -i supabase_db_hkscda psql -U postgres -d postgres -c "
begin;
insert into auth.users (id,email) values ('aa000000-0000-4000-8000-000000000001','s@e.test');
insert into public.admin_user (auth_user_id,email,role,status) values ('aa000000-0000-4000-8000-000000000001','s@e.test','staff','active');
insert into public.supporter (id,name,email,language,source) values ('bb000000-0000-4000-8000-000000000001','A','a@e.test','zh-HK','sponsorship_pledge_form');
insert into public.sponsorship_pledge (id,supporter_id,monthly_tier,amount_cents,language,status) values ('cc000000-0000-4000-8000-000000000001','bb000000-0000-4000-8000-000000000001','100',10000,'zh-HK','active');
insert into public.animals (id,name,type,status,sponsorship_eligible,publication_state) values ('99000000-0000-4000-8000-000000000001','小白','cat','available',true,'published');
select public.end_sponsorship_assignment_with_audit(
  public.assign_sponsorship_animal_with_audit('cc000000-0000-4000-8000-000000000001','99000000-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000001',null),
  'aa000000-0000-4000-8000-000000000001','adopted','rehomed');
select ended_on is not null as ended, end_reason from public.sponsorship_assignment;
select public.end_sponsorship_assignment_with_audit(
  (select id from public.sponsorship_assignment limit 1),
  'aa000000-0000-4000-8000-000000000001','adopted','again');
rollback;"
```

Expected: `ended = t`, `end_reason = adopted`, then
`ERROR: Sponsorship assignment is already ended`.

- [ ] **Step 4: Run the migration guard**

Run: `bun test src/lib/supabaseMigrations.test.ts`

Expected: PASS — every `security definer` function pins `search_path` and is
granted only to `service_role`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260912120000_sponsorship_assignments.sql
git commit -m "feat(sponsorship): add audited assign and end assignment RPCs"
```

---

### Task 4: Migration — auto-assign inside the review RPC

**Files:**
- Modify: `supabase/migrations/20260912120000_sponsorship_assignments.sql`

- [ ] **Step 1: Dump the current function so the body is copied, not retyped**

```bash
docker exec -i supabase_db_hkscda psql -U postgres -d postgres -Atc \
  "select pg_get_functiondef('public.review_sponsorship_payment_proof(uuid,text,uuid,text,jsonb)'::regprocedure);" \
  > /tmp/review_current.sql
wc -l /tmp/review_current.sql
```

Expected: the full current definition, roughly 140 lines.

- [ ] **Step 2: Append the replacement**

Append to `supabase/migrations/20260912120000_sponsorship_assignments.sql`.
Copy every statement between `begin` and the pledge-status update **verbatim**
from `/tmp/review_current.sql` — the actor check, the decision check, the pledge
lock, the oldest-pending-proof lock, the decision branch, the proof update and
the pledge update. Only three things change, marked below.

```sql
-- Approving a payment now also confirms the supporter's animal, in the same
-- transaction that approves and allocates it.
--
-- Three changes from the 20260911190000 definition, and nothing else:
--   1. a sixth parameter, p_assign_animal_id, defaulted so existing calls work;
--   2. v_actor_admin_id is resolved ONCE, before the allocation branch -- it
--      was previously resolved inside it, so it was NULL on the common
--      first-approval path where no allocations are passed;
--   3. an auto-assign step, which runs only when the pledge has no assignment
--      rows at all.
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
  -- >>> PASTE the verbatim statements from /tmp/review_current.sql here,
  -- >>> ending with the `update public.sponsorship_pledge ... where id = p_pledge_id;`
  -- >>> No ellipsis may remain in the finished file.

  -- CHANGE 2: resolve the actor's admin id once, unconditionally.
  select id into v_actor_admin_id
  from public.admin_user
  where auth_user_id = p_actor_user_id;

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
  if p_decision = 'approve' and p_assign_animal_id is not null
     and not exists (
       select 1 from public.sponsorship_assignment where pledge_id = p_pledge_id
     ) then
    v_assignment_id := public.assign_sponsorship_animal_with_audit(
      p_pledge_id, p_assign_animal_id, p_actor_user_id, null
    );
  end if;

  insert into public.audit_log (
    actor_user_id, action, entity, entity_id, detail
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
```

- [ ] **Step 3: Apply and verify approval assigns, with a real actor**

```bash
bunx supabase db reset --local
```

Expected: exit 0, 63 migrations.

```bash
docker exec -i supabase_db_hkscda psql -U postgres -d postgres -c "
begin;
insert into auth.users (id,email) values ('aa000000-0000-4000-8000-000000000001','s@e.test');
insert into public.admin_user (auth_user_id,email,role,status) values ('aa000000-0000-4000-8000-000000000001','s@e.test','staff','active');
insert into public.supporter (id,name,email,language,source) values ('bb000000-0000-4000-8000-000000000001','A','a@e.test','zh-HK','sponsorship_pledge_form');
insert into public.sponsorship_pledge (id,supporter_id,monthly_tier,amount_cents,language,status) values ('cc000000-0000-4000-8000-000000000001','bb000000-0000-4000-8000-000000000001','100',10000,'zh-HK','pending_payment');
insert into public.animals (id,name,type,status,sponsorship_eligible,publication_state) values ('99000000-0000-4000-8000-000000000001','小白','cat','available',true,'published');
select public.record_sponsorship_payment_proof('cc000000-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000001','p/1.jpg','1.jpg','image/jpeg',1000,'fps','M1',10000,'2026-08-01','m1');
select public.review_sponsorship_payment_proof('cc000000-0000-4000-8000-000000000001','approve','aa000000-0000-4000-8000-000000000001','ok','[]'::jsonb,'99000000-0000-4000-8000-000000000001');
select animal_name_snapshot, created_by is not null as has_actor from public.sponsorship_assignment;
rollback;"
```

Expected: one row, `animal_name_snapshot = 小白`, **`has_actor = t`**. That last
column is the `v_actor_admin_id` fix: before it, `created_by` was null whenever
no allocations were passed, which is the common first-approval path.

- [ ] **Step 4: Verify a second approval does not create a second assignment**

```bash
docker exec -i supabase_db_hkscda psql -U postgres -d postgres -c "
begin;
insert into auth.users (id,email) values ('aa000000-0000-4000-8000-000000000001','s@e.test');
insert into public.admin_user (auth_user_id,email,role,status) values ('aa000000-0000-4000-8000-000000000001','s@e.test','staff','active');
insert into public.supporter (id,name,email,language,source) values ('bb000000-0000-4000-8000-000000000001','A','a@e.test','zh-HK','sponsorship_pledge_form');
insert into public.sponsorship_pledge (id,supporter_id,monthly_tier,amount_cents,language,status) values ('cc000000-0000-4000-8000-000000000001','bb000000-0000-4000-8000-000000000001','100',10000,'zh-HK','pending_payment');
insert into public.animals (id,name,type,status,sponsorship_eligible,publication_state) values ('99000000-0000-4000-8000-000000000001','小白','cat','available',true,'published');
select public.record_sponsorship_payment_proof('cc000000-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000001','p/1.jpg','1.jpg','image/jpeg',1000,'fps','M1',10000,'2026-08-01','m1');
select public.review_sponsorship_payment_proof('cc000000-0000-4000-8000-000000000001','approve','aa000000-0000-4000-8000-000000000001','ok','[]'::jsonb,'99000000-0000-4000-8000-000000000001');
select public.record_sponsorship_payment_proof('cc000000-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000001','p/2.jpg','2.jpg','image/jpeg',1000,'fps','M2',10000,'2026-09-01','m2');
select public.review_sponsorship_payment_proof('cc000000-0000-4000-8000-000000000001','approve','aa000000-0000-4000-8000-000000000001','ok','[]'::jsonb,'99000000-0000-4000-8000-000000000001');
select count(*) as assignments_after_two_approvals from public.sponsorship_assignment;
rollback;"
```

Expected: `assignments_after_two_approvals = 1`.

- [ ] **Step 5: Run the full suite**

Run: `bun test --isolate`

Expected: the repository test asserting the review RPC payload now FAILS,
because the call gains `p_assign_animal_id`. That failure is expected and is
fixed in Task 7. Everything else passes.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260912120000_sponsorship_assignments.sql
git commit -m "feat(sponsorship): confirm the supporter's animal on first approval"
```

---

### Task 5: Types

**Files:**
- Modify: `src/lib/sponsorshipAdmin/types.ts`, `src/lib/sponsorshipAdmin/service.test.ts`

- [ ] **Step 1: Add the record types and the required field**

In `src/lib/sponsorshipAdmin/types.ts`, add before `PledgeAuditEntry`:

```ts
/** Why a confirmed relationship ended. */
export type AssignmentEndReason =
  | "adopted"
  | "deceased"
  | "ineligible"
  | "retired"
  | "supporter_request"
  | "transferred"
  | "other";

/**
 * A confirmed supporter–animal relationship. Carries no amount: the pledge's
 * monthly commitment is not divided per animal.
 */
export type SponsorshipAssignmentRecord = {
  id: string;
  animalId: string | null;
  animalNameSnapshot: string;
  startedOn: string;
  endedOn: string | null;
  endReason: AssignmentEndReason | null;
  note: string | null;
  /**
   * Why this open assignment needs a person to look: the animal has been
   * adopted, has died, has been retired, or has left the sponsorship
   * programme. `null` when nothing is wrong. Derived, never stored.
   */
  reviewReason: "adopted" | "deceased" | "retired" | "ineligible" | null;
};
```

Add to `PledgeDetail`, immediately after `periods`:

```ts
  /** Confirmed animals, open ones first, then ended ones newest-first. */
  assignments: SponsorshipAssignmentRecord[];
  /**
   * The sponsorship is running but backs no animal — the money keeps arriving
   * and a person must choose one. Derived, never stored.
   */
  needsAnimal: boolean;
```

It is **required, not optional**, on purpose: `bun test` does not type-check, so
an optional field would let every existing fixture silently omit it and exercise
`undefined`. Required means `bunx tsc --noEmit` finds them all.

- [ ] **Step 2: Run typecheck to see exactly which fixtures break**

Run: `bunx tsc --noEmit`

Expected: FAIL, pointing at `src/lib/sponsorshipAdmin/service.test.ts` where
`baseDetail` builds a `PledgeDetail` literal.

- [ ] **Step 3: Fix the fixture**

In `src/lib/sponsorshipAdmin/service.test.ts`, inside `baseDetail`, add after
`periods: []`:

```ts
    assignments: [],
    needsAnimal: false,
```

- [ ] **Step 4: Run typecheck again**

Run: `bunx tsc --noEmit`

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sponsorshipAdmin/types.ts src/lib/sponsorshipAdmin/service.test.ts
git commit -m "feat(sponsorship): add assignment types to the pledge detail"
```

---

### Task 6: Repository — read assignments

**Files:**
- Modify: `src/lib/sponsorshipAdmin/repository.server.ts`
- Test: `src/lib/sponsorshipAdmin/repository.server.test.ts`

- [ ] **Step 1: Teach the fake client about the new table**

In `src/lib/sponsorshipAdmin/repository.server.test.ts`:

Add to the `FakeState` type, after `auditRows`:

```ts
  assignmentRows: Record<string, unknown>[];
```

Add to the `createFakeClient` defaults, after `auditRows: []`:

```ts
    assignmentRows: [],
```

Add to the table dispatch in `rowsForTable`, after the `audit_log` line:

```ts
    if (this.table === "sponsorship_assignment") return this.state.assignmentRows;
```

`rowsForTable()` returns `[]` for tables it does not know, so a test written
before this step would pass with no evidence at all.

- [ ] **Step 2: Write the failing test**

Add to `src/lib/sponsorshipAdmin/repository.server.test.ts`:

```ts
  test("getPledgeDetail lists open assignments before ended ones", async () => {
    const { client } = createFakeClient({
      assignmentRows: [
        {
          id: "asg-ended",
          pledge_id: pledgeId,
          animal_id: "animal-1",
          animal_name_snapshot: "小白",
          started_on: "2026-06-01",
          ended_on: "2026-07-15",
          end_reason: "adopted",
          note: null,
        },
        {
          id: "asg-open",
          pledge_id: pledgeId,
          animal_id: "animal-2",
          animal_name_snapshot: "阿花",
          started_on: "2026-08-01",
          ended_on: null,
          end_reason: null,
          note: null,
        },
      ],
    });
    const repo = createSupabaseSponsorshipAdminRepository(client);

    const detail = await repo.getPledgeDetail(pledgeId);

    // Open first: it is what staff act on. The ended one stays as history
    // rather than being hidden.
    expect(detail?.assignments.map((a) => a.id)).toEqual(["asg-open", "asg-ended"]);
    expect(detail?.assignments[1].endReason).toBe("adopted");
  });

  test("getPledgeDetail returns an empty assignment list when there are none", async () => {
    const { client } = createFakeClient();
    const repo = createSupabaseSponsorshipAdminRepository(client);

    const detail = await repo.getPledgeDetail(pledgeId);

    expect(detail?.assignments).toEqual([]);
  });
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `bun test src/lib/sponsorshipAdmin/repository.server.test.ts -t "assignment"`

Expected: FAIL — `detail.assignments` is undefined.

- [ ] **Step 4: Implement the read**

In `src/lib/sponsorshipAdmin/repository.server.ts`, add the row type beside the
others:

```ts
type AssignmentRow = {
  id: string;
  pledge_id: string;
  animal_id: string | null;
  animal_name_snapshot: string;
  started_on: string;
  ended_on: string | null;
  end_reason: SponsorshipAssignmentRecord["endReason"];
  note: string | null;
};
```

Add `SponsorshipAssignmentRecord` to the existing type import from `./types`.

Add the mapper beside `mapPeriods`:

```ts
/**
 * Open assignments first, then ended ones newest-first. Open ones are what
 * staff act on; ended ones stay visible as history rather than disappearing.
 *
 * `reviewReason` is filled in by the service, which has the animal state. The
 * repository does not guess it.
 */
function mapAssignments(rows: AssignmentRow[]): SponsorshipAssignmentRecord[] {
  const mapped: SponsorshipAssignmentRecord[] = rows.map((row) => ({
    id: row.id,
    animalId: row.animal_id,
    animalNameSnapshot: row.animal_name_snapshot,
    startedOn: row.started_on,
    endedOn: row.ended_on,
    endReason: row.end_reason,
    note: row.note,
    reviewReason: null,
  }));

  return mapped.sort((a, b) => {
    if ((a.endedOn === null) !== (b.endedOn === null)) return a.endedOn === null ? -1 : 1;
    if (a.endedOn && b.endedOn && a.endedOn !== b.endedOn) return a.endedOn < b.endedOn ? 1 : -1;
    return a.startedOn < b.startedOn ? 1 : -1;
  });
}
```

Add the fetch inside `getPledgeDetail`'s `Promise.all`, after the period query,
destructuring it as `assignmentResult`:

```ts
        client
          .from("sponsorship_assignment")
          .select("id,pledge_id,animal_id,animal_name_snapshot,started_on,ended_on,end_reason,note")
          .eq("pledge_id", id),
```

Add `if (assignmentResult.error) throw assignmentResult.error;` beside the other
error checks, and add to the returned object after `periods`:

```ts
        assignments: mapAssignments((assignmentResult.data ?? []) as AssignmentRow[]),
        // The repository reports the raw fact; the service decides whether it
        // amounts to "needs a person", because that also depends on status.
        needsAnimal: false,
```

- [ ] **Step 5: Run the tests**

Run: `bun test src/lib/sponsorshipAdmin/repository.server.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/sponsorshipAdmin/repository.server.ts src/lib/sponsorshipAdmin/repository.server.test.ts
git commit -m "feat(sponsorship): read confirmed assignments into the pledge detail"
```

---

### Task 7: Repository — the two write methods and the review signature

**Files:**
- Modify: `src/lib/sponsorshipAdmin/repository.server.ts`
- Test: `src/lib/sponsorshipAdmin/repository.server.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/sponsorshipAdmin/repository.server.test.ts`:

```ts
  test("assignAnimal calls the audited RPC with mapped params", async () => {
    const { client, state } = createFakeClient({ rpcResult: "asg-1" });
    const repo = createSupabaseSponsorshipAdminRepository(client);

    const result = await repo.assignAnimal({
      pledgeId,
      animalId: "animal-1",
      actorUserId,
      note: "Supporter asked for this cat",
    });

    const call = state.calls.find((c) => c.fn === "assign_sponsorship_animal_with_audit");
    expect(call?.payload).toEqual({
      p_pledge_id: pledgeId,
      p_animal_id: "animal-1",
      p_actor_user_id: actorUserId,
      p_note: "Supporter asked for this cat",
    });
    expect(result).toEqual({ id: "asg-1" });
  });

  test("endAssignment calls the audited RPC with mapped params", async () => {
    const { client, state } = createFakeClient();
    const repo = createSupabaseSponsorshipAdminRepository(client);

    await repo.endAssignment({
      assignmentId: "asg-1",
      actorUserId,
      reason: "adopted",
      note: null,
    });

    const call = state.calls.find((c) => c.fn === "end_sponsorship_assignment_with_audit");
    expect(call?.payload).toEqual({
      p_assignment_id: "asg-1",
      p_actor_user_id: actorUserId,
      p_reason: "adopted",
      p_note: null,
    });
  });
```

And update the existing review payload assertion — it gains the animal:

```ts
    expect(call?.payload).toEqual({
      p_pledge_id: pledgeId,
      p_decision: "approve",
      p_actor_user_id: actorUserId,
      p_note: "Looks good",
      p_allocations: [],
      // The animal to confirm rides along with the decision, so approving,
      // attributing and confirming all commit in one transaction.
      p_assign_animal_id: null,
    });
```

- [ ] **Step 2: Run to verify they fail**

Run: `bun test src/lib/sponsorshipAdmin/repository.server.test.ts`

Expected: FAIL — `repo.assignAnimal is not a function`, plus the review payload
mismatch.

- [ ] **Step 3: Implement**

In `src/lib/sponsorshipAdmin/repository.server.ts`, export the two input types
beside `AllocateProofInput`:

```ts
export type AssignAnimalRepoInput = {
  pledgeId: string;
  animalId: string;
  actorUserId: string;
  note: string | null;
};

export type EndAssignmentRepoInput = {
  assignmentId: string;
  actorUserId: string;
  reason: AssignmentEndReason;
  note: string | null;
};
```

importing `AssignmentEndReason` from `./types`. Add to the
`SponsorshipAdminRepository` type:

```ts
  assignAnimal(input: AssignAnimalRepoInput): Promise<{ id: string }>;
  endAssignment(input: EndAssignmentRepoInput): Promise<void>;
```

Extend `reviewProof`'s input type in that same interface with:

```ts
      /** The animal to confirm on a first approval, or null. */
      assignAnimalId?: string | null;
```

Add the implementations beside `cancelPledge`:

```ts
    async assignAnimal(input) {
      const { data, error } = await client.rpc("assign_sponsorship_animal_with_audit", {
        p_pledge_id: input.pledgeId,
        p_animal_id: input.animalId,
        p_actor_user_id: input.actorUserId,
        p_note: input.note ?? null,
      });
      if (error) throw error;
      return { id: data as string };
    },

    async endAssignment(input) {
      const { error } = await client.rpc("end_sponsorship_assignment_with_audit", {
        p_assignment_id: input.assignmentId,
        p_actor_user_id: input.actorUserId,
        p_reason: input.reason,
        p_note: input.note ?? null,
      });
      if (error) throw error;
    },
```

and add to the existing `reviewProof` RPC payload:

```ts
        p_assign_animal_id: input.assignAnimalId ?? null,
```

- [ ] **Step 4: Run the tests**

Run: `bun test src/lib/sponsorshipAdmin/repository.server.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sponsorshipAdmin/repository.server.ts src/lib/sponsorshipAdmin/repository.server.test.ts
git commit -m "feat(sponsorship): add assign and end repository methods"
```

---

### Task 8: Service — the two actions

**Files:**
- Modify: `src/lib/sponsorshipAdmin/service.ts`, `src/lib/sponsorshipAdmin/schemas.ts`
- Test: `src/lib/sponsorshipAdmin/service.test.ts`

- [ ] **Step 1: Add the schemas**

In `src/lib/sponsorshipAdmin/schemas.ts`, after `cancelPledgeSchema`:

```ts
export const assignAnimalSchema = z.object({
  animalId: z.string().uuid(),
  note: optionalTrimmed,
});

export const endAssignmentSchema = z.object({
  reason: z.enum([
    "adopted",
    "deceased",
    "ineligible",
    "retired",
    "supporter_request",
    "transferred",
    "other",
  ]),
  note: optionalTrimmed,
});
```

- [ ] **Step 2: Extend the fake repo, then write the failing tests**

In `src/lib/sponsorshipAdmin/service.test.ts`, add to `createFakeRepo`'s literal:

```ts
    assignAnimal: mock(async () => ({ id: "asg-1" })),
    endAssignment: mock(async () => {}),
```

The `as Repo` cast at the end of that function means TypeScript will **not**
tell you these are missing — `allocateProof` is already absent from it and
typecheck is clean. Add them by hand.

Then add:

```ts
  test("assignAnimal passes the animal through to the repository", async () => {
    const repo = createFakeRepo();
    const service = createSponsorshipAdminService({
      repo,
      client: fakeClient,
      sendPledgeStatusUpdateEmail: createFakeSender().sendPledgeStatusUpdateEmail,
    });

    await service.assignAnimal({
      actorUserId,
      pledgeId,
      input: { animalId: "11111111-2222-4333-8444-555555555555" },
    });

    expect(repo.assignAnimal).toHaveBeenCalledWith({
      pledgeId,
      animalId: "11111111-2222-4333-8444-555555555555",
      actorUserId,
      note: null,
    });
  });

  test("assignAnimal refuses a cancelled pledge before touching the database", async () => {
    const repo = createFakeRepo({
      getPledgeDetail: mock(async () => baseDetail({ status: "cancelled" })),
    });
    const service = createSponsorshipAdminService({
      repo,
      client: fakeClient,
      sendPledgeStatusUpdateEmail: createFakeSender().sendPledgeStatusUpdateEmail,
    });

    await expect(
      service.assignAnimal({
        actorUserId,
        pledgeId,
        input: { animalId: "11111111-2222-4333-8444-555555555555" },
      }),
    ).rejects.toThrow("Sponsorship pledge is already cancelled");
    expect(repo.assignAnimal).not.toHaveBeenCalled();
  });

  test("endAssignment passes the reason through", async () => {
    const repo = createFakeRepo({
      getPledgeDetail: mock(async () =>
        baseDetail({
          assignments: [
            {
              id: "asg-1",
              animalId: "animal-1",
              animalNameSnapshot: "小白",
              startedOn: "2026-07-01",
              endedOn: null,
              endReason: null,
              note: null,
              reviewReason: null,
            },
          ],
        }),
      ),
    });
    const service = createSponsorshipAdminService({
      repo,
      client: fakeClient,
      sendPledgeStatusUpdateEmail: createFakeSender().sendPledgeStatusUpdateEmail,
    });

    await service.endAssignment({
      actorUserId,
      pledgeId,
      assignmentId: "asg-1",
      input: { reason: "adopted", note: "rehomed" },
    });

    expect(repo.endAssignment).toHaveBeenCalledWith({
      assignmentId: "asg-1",
      actorUserId,
      reason: "adopted",
      note: "rehomed",
    });
  });

  test("endAssignment refuses one that is already ended", async () => {
    const repo = createFakeRepo({
      getPledgeDetail: mock(async () =>
        baseDetail({
          assignments: [
            {
              id: "asg-1",
              animalId: "animal-1",
              animalNameSnapshot: "小白",
              startedOn: "2026-07-01",
              endedOn: "2026-08-01",
              endReason: "adopted",
              note: null,
              reviewReason: null,
            },
          ],
        }),
      ),
    });
    const service = createSponsorshipAdminService({
      repo,
      client: fakeClient,
      sendPledgeStatusUpdateEmail: createFakeSender().sendPledgeStatusUpdateEmail,
    });

    await expect(
      service.endAssignment({
        actorUserId,
        pledgeId,
        assignmentId: "asg-1",
        input: { reason: "adopted" },
      }),
    ).rejects.toThrow("Sponsorship assignment is already ended");
    expect(repo.endAssignment).not.toHaveBeenCalled();
  });
```

- [ ] **Step 3: Run to verify they fail**

Run: `bun test src/lib/sponsorshipAdmin/service.test.ts -t "ssign"`

Expected: FAIL — `service.assignAnimal is not a function`.

- [ ] **Step 4: Implement**

In `src/lib/sponsorshipAdmin/service.ts`, import `assignAnimalSchema` and
`endAssignmentSchema` from `./schemas`, and add after `cancelPledge`:

```ts
    async assignAnimal(args: { actorUserId: string; pledgeId: string; input: unknown }) {
      const input = assignAnimalSchema.parse(args.input);
      const detail = requirePledge(await repo.getPledgeDetail(args.pledgeId));
      // Checked here as well as in the RPC so staff get a clear message rather
      // than a raw database exception; the RPC remains the guard that cannot
      // be bypassed.
      if (detail.status === "cancelled") {
        throw new Error("Sponsorship pledge is already cancelled");
      }

      return repo.assignAnimal({
        pledgeId: args.pledgeId,
        animalId: input.animalId,
        actorUserId: args.actorUserId,
        note: input.note ?? null,
      });
    },

    async endAssignment(args: {
      actorUserId: string;
      pledgeId: string;
      assignmentId: string;
      input: unknown;
    }) {
      const input = endAssignmentSchema.parse(args.input);
      const detail = requirePledge(await repo.getPledgeDetail(args.pledgeId));
      const assignment = detail.assignments.find((a) => a.id === args.assignmentId);
      if (!assignment) {
        throw new Error("Sponsorship assignment not found");
      }
      if (assignment.endedOn !== null) {
        throw new Error("Sponsorship assignment is already ended");
      }

      await repo.endAssignment({
        assignmentId: args.assignmentId,
        actorUserId: args.actorUserId,
        reason: input.reason,
        note: input.note ?? null,
      });
    },
```

- [ ] **Step 5: Run the tests**

Run: `bun test src/lib/sponsorshipAdmin/service.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/sponsorshipAdmin/service.ts src/lib/sponsorshipAdmin/schemas.ts src/lib/sponsorshipAdmin/service.test.ts
git commit -m "feat(sponsorship): add assign and end assignment service actions"
```

---

### Task 9: HTTP handlers, error mapping and routes

**Files:**
- Modify: `src/lib/sponsorshipAdmin/http.server.ts`
- Create: `src/routes/api/admin/sponsorships/pledges/$id/assignments.ts`
- Create: `src/routes/api/admin/sponsorships/pledges/$id/assignments/$assignmentId/end.ts`

- [ ] **Step 1: Extend the domain-error sets**

In `src/lib/sponsorshipAdmin/http.server.ts`:

```ts
const notFoundDomainErrors = new Set([
  "Sponsorship pledge not found",
  "Sponsorship assignment not found",
]);
```

and add to `conflictDomainErrors`:

```ts
  "Sponsorship assignment is already ended",
```

These sets match on exact `Error.message` strings — a message that is not listed
surfaces as a 500 rather than a 404 or 409.

- [ ] **Step 2: Correct the stale forbidden-error match**

`forbiddenDomainErrors` holds `"Actor is not authorized to review sponsorship pledges"`,
a string no production code raises; the database raises
`"Actor <uuid> is not an active staff/admin user"`, so the set could never fire.
Replace the set with a predicate:

```ts
// The database raises "Actor <uuid> is not an active staff/admin user", so an
// exact-match set could never fire. Matched on the stable prefix instead.
function isForbiddenDomainError(message: string) {
  return message.startsWith("Actor ") && message.includes("is not an active staff/admin user");
}
```

and replace the `forbiddenDomainErrors.has(...)` call in `withErrors` with
`isForbiddenDomainError(...)`. Run `bun test src/lib/sponsorshipAdmin/http.test.ts`
and update any test that asserted the old string.

- [ ] **Step 3: Add the two handlers**

In the object returned by `createSponsorshipAdminHandlers`, after `cancelPledge`:

```ts
    assignAnimal({ request, params }: HandlerContext) {
      return withErrors(async () => {
        const pledgeId = requiredUuid(params, "id");
        const admin = await requireCoordinator(request);
        const result = await service.assignAnimal({
          actorUserId: admin.authUserId,
          pledgeId,
          input: await jsonBody(request),
        });
        return jsonResponse(result, { status: 201 });
      });
    },

    endAssignment({ request, params }: HandlerContext) {
      return withErrors(async () => {
        const pledgeId = requiredUuid(params, "id");
        const assignmentId = requiredUuid(params, "assignmentId");
        const admin = await requireCoordinator(request);
        await service.endAssignment({
          actorUserId: admin.authUserId,
          pledgeId,
          assignmentId,
          input: await jsonBody(request),
        });
        return jsonResponse({ ok: true });
      });
    },
```

- [ ] **Step 4: Create the routes**

`src/routes/api/admin/sponsorships/pledges/$id/assignments.ts`:

```ts
import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "../-handlers";

export const Route = createFileRoute("/api/admin/sponsorships/pledges/$id/assignments")({
  server: {
    handlers: {
      POST: ({ request, params }) => createHandlers().assignAnimal({ request, params }),
    },
  },
});
```

`src/routes/api/admin/sponsorships/pledges/$id/assignments/$assignmentId/end.ts`:

```ts
import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "../../../-handlers";

export const Route = createFileRoute(
  "/api/admin/sponsorships/pledges/$id/assignments/$assignmentId/end",
)({
  server: {
    handlers: {
      POST: ({ request, params }) => createHandlers().endAssignment({ request, params }),
    },
  },
});
```

Check the relative depth of each `-handlers` import against the sibling
`cancel.ts` — both must resolve to
`src/routes/api/admin/sponsorships/pledges/-handlers.ts`.

- [ ] **Step 5: Regenerate the route tree, typecheck and test**

```bash
bun run build
bunx tsc --noEmit
bun test src/lib/sponsorshipAdmin/
```

Expected: all exit 0, and `src/routeTree.gen.ts` now contains both routes.

- [ ] **Step 6: Commit**

```bash
git add src/lib/sponsorshipAdmin/http.server.ts src/lib/sponsorshipAdmin/http.test.ts src/routes/api/admin/sponsorships/pledges src/routeTree.gen.ts
git commit -m "feat(sponsorship): expose assign and end assignment endpoints"
```

---

### Task 10: Wire auto-assign through the service

**Files:**
- Modify: `src/lib/sponsorshipAdmin/types.ts`, `src/lib/sponsorshipAdmin/repository.server.ts`, `src/lib/sponsorshipAdmin/service.ts`
- Test: `src/lib/sponsorshipAdmin/service.test.ts`

- [ ] **Step 1: Carry the animal's state onto each preference**

In `src/lib/sponsorshipAdmin/types.ts`, import `CandidateAnimalState` from
`./autoAssign` and add to `PledgeAnimalPreference`:

```ts
  /** The animal's current state, for the auto-assign rule. `null` if unreadable. */
  animalState: CandidateAnimalState | null;
```

In `src/lib/sponsorshipAdmin/repository.server.ts`, change the preference query
in `getPledgeDetail` to embed that state:

```ts
        client
          .from("sponsorship_preference")
          .select(
            "*,animal:sponsor_animal_id(sponsorship_eligible,status,retired_at,publication_state,animal_profile_internal(deceased_at))",
          )
          .eq("pledge_id", id)
          .order("rank", { ascending: true }),
```

and map it in `mapPreference`, treating a missing embed as `null`:

```ts
function mapPreference(row: PreferenceRow): PledgeAnimalPreference {
  const embedded = (row as unknown as { animal?: EmbeddedAnimalRow | null }).animal ?? null;
  return {
    id: row.id,
    rank: row.rank,
    animalId: row.sponsor_animal_id,
    animalNameSnapshot: row.animal_name_snapshot,
    animalState: embedded
      ? {
          sponsorshipEligible: embedded.sponsorship_eligible,
          status: embedded.status,
          retiredAt: embedded.retired_at,
          publicationState: embedded.publication_state,
          // PostgREST returns an embedded 1:1 as an array or an object
          // depending on the relationship; absence means nothing was recorded,
          // not that the animal died.
          deceasedAt:
            (Array.isArray(embedded.animal_profile_internal)
              ? (embedded.animal_profile_internal[0]?.deceased_at ?? null)
              : (embedded.animal_profile_internal?.deceased_at ?? null)) ?? null,
        }
      : null,
  };
}
```

with the row type:

```ts
type EmbeddedAnimalRow = {
  sponsorship_eligible: boolean;
  status: CandidateAnimalState["status"];
  retired_at: string | null;
  publication_state: CandidateAnimalState["publicationState"];
  animal_profile_internal:
    | { deceased_at: string | null }
    | { deceased_at: string | null }[]
    | null;
};
```

- [ ] **Step 2: Write the failing tests**

Add to `src/lib/sponsorshipAdmin/service.test.ts`:

```ts
  const eligibleState = {
    sponsorshipEligible: true,
    status: "available" as const,
    retiredAt: null,
    publicationState: "published" as const,
    deceasedAt: null,
  };

  test("approving the first payment confirms the top-ranked eligible animal", async () => {
    const repo = createFakeRepo({
      getPledgeDetail: mock(async () =>
        baseDetail({
          status: "provisional",
          currentProof: pendingProof(),
          preferences: [
            {
              id: "pref-1",
              rank: 1,
              animalId: "animal-adopted",
              animalNameSnapshot: "已領養",
              animalState: { ...eligibleState, status: "adopted" },
            },
            {
              id: "pref-2",
              rank: 2,
              animalId: "animal-ok",
              animalNameSnapshot: "小白",
              animalState: eligibleState,
            },
          ],
        }),
      ),
    });
    const service = createSponsorshipAdminService({
      repo,
      client: fakeClient,
      sendPledgeStatusUpdateEmail: createFakeSender().sendPledgeStatusUpdateEmail,
    });

    await service.reviewProof({ actorUserId, pledgeId, input: { decision: "approve" } });

    // Rank 1 is adopted, so the supporter's next choice wins.
    expect(repo.reviewProof).toHaveBeenCalledWith(
      expect.objectContaining({ assignAnimalId: "animal-ok" }),
    );
  });

  test("approving assigns nothing when the pledge already has an assignment", async () => {
    const repo = createFakeRepo({
      getPledgeDetail: mock(async () =>
        baseDetail({
          status: "active",
          currentProof: pendingProof(),
          preferences: [
            {
              id: "pref-1",
              rank: 1,
              animalId: "animal-ok",
              animalNameSnapshot: "小白",
              animalState: eligibleState,
            },
          ],
          assignments: [
            {
              id: "asg-1",
              animalId: "animal-ok",
              animalNameSnapshot: "小白",
              startedOn: "2026-07-01",
              endedOn: null,
              endReason: null,
              note: null,
              reviewReason: null,
            },
          ],
        }),
      ),
    });
    const service = createSponsorshipAdminService({
      repo,
      client: fakeClient,
      sendPledgeStatusUpdateEmail: createFakeSender().sendPledgeStatusUpdateEmail,
    });

    await service.reviewProof({ actorUserId, pledgeId, input: { decision: "approve" } });

    expect(repo.reviewProof).toHaveBeenCalledWith(
      expect.objectContaining({ assignAnimalId: null }),
    );
  });

  test("rejecting a payment confirms no animal", async () => {
    const repo = createFakeRepo({
      getPledgeDetail: mock(async () =>
        baseDetail({
          status: "provisional",
          currentProof: pendingProof(),
          preferences: [
            {
              id: "pref-1",
              rank: 1,
              animalId: "animal-ok",
              animalNameSnapshot: "小白",
              animalState: eligibleState,
            },
          ],
        }),
      ),
    });
    const service = createSponsorshipAdminService({
      repo,
      client: fakeClient,
      sendPledgeStatusUpdateEmail: createFakeSender().sendPledgeStatusUpdateEmail,
    });

    await service.reviewProof({ actorUserId, pledgeId, input: { decision: "reject" } });

    expect(repo.reviewProof).toHaveBeenCalledWith(
      expect.objectContaining({ assignAnimalId: null }),
    );
  });
```

Any existing `preferences: [...]` fixture in this file now needs
`animalState: null` added — `bunx tsc --noEmit` will name each one.

- [ ] **Step 3: Run to verify they fail**

Run: `bun test src/lib/sponsorshipAdmin/service.test.ts -t "confirms"`

Expected: FAIL — `assignAnimalId` is not passed.

- [ ] **Step 4: Implement**

In `src/lib/sponsorshipAdmin/service.ts`, import `selectAutoAssignAnimal` from
`./autoAssign` and add inside `reviewProof`, beside the allocation plan:

```ts
      // Confirm the supporter's animal on the FIRST approval only. "First"
      // means the pledge has never had an assignment: one that was ended
      // because the animal was adopted or died must be replaced by a person,
      // not silently by the next payment.
      const assignAnimalId =
        input.decision === "approve" && detail.assignments.length === 0
          ? (selectAutoAssignAnimal(
              detail.preferences.map((preference) => ({
                rank: preference.rank,
                animalId: preference.animalId,
                animalNameSnapshot: preference.animalNameSnapshot,
                animal: preference.animalState,
              })),
            )?.animalId ?? null)
          : null;
```

and pass `assignAnimalId` in the existing `repo.reviewProof` call.

- [ ] **Step 5: Run the tests and typecheck**

```bash
bun test src/lib/sponsorshipAdmin/
bunx tsc --noEmit
```

Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/sponsorshipAdmin/service.ts src/lib/sponsorshipAdmin/repository.server.ts src/lib/sponsorshipAdmin/types.ts src/lib/sponsorshipAdmin/service.test.ts
git commit -m "feat(sponsorship): pick the supporter's animal when approving the first payment"
```

---

### Task 11: The attention signal

**Files:**
- Modify: `src/lib/sponsorshipAdmin/service.ts`
- Test: `src/lib/sponsorshipAdmin/service.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/lib/sponsorshipAdmin/service.test.ts`:

```ts
  test("getPledgeDetail flags an open assignment whose animal has left", async () => {
    const repo = createFakeRepo({
      getPledgeDetail: mock(async () =>
        baseDetail({
          status: "active",
          assignments: [
            {
              id: "asg-1",
              animalId: "animal-1",
              animalNameSnapshot: "小白",
              startedOn: "2026-07-01",
              endedOn: null,
              endReason: null,
              note: null,
              reviewReason: null,
            },
          ],
          preferences: [
            {
              id: "pref-1",
              rank: 1,
              animalId: "animal-1",
              animalNameSnapshot: "小白",
              animalState: { ...eligibleState, status: "adopted" },
            },
          ],
        }),
      ),
    });
    const service = createSponsorshipAdminService({
      repo,
      client: fakeClient,
      sendPledgeStatusUpdateEmail: createFakeSender().sendPledgeStatusUpdateEmail,
    });

    const detail = await service.getPledgeDetail(pledgeId);

    // Flagging is not ending: the money keeps arriving, and a person decides.
    expect(detail?.assignments[0].reviewReason).toBe("adopted");
  });

  test("getPledgeDetail reports a running sponsorship that backs no animal", async () => {
    // The animal was adopted and staff ended the assignment. The pledge keeps
    // taking payments, so somebody has to talk to the supporter — this is the
    // signal that surfaces it.
    const repo = createFakeRepo({
      getPledgeDetail: mock(async () =>
        baseDetail({
          status: "active",
          assignments: [
            {
              id: "asg-1",
              animalId: "animal-1",
              animalNameSnapshot: "小白",
              startedOn: "2026-07-01",
              endedOn: "2026-08-01",
              endReason: "adopted",
              note: null,
              reviewReason: null,
            },
          ],
        }),
      ),
    });
    const service = createSponsorshipAdminService({
      repo,
      client: fakeClient,
      sendPledgeStatusUpdateEmail: createFakeSender().sendPledgeStatusUpdateEmail,
    });

    const detail = await service.getPledgeDetail(pledgeId);

    expect(detail?.needsAnimal).toBe(true);
  });

  test("getPledgeDetail does not report needsAnimal for a cancelled pledge", async () => {
    // A cancelled sponsorship takes no more payments, so there is nothing to
    // resolve and no task to put in front of staff.
    const repo = createFakeRepo({
      getPledgeDetail: mock(async () => baseDetail({ status: "cancelled", assignments: [] })),
    });
    const service = createSponsorshipAdminService({
      repo,
      client: fakeClient,
      sendPledgeStatusUpdateEmail: createFakeSender().sendPledgeStatusUpdateEmail,
    });

    const detail = await service.getPledgeDetail(pledgeId);

    expect(detail?.needsAnimal).toBe(false);
  });

  test("getPledgeDetail does not flag an assignment whose animal is fine", async () => {
    const repo = createFakeRepo({
      getPledgeDetail: mock(async () =>
        baseDetail({
          status: "active",
          assignments: [
            {
              id: "asg-1",
              animalId: "animal-1",
              animalNameSnapshot: "小白",
              startedOn: "2026-07-01",
              endedOn: null,
              endReason: null,
              note: null,
              reviewReason: null,
            },
          ],
          preferences: [
            {
              id: "pref-1",
              rank: 1,
              animalId: "animal-1",
              animalNameSnapshot: "小白",
              animalState: eligibleState,
            },
          ],
        }),
      ),
    });
    const service = createSponsorshipAdminService({
      repo,
      client: fakeClient,
      sendPledgeStatusUpdateEmail: createFakeSender().sendPledgeStatusUpdateEmail,
    });

    const detail = await service.getPledgeDetail(pledgeId);

    expect(detail?.assignments[0].reviewReason).toBeNull();
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test src/lib/sponsorshipAdmin/service.test.ts -t "has left"`

Expected: FAIL — `reviewReason` is `null`.

- [ ] **Step 3: Implement**

Add to `src/lib/sponsorshipAdmin/service.ts`, above `createSponsorshipAdminService`:

```ts
/**
 * Why an open assignment needs a person to look at it.
 *
 * Derived on every read rather than stored: a flag written at one moment would
 * drift from the animal's real state the instant the CMS changed it.
 *
 * `retired` flags even though retirement is not an automatic end reason —
 * flagging is not ending, and an archived record is worth a look.
 */
function reviewReasonFor(
  animal: CandidateAnimalState | null,
): SponsorshipAssignmentRecord["reviewReason"] {
  if (!animal) return null;
  if (animal.deceasedAt !== null) return "deceased";
  if (animal.status === "adopted") return "adopted";
  if (animal.retiredAt !== null) return "retired";
  if (!animal.sponsorshipEligible) return "ineligible";
  return null;
}
```

importing `CandidateAnimalState` from `./autoAssign` and
`SponsorshipAssignmentRecord` from `./types`.

Then replace the service's `getPledgeDetail` pass-through with:

```ts
    async getPledgeDetail(id: string) {
      const detail = await repo.getPledgeDetail(id);
      if (!detail) return null;

      const stateByAnimal = new Map(
        detail.preferences
          .filter((preference) => preference.animalId !== null)
          .map((preference) => [preference.animalId as string, preference.animalState]),
      );

      const assignments = detail.assignments.map((assignment) =>
        assignment.endedOn !== null || assignment.animalId === null
          ? assignment
          : {
              ...assignment,
              reviewReason: reviewReasonFor(stateByAnimal.get(assignment.animalId) ?? null),
            },
      );

      return {
        ...detail,
        assignments,
        // The second derived signal: a sponsorship that is running but backs
        // no animal. `cancelled` is excluded because it takes no further
        // payments, so there is nothing for staff to resolve.
        needsAnimal:
          detail.status !== "cancelled" &&
          assignments.every((assignment) => assignment.endedOn !== null),
      };
    },
```

- [ ] **Step 4: Run the tests**

Run: `bun test src/lib/sponsorshipAdmin/`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sponsorshipAdmin/service.ts src/lib/sponsorshipAdmin/service.test.ts
git commit -m "feat(sponsorship): flag assignments whose animal has left"
```

---

### Task 12: Copy strings

**Files:**
- Modify: `src/components/admin/adminPageCopy.ts`

- [ ] **Step 1: Add both languages**

In the `zh` sponsorship drawer section, beside `reviewProof`:

```ts
      assignments: {
        title: "已確認助養動物",
        started: "開始日期",
        ended: "結束日期",
        add: "新增動物",
        addPlaceholder: "動物 UUID",
        end: "結束助養關係",
        reasonLabel: "結束原因",
        noteLabel: "備註",
        needsAnimal: "此助養仍在付款，但未有對應動物，請聯絡助養人跟進。",
        reasons: {
          adopted: "已被領養",
          deceased: "已離世",
          ineligible: "已退出助養計劃",
          retired: "紀錄已封存",
          supporter_request: "助養人要求",
          transferred: "轉至其他動物",
          other: "其他",
        },
      },
```

and the matching `en` block:

```ts
      assignments: {
        title: "Confirmed sponsored animals",
        started: "Started",
        ended: "Ended",
        add: "Add animal",
        addPlaceholder: "Animal UUID",
        end: "End sponsorship",
        reasonLabel: "Reason",
        noteLabel: "Note",
        needsAnimal:
          "This sponsorship is still being paid but backs no animal. Please contact the supporter.",
        reasons: {
          adopted: "Adopted",
          deceased: "Passed away",
          ineligible: "Left the sponsorship programme",
          retired: "Record archived",
          supporter_request: "Supporter asked",
          transferred: "Moved to another animal",
          other: "Other",
        },
      },
```

Both are required. The copy object is a bare `as const` with no type annotation,
so a key added only to `zh` compiles fine in this file and fails at the component
that reads it.

- [ ] **Step 2: Typecheck**

Run: `bunx tsc --noEmit`

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/adminPageCopy.ts
git commit -m "feat(sponsorship): add assignment copy in both languages"
```

---

### Task 13: The drawer section

**Files:**
- Modify: `src/components/admin/sponsorship/PledgeDetailDrawer.tsx`

- [ ] **Step 1: Add state and the two actions**

Beside the existing `reviewNote` state:

```tsx
  const [assignAnimalId, setAssignAnimalId] = useState("");
  const [endReason, setEndReason] = useState<AssignmentEndReason>("adopted");
  const [endNote, setEndNote] = useState("");
```

importing `AssignmentEndReason` from `../../../lib/sponsorshipAdmin/types`.

Add the two actions, copying `submitReview`:

```tsx
  async function submitAssign() {
    setSubmitting(true);
    setActionError(null);
    try {
      await fetchCoordinatorJson(`/api/admin/sponsorships/pledges/${pledgeId}/assignments`, {
        method: "POST",
        body: JSON.stringify({ animalId: assignAnimalId }),
      });
      setAssignAnimalId("");
      await refreshAll();
    } catch (submitError) {
      setActionError(submitError instanceof Error ? submitError.message : copy.errors.review);
    } finally {
      setSubmitting(false);
    }
  }

  async function submitEndAssignment(assignmentId: string) {
    setSubmitting(true);
    setActionError(null);
    try {
      await fetchCoordinatorJson(
        `/api/admin/sponsorships/pledges/${pledgeId}/assignments/${assignmentId}/end`,
        {
          method: "POST",
          body: JSON.stringify({ reason: endReason, note: endNote || undefined }),
        },
      );
      setEndNote("");
      await refreshAll();
    } catch (submitError) {
      setActionError(submitError instanceof Error ? submitError.message : copy.errors.review);
    } finally {
      setSubmitting(false);
    }
  }
```

- [ ] **Step 2: Render the section**

Insert immediately before the `{pledge.periods.length > 0 && (` block:

```tsx
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-[var(--color-panel)]">
                {copy.assignments.title}
              </h3>
              <ul className="space-y-2">
                {pledge.assignments.map((assignment) => (
                  <li
                    key={assignment.id}
                    className={`space-y-1 rounded-lg border border-[var(--color-border)] p-3 text-sm ${
                      assignment.endedOn ? "opacity-60" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-[var(--color-panel)]">
                        {assignment.animalNameSnapshot}
                      </span>
                      {assignment.reviewReason && (
                        <StatusPill tone="danger">
                          {copy.assignments.reasons[assignment.reviewReason]}
                        </StatusPill>
                      )}
                    </div>
                    <p className="text-[var(--color-text-muted)]">
                      {copy.assignments.started} {assignment.startedOn}
                      {assignment.endedOn && (
                        <>
                          {" · "}
                          {copy.assignments.ended} {assignment.endedOn}
                          {assignment.endReason && (
                            <> · {copy.assignments.reasons[assignment.endReason]}</>
                          )}
                        </>
                      )}
                    </p>
                    {!assignment.endedOn && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => submitEndAssignment(assignment.id)}
                        disabled={submitting}
                      >
                        {copy.assignments.end}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
              {pledge.needsAnimal && (
                <p className="text-[var(--color-text-muted)]">{copy.assignments.needsAnimal}</p>
              )}
              <div className="flex gap-2">
                <Input
                  value={assignAnimalId}
                  placeholder={copy.assignments.addPlaceholder}
                  onChange={(event) => setAssignAnimalId(event.target.value)}
                />
                <Button
                  type="button"
                  onClick={submitAssign}
                  disabled={submitting || !assignAnimalId}
                >
                  {copy.assignments.add}
                </Button>
              </div>
            </section>
```

The animal picker is deliberately a plain uuid input in this slice. A searchable
picker is a follow-up; it is not what makes the relationship exist.

- [ ] **Step 3: Typecheck, lint and build**

```bash
bunx tsc --noEmit
bun run lint
bun run build
```

Expected: all exit 0. Lint reports only the pre-existing `react-refresh`
warnings; if it reports a `prettier/prettier` error, run
`bunx prettier --write src/components/admin/sponsorship/PledgeDetailDrawer.tsx`
and re-run.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/sponsorship/PledgeDetailDrawer.tsx
git commit -m "feat(sponsorship): show confirmed animals in the pledge drawer"
```

---

### Task 14: RLS tests

**Files:**
- Create: `supabase/rls-tests/sponsorshipAssignment.rls.test.ts`

- [ ] **Step 1: Write the test**

Read `supabase/rls-tests/moneyPii.rls.test.ts` first and copy its harness — the
stack-reachability check, the skip-once warning, the client construction, the
60-second `beforeAll` timeout and the self-healing user setup — rather than
writing a new one. Then assert:

```ts
  test("anon cannot read sponsorship assignments", async () => {
    const { error, data } = await anonClient.from("sponsorship_assignment").select("id").limit(1);
    // Either an explicit error or zero rows is acceptable: RLS default-denies.
    expect(error !== null || (data ?? []).length === 0).toBe(true);
  });

  test("anon cannot insert a sponsorship assignment", async () => {
    const { error } = await anonClient
      .from("sponsorship_assignment")
      .insert({ pledge_id: pledgeId, animal_name_snapshot: "小白" });
    expect(error).not.toBeNull();
  });

  test("an authenticated staff user can read assignments", async () => {
    const { error } = await staffClient.from("sponsorship_assignment").select("id").limit(1);
    expect(error).toBeNull();
  });

  test("even a staff user cannot insert directly - writes go through the RPC", async () => {
    const { error } = await staffClient
      .from("sponsorship_assignment")
      .insert({ pledge_id: pledgeId, animal_name_snapshot: "小白" });
    expect(error).not.toBeNull();
  });
```

- [ ] **Step 2: Run**

Run: `bun run test:rls`

Expected: PASS, with the new file's tests included in the count.

- [ ] **Step 3: Commit**

```bash
git add supabase/rls-tests/sponsorshipAssignment.rls.test.ts
git commit -m "test(rls): cover sponsorship assignment access"
```

---

### Task 15: The §6.4 rehearsal and evidence

**Files:**
- Create: `docs/evidence/hkscda-revision/16-phase3-assignments.md`

- [ ] **Step 1: Reset and run the two-sponsors-one-animal journey**

```bash
bunx supabase db reset --local
```

Then, in one psql session, run this journey and capture the real output:

1. Create one staff user, two supporters, two pledges (HK$100/month each) and
   **one** animal that is `available`, `sponsorship_eligible` and `published`.
2. Give each pledge a rank-1 `sponsorship_preference` naming that same animal.
3. For each pledge: record a first payment proof, then approve it with an
   allocation for the first month **and** that animal id.
4. `select` the assignments — expect **two rows, both naming the same animal**,
   each with a non-null `created_by`.
5. For each pledge: record and approve a second month.
6. Mark the animal adopted (`update public.animals set status='adopted'`).
7. End one pledge's assignment with reason `adopted`.
8. Confirm the other pledge's assignment is still open, and that both pledges
   remain `active` with their months settled.

- [ ] **Step 2: Run every gate**

```bash
bunx tsc --noEmit
bun run lint
bun test --isolate
bun run test:rls
bun run test:db
bun run build
```

Expected: all exit 0. Record the real test counts.

- [ ] **Step 3: Write the evidence document**

Create `docs/evidence/hkscda-revision/16-phase3-assignments.md` following the
shape of `13-phase3-monthly-ledger.md`: what the plan asked for, what was built,
a table of each invariant with the attempt and the **real error text**, the §6.4
journey with its actual output, the gate results with real numbers, and an
explicit "what is NOT done" section.

State plainly that this closes §6.4's relationship half and that **sponsorship
receipts remain unbuilt** — a sponsorship payment still never becomes a
`donation`/`payment` row, so `issue_receipt` cannot fire.

Record that the migration is **not applied to production**, and that it queues
behind the unapplied backlog described in
`14-live-incident-sponsorship-submissions.md`.

- [ ] **Step 4: Commit and push**

```bash
git add docs/evidence/hkscda-revision/16-phase3-assignments.md
git commit -m "docs: record the sponsorship assignment rehearsal and gates"
git push origin feat/hkscda-phase3-sponsorship
```

---

## Follow-ups, deliberately not in this plan

- **The needs-attention indicator in the pledge list.** `PledgeSummary` carries no
  animal data, so a per-row flag needs a join and a widened summary type.
- **A searchable animal picker** in the drawer, replacing the uuid input.
- **Sponsorship receipts** — the remaining half of Phase 3's finance work.
- **The fostered-animal no-op.** `20260911170000` widened the RLS policy to
  publish 65 fostered animals, but `publicListing.ts:19`,
  `publicListing.server.ts:18`, `eligibility.server.ts:14`,
  `publicAnimal.functions.ts:21` and `publicImpact.functions.ts:24` still filter
  `status === "available"`, so those animals remain hidden. Its own small slice.
