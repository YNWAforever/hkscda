# Sponsorship Pledge Admin Review (Slice C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give staff a review workbench to verify/record sponsorship payment proof, approve/reject it, and cancel pledges — the last piece of the `sponsorship_pledge` lifecycle, reachable from the admin dashboard.

**Architecture:** Mirror the adoption coordinator ops workbench file-for-file: a `security definer` RPC trio (`record_sponsorship_payment_proof`, `review_sponsorship_payment_proof`, `cancel_sponsorship_pledge`) with the exact actor-validation + audit-log template from `20260628160000_validate_rpc_actor.sql`; a `src/lib/sponsorshipAdmin/` module (types/repository/service) mirroring `src/lib/adoptions/`; `-handlers.ts`-factored routes under `src/routes/api/admin/sponsorships/pledges*` mirroring `api/admin/adoptions/cases*`; a bilingual lifecycle-status email reusing the existing message-ledger send pattern; a CRM timeline fix so pledge audit rows surface on the supporter page; and a review-lane + drawer UI folded into the existing `助養` admin nav entry via a view toggle.

**Tech Stack:** TypeScript, TanStack Start (file routes + server handlers), React 19, Zod, Supabase (Postgres RPCs + Storage + RLS), Resend, Bun test runner (`bun test`).

Spec: `docs/superpowers/specs/2026-07-03-sponsorship-pledge-admin-review-design.md`.

---

## Plan-Time Notes (grounding vs. the spec)

- The current `section === "sponsor"` branch in `src/routes/admin/index.tsx` has **no special-casing today** — `sponsor` falls into the same `AnimalsTable` branch as `cat`/`dog` (the final `else` at lines 97–104). "Adding a view toggle" therefore means: give `sponsor` its own branch (parallel to the existing `payments`/`applications` special cases) that renders either the existing animals table or the new `PledgeReviewLane`, gated by a client-side toggle, not a URL change (so we don't need a new `searchSchema` value).
- `StatusBadge` (`src/components/admin/StatusBadge.tsx`) requires a `CoordinatorStatus`-shaped object (`color`/`labelZh`/`labelEn`) that pledges do not have (pledges are a plain 5-value text enum, per the spec's explicit "no generic status-category machinery" decision). The sibling `StatusPill` component (tone + children) is the correct fit and is used throughout this plan instead.
- No migration-safety test file exists per-migration; there is one shared `src/lib/supabaseMigrations.test.ts` with one `test(...)` case per migration, asserting literal SQL substrings via `readMigrationBySuffix`/`readMigration`. This plan adds one more case there, following that exact convention.
- Migration timestamp chosen: `20260702183000_sponsorship_pledge_admin_review.sql` (after `20260702130000_sponsorship_pledge_phase_2.sql`, before today 2026-07-03).

---

## File Structure

- `supabase/migrations/20260702183000_sponsorship_pledge_admin_review.sql` — **Create.** Relax `sponsorship_payment_proof.pledge_id` unique → plain index; add `reviewed_by`/`reviewed_at`/`review_note`/`source`; add the 3 RPCs.
- `src/lib/supabaseMigrations.test.ts` — **Modify.** One new migration-safety test case.
- `src/lib/sponsorshipAdmin/types.ts` — **Create.** `PledgeSummary`, `PledgeDetail`, `PaymentProofRecord`, decision input types.
- `src/lib/sponsorshipAdmin/schemas.ts` — **Create.** Zod schemas for record/review/cancel inputs.
- `src/lib/sponsorshipAdmin/schemas.test.ts` — **Create.**
- `src/lib/sponsorshipAdmin/repository.server.ts` — **Create.** RPC wrappers + list/detail selects.
- `src/lib/sponsorshipAdmin/repository.server.test.ts` — **Create.**
- `src/lib/sponsorshipAdmin/service.ts` — **Create.** Validates input, calls repo, triggers lifecycle email.
- `src/lib/sponsorshipAdmin/service.test.ts` — **Create.**
- `src/lib/sponsorshipAdmin/http.server.ts` — **Create.** Handler factory mirroring `src/lib/adoptions/http.server.ts`'s `withErrors`/`jsonResponse`/`requiredUuid` pattern.
- `src/lib/sponsorshipAdmin/http.test.ts` — **Create.**
- `src/routes/api/admin/sponsorships/pledges/-handlers.ts` — **Create.** Wires `requireAdmin` + service into handlers.
- `src/routes/api/admin/sponsorships/pledges.ts` — **Create.** `GET` list.
- `src/routes/api/admin/sponsorships/pledges/$id.ts` — **Create.** `GET` detail.
- `src/routes/api/admin/sponsorships/pledges/$id/proof-url.ts` — **Create.** `GET` signed URL.
- `src/routes/api/admin/sponsorships/pledges/$id/proof.ts` — **Create.** `POST` record proof (multipart).
- `src/routes/api/admin/sponsorships/pledges/$id/review.ts` — **Create.** `POST` review decision.
- `src/routes/api/admin/sponsorships/pledges/$id/cancel.ts` — **Create.** `POST` cancel.
- `src/lib/sponsorship/emailTemplates.server.ts` — **Modify.** Add `renderPledgeStatusUpdateEmail`.
- `src/lib/sponsorship/emailTemplates.server.test.ts` — **Modify.** Add coverage for the new template.
- `src/lib/sponsorshipAdmin/notifications.server.ts` — **Create.** `sendPledgeStatusUpdateEmail`, mirroring `sendPledgeConfirmationEmail`.
- `src/lib/sponsorshipAdmin/notifications.server.test.ts` — **Create.**
- `src/lib/crm/repository.server.ts` — **Modify.** `getSupporterDetail` fetches `sponsorship_pledge` ids and includes them in the `audit_log` `.in("entity_id", ...)` filter.
- `src/lib/crm/repository.server.test.ts` — **Create.** No test file exists for this module today (`getSupporterDetail` is only exercised via fake-repository mocks elsewhere); this adds the first direct test with a fake Supabase client, including the new pledge-audit-row assertion.
- `src/components/admin/sponsorship/pledgeReviewLogic.ts` — **Create.** Pure filter/search param builder, mirroring `caseWorkflowLogic.ts`.
- `src/components/admin/sponsorship/pledgeReviewLogic.test.ts` — **Create.**
- `src/components/admin/sponsorship/PledgeReviewLane.tsx` — **Create.** DataTable list with status filter chips, search, pagination.
- `src/components/admin/sponsorship/PledgeDetailDrawer.tsx` — **Create.** Slide-over with state-dependent actions.
- `src/routes/admin/index.tsx` — **Modify.** `sponsor` section gains a view toggle between `AnimalsTable` and `PledgeReviewLane`.

---

## Task 1: Migration — relax proof uniqueness, add review columns, add the 3 RPCs

**Files:**
- Create: `supabase/migrations/20260702183000_sponsorship_pledge_admin_review.sql`
- Modify: `src/lib/supabaseMigrations.test.ts`

- [ ] **Step 1: Write the failing migration-safety test**

Add this case at the end of the `describe("supabase migration safety", ...)` block in `src/lib/supabaseMigrations.test.ts`, immediately before the block's final closing `});`:

```ts
  test("relaxes proof uniqueness, adds review columns, and adds the 3 admin review RPCs", () => {
    const sql = readMigrationBySuffix("_sponsorship_pledge_admin_review.sql");

    expect(sql).toContain(
      "alter table public.sponsorship_payment_proof drop constraint if exists sponsorship_payment_proof_pledge_id_key",
    );
    expect(sql).toContain(
      "create index if not exists sponsorship_payment_proof_pledge_idx on public.sponsorship_payment_proof (pledge_id)",
    );
    expect(sql).toContain(
      "add column if not exists reviewed_by uuid references public.admin_user(id)",
    );
    expect(sql).toContain("add column if not exists reviewed_at timestamptz");
    expect(sql).toContain("add column if not exists review_note text");
    expect(sql).toContain(
      "add column if not exists source text not null default 'public' check (source in ('public', 'staff'))",
    );

    for (const fn of [
      "record_sponsorship_payment_proof",
      "review_sponsorship_payment_proof",
      "cancel_sponsorship_pledge",
    ]) {
      expect(sql).toContain(`create or replace function public.${fn}(`);
    }

    const guards = sql.match(
      /from public\.admin_user\s*\n\s*where auth_user_id = p_actor_user_id\s*\n\s*and status = 'active'\s*\n\s*and role in \('staff', 'admin'\)/g,
    );
    expect(guards).toHaveLength(3);

    expect(sql).toContain("v_pledge.status not in ('pending_payment', 'needs_followup')");
    expect(sql).toContain("'pending',\n    'staff'");
    expect(sql).toContain("v_pledge.status <> 'provisional'");
    expect(sql).toContain("v_proof.review_status <> 'pending'");
    expect(sql).toContain("v_new_review_status := 'approved';");
    expect(sql).toContain("v_new_pledge_status := 'active';");
    expect(sql).toContain("v_new_review_status := 'rejected';");
    expect(sql).toContain("v_new_pledge_status := 'needs_followup';");
    expect(sql).toMatch(
      /create or replace function public\.cancel_sponsorship_pledge\(\s*\n\s*p_pledge_id uuid,\s*\n\s*p_actor_user_id uuid,\s*\n\s*p_note text\s*\n\)/,
    );

    expect(sql).toMatch(
      /revoke all on function public\.record_sponsorship_payment_proof\([\s\S]*?\) from public;\ngrant execute on function public\.record_sponsorship_payment_proof\([\s\S]*?\) to service_role;/,
    );
    expect(sql).toMatch(
      /revoke all on function public\.review_sponsorship_payment_proof\([\s\S]*?\) from public;\ngrant execute on function public\.review_sponsorship_payment_proof\([\s\S]*?\) to service_role;/,
    );
    expect(sql).toMatch(
      /revoke all on function public\.cancel_sponsorship_pledge\([\s\S]*?\) from public;\ngrant execute on function public\.cancel_sponsorship_pledge\([\s\S]*?\) to service_role;/,
    );
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/lib/supabaseMigrations.test.ts`
Expected: FAIL — `Migration not found: _sponsorship_pledge_admin_review.sql`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260702183000_sponsorship_pledge_admin_review.sql`:

```sql
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

alter table public.sponsorship_payment_proof
  drop constraint if exists sponsorship_payment_proof_pledge_id_key;

create index if not exists sponsorship_payment_proof_pledge_idx
  on public.sponsorship_payment_proof (pledge_id);

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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/lib/supabaseMigrations.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260702183000_sponsorship_pledge_admin_review.sql src/lib/supabaseMigrations.test.ts
git commit -m "feat: add sponsorship pledge admin review RPCs and schema changes"
```

---

## Task 2: `sponsorshipAdmin/types.ts`

**Files:**
- Create: `src/lib/sponsorshipAdmin/types.ts`

This is a pure type file (no runtime logic to TDD); it establishes the vocabulary every later task imports. Written directly, verified by the type-checker when later tasks import it.

- [ ] **Step 1: Write the types file**

Create `src/lib/sponsorshipAdmin/types.ts`:

```ts
export type PledgeStatus =
  | "pending_payment"
  | "provisional"
  | "active"
  | "needs_followup"
  | "cancelled";

export type PledgeAnimalPreference = {
  id: string;
  rank: number;
  animalId: string | null;
  animalNameSnapshot: string;
};

export type PaymentProofRecord = {
  id: string;
  pledgeId: string;
  storagePath: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  paymentMethod: string;
  reference: string | null;
  amountCents: number;
  paymentDate: string;
  reviewStatus: "pending" | "approved" | "rejected";
  source: "public" | "staff";
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
};

export type PledgeAuditEntry = {
  id: string;
  actorUserId: string | null;
  action: string;
  detail: Record<string, unknown>;
  timestamp: string;
};

export type PledgeSummary = {
  id: string;
  supporterId: string;
  supporterName: string;
  supporterEmail: string | null;
  monthlyTier: "100" | "300" | "500" | "custom";
  amountCents: number;
  currency: string;
  language: "zh-HK" | "en";
  status: PledgeStatus;
  createdAt: string;
  updatedAt: string;
};

export type PledgeDetail = PledgeSummary & {
  notes: string | null;
  supporterPhone: string | null;
  preferences: PledgeAnimalPreference[];
  proofHistory: PaymentProofRecord[];
  currentProof: PaymentProofRecord | null;
  recentAuditLog: PledgeAuditEntry[];
};

export type PledgeListSearch = {
  status?: PledgeStatus;
  q?: string;
  page: number;
  pageSize: number;
};

export type RecordPledgePaymentInput = {
  paymentMethod: "fps" | "bank_transfer" | "payme" | "paypal" | "give_asia";
  reference?: string | null;
  amountCents: number;
  paymentDate: string;
  note?: string | null;
  file?: {
    storagePath: string;
    fileName: string;
    fileType: string;
    fileSize: number;
  } | null;
};

export type ReviewPledgeProofInput = {
  decision: "approve" | "reject";
  note?: string | null;
};

export type CancelPledgeInput = {
  note?: string | null;
};
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/sponsorshipAdmin/types.ts
git commit -m "feat: add sponsorshipAdmin types"
```

---

## Task 3: `sponsorshipAdmin/schemas.ts` — input validation

**Files:**
- Create: `src/lib/sponsorshipAdmin/schemas.ts`
- Test: `src/lib/sponsorshipAdmin/schemas.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/sponsorshipAdmin/schemas.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import {
  cancelPledgeSchema,
  pledgeListSearchSchema,
  recordPledgePaymentSchema,
  reviewPledgeProofSchema,
} from "./schemas";

describe("pledgeListSearchSchema", () => {
  test("defaults page and pageSize", () => {
    const result = pledgeListSearchSchema.parse({});
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(25);
    expect(result.status).toBeUndefined();
    expect(result.q).toBeUndefined();
  });

  test("coerces string page/pageSize from query params", () => {
    const result = pledgeListSearchSchema.parse({ page: "2", pageSize: "10" });
    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(10);
  });

  test("accepts a valid status filter", () => {
    const result = pledgeListSearchSchema.parse({ status: "provisional" });
    expect(result.status).toBe("provisional");
  });

  test("rejects an invalid status filter", () => {
    expect(() => pledgeListSearchSchema.parse({ status: "bogus" })).toThrow();
  });
});

describe("recordPledgePaymentSchema", () => {
  function base(overrides: Record<string, unknown> = {}) {
    return {
      paymentMethod: "fps",
      reference: "REF1",
      amountCents: 30000,
      paymentDate: "2026-07-01",
      note: "Recorded from bank statement",
      ...overrides,
    };
  }

  test("accepts a valid payload without a file", () => {
    const result = recordPledgePaymentSchema.parse(base());
    expect(result.amountCents).toBe(30000);
    expect(result.file).toBeUndefined();
  });

  test("accepts a valid payload with file metadata", () => {
    const result = recordPledgePaymentSchema.parse(
      base({
        file: {
          storagePath: "pledge-1/proof.jpg",
          fileName: "proof.jpg",
          fileType: "image/jpeg",
          fileSize: 2048,
        },
      }),
    );
    expect(result.file?.fileName).toBe("proof.jpg");
  });

  test("rejects a non-positive amount", () => {
    expect(() => recordPledgePaymentSchema.parse(base({ amountCents: 0 }))).toThrow();
  });

  test("rejects an invalid payment method", () => {
    expect(() => recordPledgePaymentSchema.parse(base({ paymentMethod: "cash" }))).toThrow();
  });

  test("rejects a malformed payment date", () => {
    expect(() => recordPledgePaymentSchema.parse(base({ paymentDate: "07/01/2026" }))).toThrow();
  });
});

describe("reviewPledgeProofSchema", () => {
  test("accepts approve with no note", () => {
    const result = reviewPledgeProofSchema.parse({ decision: "approve" });
    expect(result.decision).toBe("approve");
    expect(result.note).toBeNull();
  });

  test("accepts reject with a note", () => {
    const result = reviewPledgeProofSchema.parse({ decision: "reject", note: "Blurry receipt" });
    expect(result.note).toBe("Blurry receipt");
  });

  test("rejects an invalid decision", () => {
    expect(() => reviewPledgeProofSchema.parse({ decision: "maybe" })).toThrow();
  });
});

describe("cancelPledgeSchema", () => {
  test("accepts an empty payload", () => {
    const result = cancelPledgeSchema.parse({});
    expect(result.note).toBeNull();
  });

  test("accepts a note", () => {
    const result = cancelPledgeSchema.parse({ note: "Sponsor requested cancellation" });
    expect(result.note).toBe("Sponsor requested cancellation");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/lib/sponsorshipAdmin/schemas.test.ts`
Expected: FAIL — `Cannot find module './schemas'`.

- [ ] **Step 3: Write the schemas**

Create `src/lib/sponsorshipAdmin/schemas.ts`:

```ts
import { z } from "zod";

const trimmed = z.string().trim();
const optionalTrimmedNullable = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || null);

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
const isoDate = trimmed.refine(isIsoDate, "Invalid date");

export const pledgeStatusSchema = z.enum([
  "pending_payment",
  "provisional",
  "active",
  "needs_followup",
  "cancelled",
]);

export const pledgeListSearchSchema = z.object({
  status: pledgeStatusSchema.optional(),
  q: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const paymentMethodSchema = z.enum(["fps", "bank_transfer", "payme", "paypal", "give_asia"]);

export const recordPledgePaymentSchema = z.object({
  paymentMethod: paymentMethodSchema,
  reference: optionalTrimmedNullable,
  amountCents: z.number().int().positive(),
  paymentDate: isoDate,
  note: optionalTrimmedNullable,
  file: z
    .object({
      storagePath: trimmed.min(1),
      fileName: trimmed.min(1).max(180),
      fileType: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]),
      fileSize: z.number().int().positive().max(8 * 1024 * 1024),
    })
    .optional(),
});

export const reviewPledgeProofSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  note: optionalTrimmedNullable,
});

export const cancelPledgeSchema = z.object({
  note: optionalTrimmedNullable,
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/lib/sponsorshipAdmin/schemas.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sponsorshipAdmin/schemas.ts src/lib/sponsorshipAdmin/schemas.test.ts
git commit -m "feat: add sponsorshipAdmin input schemas"
```

---

## Task 4: `sponsorshipAdmin/repository.server.ts` — RPC wrappers + list/detail

**Files:**
- Create: `src/lib/sponsorshipAdmin/repository.server.ts`
- Test: `src/lib/sponsorshipAdmin/repository.server.test.ts`

This mirrors `src/lib/adoptions/repository.server.ts`'s `changeCaseStatus`/`finalizeAdoption` RPC-calling pattern (thin `client.rpc(...)` wrappers that throw on `error`) and its `getCaseDetail` multi-query composition pattern, using the fake-Supabase-client test style from `src/lib/sponsorship/submission.server.test.ts`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/sponsorshipAdmin/repository.server.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseSponsorshipAdminRepository } from "./repository.server";

const pledgeId = "11111111-2222-4333-8444-555555555555";
const actorUserId = "22222222-3333-4333-8444-555555555555";
const proofId = "33333333-4444-4333-8444-555555555555";

type Call = { table?: string; fn?: string; method: string; payload?: unknown };

function pledgeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: pledgeId,
    supporter_id: "supporter-1",
    monthly_tier: "300",
    amount_cents: 30000,
    currency: "HKD",
    language: "zh-HK",
    notes: null,
    status: "provisional",
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

function supporterRow(overrides: Record<string, unknown> = {}) {
  return { id: "supporter-1", name: "陳小姐", email: "chan@example.com", phone: "91234567", ...overrides };
}

function proofRow(overrides: Record<string, unknown> = {}) {
  return {
    id: proofId,
    pledge_id: pledgeId,
    storage_path: `${pledgeId}/proof.jpg`,
    file_name: "proof.jpg",
    file_type: "image/jpeg",
    file_size: 2048,
    payment_method: "fps",
    reference: "REF1",
    amount_cents: 30000,
    payment_date: "2026-07-01",
    review_status: "pending",
    source: "public",
    reviewed_by: null,
    reviewed_at: null,
    review_note: null,
    created_at: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

class FakeQuery {
  private filters: Array<{ column: string; value: unknown }> = [];
  private orderCol: string | null = null;
  private orderAsc = true;
  private rangeBounds: [number, number] | null = null;
  private countMode: string | undefined;

  constructor(
    private readonly state: FakeState,
    private readonly table: string,
  ) {}

  select(_columns: string, options?: { count?: string }) {
    this.state.calls.push({ table: this.table, method: "select" });
    this.countMode = options?.count;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ column, value });
    this.state.calls.push({ table: this.table, method: "eq", payload: { column, value } });
    return this;
  }

  in(column: string, values: unknown[]) {
    this.filters.push({ column, value: values });
    this.state.calls.push({ table: this.table, method: "in", payload: { column, values } });
    return this;
  }

  ilike(column: string, value: unknown) {
    this.filters.push({ column, value });
    return this;
  }

  or() {
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderCol = column;
    this.orderAsc = options?.ascending !== false;
    return this;
  }

  range(from: number, to: number) {
    this.rangeBounds = [from, to];
    return this;
  }

  limit(_n: number) {
    return this;
  }

  private rowsForTable(): Record<string, unknown>[] {
    if (this.table === "sponsorship_pledge") return this.state.pledgeRows;
    if (this.table === "supporter") return this.state.supporterRows;
    if (this.table === "sponsorship_preference") return this.state.preferenceRows;
    if (this.table === "sponsorship_payment_proof") return this.state.proofRows;
    if (this.table === "audit_log") return this.state.auditRows;
    return [];
  }

  private filteredRows() {
    let rows = this.rowsForTable();
    for (const filter of this.filters) {
      rows = rows.filter((row) => {
        if (Array.isArray(filter.value)) return filter.value.includes(row[filter.column]);
        return row[filter.column] === filter.value;
      });
    }
    if (this.orderCol) {
      rows = [...rows].sort((left, right) => {
        const l = String(left[this.orderCol as string]);
        const r = String(right[this.orderCol as string]);
        return this.orderAsc ? l.localeCompare(r) : r.localeCompare(l);
      });
    }
    return rows;
  }

  async maybeSingle() {
    const rows = this.filteredRows();
    return { data: rows[0] ?? null, error: null };
  }

  then<T1 = unknown, T2 = never>(
    onfulfilled?: ((value: unknown) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ) {
    let rows = this.filteredRows();
    const total = rows.length;
    if (this.rangeBounds) rows = rows.slice(this.rangeBounds[0], this.rangeBounds[1] + 1);
    const result = { data: rows, error: null, count: this.countMode ? total : null };
    return Promise.resolve(result).then(onfulfilled, onrejected);
  }
}

type FakeState = {
  calls: Call[];
  pledgeRows: Record<string, unknown>[];
  supporterRows: Record<string, unknown>[];
  preferenceRows: Record<string, unknown>[];
  proofRows: Record<string, unknown>[];
  auditRows: Record<string, unknown>[];
  rpcError: Error | null;
  rpcResult: unknown;
};

function createFakeClient(overrides: Partial<FakeState> = {}) {
  const state: FakeState = {
    calls: [],
    pledgeRows: [pledgeRow()],
    supporterRows: [supporterRow()],
    preferenceRows: [],
    proofRows: [proofRow()],
    auditRows: [],
    rpcError: null,
    rpcResult: null,
    ...overrides,
  };

  const client = {
    from(table: string) {
      return new FakeQuery(state, table);
    },
    async rpc(fn: string, payload: unknown) {
      state.calls.push({ fn, method: "rpc", payload });
      if (state.rpcError) return { data: null, error: state.rpcError };
      return { data: state.rpcResult, error: null };
    },
  };

  return { client: client as unknown as SupabaseClient, state };
}

describe("createSupabaseSponsorshipAdminRepository", () => {
  test("recordPayment calls record_sponsorship_payment_proof with mapped params", async () => {
    const { client, state } = createFakeClient();
    const repo = createSupabaseSponsorshipAdminRepository(client);

    await repo.recordPayment({
      pledgeId,
      actorUserId,
      storagePath: `${pledgeId}/proof.jpg`,
      fileName: "proof.jpg",
      fileType: "image/jpeg",
      fileSize: 2048,
      paymentMethod: "fps",
      reference: "REF1",
      amountCents: 30000,
      paymentDate: "2026-07-01",
      note: "Recorded manually",
    });

    const call = state.calls.find((c) => c.fn === "record_sponsorship_payment_proof");
    expect(call?.payload).toEqual({
      p_pledge_id: pledgeId,
      p_actor_user_id: actorUserId,
      p_storage_path: `${pledgeId}/proof.jpg`,
      p_file_name: "proof.jpg",
      p_file_type: "image/jpeg",
      p_file_size: 2048,
      p_payment_method: "fps",
      p_reference: "REF1",
      p_amount_cents: 30000,
      p_payment_date: "2026-07-01",
      p_note: "Recorded manually",
    });
  });

  test("recordPayment throws when the RPC errors", async () => {
    const { client } = createFakeClient({ rpcError: new Error("boom") });
    const repo = createSupabaseSponsorshipAdminRepository(client);

    await expect(
      repo.recordPayment({
        pledgeId,
        actorUserId,
        storagePath: "x",
        fileName: "x",
        fileType: "image/jpeg",
        fileSize: 1,
        paymentMethod: "fps",
        reference: null,
        amountCents: 1,
        paymentDate: "2026-07-01",
        note: null,
      }),
    ).rejects.toThrow("boom");
  });

  test("reviewProof calls review_sponsorship_payment_proof with mapped params", async () => {
    const { client, state } = createFakeClient();
    const repo = createSupabaseSponsorshipAdminRepository(client);

    await repo.reviewProof({ pledgeId, decision: "approve", actorUserId, note: "Looks good" });

    const call = state.calls.find((c) => c.fn === "review_sponsorship_payment_proof");
    expect(call?.payload).toEqual({
      p_pledge_id: pledgeId,
      p_decision: "approve",
      p_actor_user_id: actorUserId,
      p_note: "Looks good",
    });
  });

  test("cancelPledge calls cancel_sponsorship_pledge with mapped params", async () => {
    const { client, state } = createFakeClient();
    const repo = createSupabaseSponsorshipAdminRepository(client);

    await repo.cancelPledge({ pledgeId, actorUserId, note: "Sponsor asked to cancel" });

    const call = state.calls.find((c) => c.fn === "cancel_sponsorship_pledge");
    expect(call?.payload).toEqual({
      p_pledge_id: pledgeId,
      p_actor_user_id: actorUserId,
      p_note: "Sponsor asked to cancel",
    });
  });

  test("listPledges returns mapped summaries and total", async () => {
    const { client } = createFakeClient({
      pledgeRows: [pledgeRow(), pledgeRow({ id: "pledge-2", supporter_id: "supporter-2" })],
      supporterRows: [supporterRow(), supporterRow({ id: "supporter-2", name: "李先生" })],
    });
    const repo = createSupabaseSponsorshipAdminRepository(client);

    const result = await repo.listPledges({ page: 1, pageSize: 25 });
    expect(result.total).toBe(2);
    expect(result.pledges).toHaveLength(2);
    expect(result.pledges[0].supporterName).toBe("陳小姐");
  });

  test("listPledges filters by status", async () => {
    const { client } = createFakeClient({
      pledgeRows: [pledgeRow({ status: "active" }), pledgeRow({ id: "pledge-2", status: "cancelled" })],
    });
    const repo = createSupabaseSponsorshipAdminRepository(client);

    const result = await repo.listPledges({ status: "active", page: 1, pageSize: 25 });
    expect(result.pledges).toHaveLength(1);
    expect(result.pledges[0].status).toBe("active");
  });

  test("getPledgeDetail returns null when not found", async () => {
    const { client } = createFakeClient({ pledgeRows: [] });
    const repo = createSupabaseSponsorshipAdminRepository(client);

    expect(await repo.getPledgeDetail("missing-id")).toBeNull();
  });

  test("getPledgeDetail composes preferences, proof history, and audit log", async () => {
    const { client } = createFakeClient({
      preferenceRows: [
        {
          id: "pref-1",
          pledge_id: pledgeId,
          rank: 1,
          sponsor_animal_id: "animal-1",
          animal_name_snapshot: "白雪",
        },
      ],
      proofRows: [proofRow()],
      auditRows: [
        {
          id: "audit-1",
          actor_user_id: actorUserId,
          action: "sponsorship_pledge.proof_recorded",
          entity_id: pledgeId,
          detail: {},
          timestamp: "2026-07-01T00:00:00.000Z",
        },
      ],
    });
    const repo = createSupabaseSponsorshipAdminRepository(client);

    const detail = await repo.getPledgeDetail(pledgeId);
    expect(detail?.preferences).toHaveLength(1);
    expect(detail?.currentProof?.id).toBe(proofId);
    expect(detail?.proofHistory).toHaveLength(1);
    expect(detail?.recentAuditLog).toHaveLength(1);
  });

  test("getProofSigningInfo returns the current proof's storage location", async () => {
    const { client } = createFakeClient({ proofRows: [proofRow()] });
    const repo = createSupabaseSponsorshipAdminRepository(client);

    const info = await repo.getProofSigningInfo(pledgeId);
    expect(info).toEqual({
      storagePath: `${pledgeId}/proof.jpg`,
      fileName: "proof.jpg",
    });
  });

  test("getProofSigningInfo returns null when there is no proof", async () => {
    const { client } = createFakeClient({ proofRows: [] });
    const repo = createSupabaseSponsorshipAdminRepository(client);

    expect(await repo.getProofSigningInfo(pledgeId)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/lib/sponsorshipAdmin/repository.server.test.ts`
Expected: FAIL — `Cannot find module './repository.server'`.

- [ ] **Step 3: Write the repository**

Create `src/lib/sponsorshipAdmin/repository.server.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  CancelPledgeInput,
  PaymentProofRecord,
  PledgeAnimalPreference,
  PledgeAuditEntry,
  PledgeDetail,
  PledgeListSearch,
  PledgeSummary,
  RecordPledgePaymentInput,
  ReviewPledgeProofInput,
} from "./types";

type PledgeRow = {
  id: string;
  supporter_id: string;
  monthly_tier: PledgeSummary["monthlyTier"];
  amount_cents: number;
  currency: string;
  language: PledgeSummary["language"];
  notes: string | null;
  status: PledgeSummary["status"];
  created_at: string;
  updated_at: string;
};

type SupporterRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
};

type PreferenceRow = {
  id: string;
  pledge_id: string;
  rank: number;
  sponsor_animal_id: string | null;
  animal_name_snapshot: string;
};

type ProofRow = {
  id: string;
  pledge_id: string;
  storage_path: string;
  file_name: string;
  file_type: string;
  file_size: number;
  payment_method: string;
  reference: string | null;
  amount_cents: number;
  payment_date: string;
  review_status: PaymentProofRecord["reviewStatus"];
  source: PaymentProofRecord["source"];
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
};

type AuditRow = {
  id: string;
  actor_user_id: string | null;
  action: string;
  entity_id: string;
  detail: Record<string, unknown> | null;
  timestamp: string;
};

function escapeLike(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.filter(Boolean) as string[])];
}

function mapProof(row: ProofRow): PaymentProofRecord {
  return {
    id: row.id,
    pledgeId: row.pledge_id,
    storagePath: row.storage_path,
    fileName: row.file_name,
    fileType: row.file_type,
    fileSize: row.file_size,
    paymentMethod: row.payment_method,
    reference: row.reference,
    amountCents: row.amount_cents,
    paymentDate: row.payment_date,
    reviewStatus: row.review_status,
    source: row.source,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    reviewNote: row.review_note,
    createdAt: row.created_at,
  };
}

function mapPreference(row: PreferenceRow): PledgeAnimalPreference {
  return {
    id: row.id,
    rank: row.rank,
    animalId: row.sponsor_animal_id,
    animalNameSnapshot: row.animal_name_snapshot,
  };
}

function mapAudit(row: AuditRow): PledgeAuditEntry {
  return {
    id: row.id,
    actorUserId: row.actor_user_id,
    action: row.action,
    detail: row.detail ?? {},
    timestamp: row.timestamp,
  };
}

function mapSummary(row: PledgeRow, supporters: Map<string, SupporterRow>): PledgeSummary {
  const supporter = supporters.get(row.supporter_id);
  return {
    id: row.id,
    supporterId: row.supporter_id,
    supporterName: supporter?.name ?? row.supporter_id,
    supporterEmail: supporter?.email ?? null,
    monthlyTier: row.monthly_tier,
    amountCents: row.amount_cents,
    currency: row.currency,
    language: row.language,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function loadSupportersByIds(client: SupabaseClient, ids: string[]) {
  const uniqueIds = unique(ids);
  if (uniqueIds.length === 0) return new Map<string, SupporterRow>();

  const { data, error } = await client
    .from("supporter")
    .select("id,name,email,phone")
    .in("id", uniqueIds);
  if (error) throw error;

  return new Map(((data ?? []) as SupporterRow[]).map((row) => [row.id, row]));
}

export type SponsorshipAdminRepository = {
  listPledges(
    input: PledgeListSearch,
  ): Promise<{ pledges: PledgeSummary[]; total: number }>;
  getPledgeDetail(id: string): Promise<PledgeDetail | null>;
  getProofSigningInfo(
    pledgeId: string,
  ): Promise<{ storagePath: string; fileName: string } | null>;
  recordPayment(
    input: RecordPledgePaymentInput & {
      pledgeId: string;
      actorUserId: string;
      storagePath: string;
      fileName: string;
      fileType: string;
      fileSize: number;
    },
  ): Promise<{ id: string }>;
  reviewProof(
    input: ReviewPledgeProofInput & { pledgeId: string; actorUserId: string },
  ): Promise<void>;
  cancelPledge(
    input: CancelPledgeInput & { pledgeId: string; actorUserId: string },
  ): Promise<void>;
};

export function createSupabaseSponsorshipAdminRepository(
  client: SupabaseClient,
): SponsorshipAdminRepository {
  return {
    async listPledges(input) {
      const from = (input.page - 1) * input.pageSize;
      let query = client
        .from("sponsorship_pledge")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, from + input.pageSize - 1);

      if (input.status) query = query.eq("status", input.status);

      const { data, error, count } = await query;
      if (error) throw error;

      const rows = (data ?? []) as PledgeRow[];
      const supporters = await loadSupportersByIds(
        client,
        rows.map((row) => row.supporter_id),
      );

      let summaries = rows.map((row) => mapSummary(row, supporters));

      if (input.q) {
        const q = input.q.trim().toLowerCase();
        summaries = summaries.filter(
          (summary) =>
            summary.supporterName.toLowerCase().includes(q) ||
            (summary.supporterEmail ?? "").toLowerCase().includes(q) ||
            summary.id.toLowerCase().includes(q),
        );
      }

      return { pledges: summaries, total: count ?? summaries.length };
    },

    async getPledgeDetail(id) {
      const { data: pledgeData, error: pledgeError } = await client
        .from("sponsorship_pledge")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (pledgeError) throw pledgeError;
      if (!pledgeData) return null;

      const row = pledgeData as PledgeRow;

      const [supporters, preferencesResult, proofResult, auditResult] = await Promise.all([
        loadSupportersByIds(client, [row.supporter_id]),
        client
          .from("sponsorship_preference")
          .select("*")
          .eq("pledge_id", id)
          .order("rank", { ascending: true }),
        client
          .from("sponsorship_payment_proof")
          .select("*")
          .eq("pledge_id", id)
          .order("created_at", { ascending: false }),
        client
          .from("audit_log")
          .select("id,actor_user_id,action,entity_id,detail,timestamp")
          .eq("entity_id", id)
          .order("timestamp", { ascending: false })
          .limit(20),
      ]);
      if (preferencesResult.error) throw preferencesResult.error;
      if (proofResult.error) throw proofResult.error;
      if (auditResult.error) throw auditResult.error;

      const preferences = ((preferencesResult.data ?? []) as PreferenceRow[]).map(mapPreference);
      const proofRows = (proofResult.data ?? []) as ProofRow[];
      const proofHistory = proofRows.map(mapProof);
      const auditLog = ((auditResult.data ?? []) as AuditRow[]).map(mapAudit);

      return {
        ...mapSummary(row, supporters),
        notes: row.notes,
        supporterPhone: supporters.get(row.supporter_id)?.phone ?? null,
        preferences,
        proofHistory,
        currentProof: proofHistory[0] ?? null,
        recentAuditLog: auditLog,
      } satisfies PledgeDetail;
    },

    async getProofSigningInfo(pledgeId) {
      const { data, error } = await client
        .from("sponsorship_payment_proof")
        .select("storage_path,file_name")
        .eq("pledge_id", pledgeId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;

      const row = data as Pick<ProofRow, "storage_path" | "file_name">;
      return { storagePath: row.storage_path, fileName: row.file_name };
    },

    async recordPayment(input) {
      const { data, error } = await client.rpc("record_sponsorship_payment_proof", {
        p_pledge_id: input.pledgeId,
        p_actor_user_id: input.actorUserId,
        p_storage_path: input.storagePath,
        p_file_name: input.fileName,
        p_file_type: input.fileType,
        p_file_size: input.fileSize,
        p_payment_method: input.paymentMethod,
        p_reference: input.reference ?? null,
        p_amount_cents: input.amountCents,
        p_payment_date: input.paymentDate,
        p_note: input.note ?? null,
      });
      if (error) throw error;
      return { id: data as string };
    },

    async reviewProof(input) {
      const { error } = await client.rpc("review_sponsorship_payment_proof", {
        p_pledge_id: input.pledgeId,
        p_decision: input.decision,
        p_actor_user_id: input.actorUserId,
        p_note: input.note ?? null,
      });
      if (error) throw error;
    },

    async cancelPledge(input) {
      const { error } = await client.rpc("cancel_sponsorship_pledge", {
        p_pledge_id: input.pledgeId,
        p_actor_user_id: input.actorUserId,
        p_note: input.note ?? null,
      });
      if (error) throw error;
    },
  };
}
```

Note: `escapeLike` is imported by convention with the adoption repository but unused directly here since search filtering happens in-memory after the paginated fetch (matching the spec's "searchable by supporter name/email/reference" requirement without a cross-table SQL `.or()`, since supporter name/email live in a different table than the paginated one). Remove the unused `escapeLike` helper if the linter flags it as dead code — keep only `unique`.

- [ ] **Step 4: Remove the unused `escapeLike` helper**

Delete the `escapeLike` function from `src/lib/sponsorshipAdmin/repository.server.ts` (it is not called anywhere in this file) so `bun run lint` / `tsc` don't flag it as unused.

- [ ] **Step 5: Run the test to verify it passes**

Run: `bun test src/lib/sponsorshipAdmin/repository.server.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/sponsorshipAdmin/repository.server.ts src/lib/sponsorshipAdmin/repository.server.test.ts
git commit -m "feat: add sponsorshipAdmin repository RPC wrappers and queries"
```

---

## Task 5: `sponsorship/emailTemplates.server.ts` — add `renderPledgeStatusUpdateEmail`

**Files:**
- Modify: `src/lib/sponsorship/emailTemplates.server.ts`
- Modify: `src/lib/sponsorship/emailTemplates.server.test.ts`

- [ ] **Step 1: Write the failing test**

First read the existing `src/lib/sponsorship/emailTemplates.server.test.ts` to append in the same style (it already tests `renderPledgeConfirmationEmail`). Append this `describe` block at the end of the file:

```ts
describe("renderPledgeStatusUpdateEmail", () => {
  function baseInput(overrides: Record<string, unknown> = {}) {
    return {
      event: "active" as const,
      language: "zh-HK" as const,
      supporterName: "陳小姐",
      reference: "SP-ABCDEF12",
      amountCents: 30000,
      ...overrides,
    };
  }

  test("renders the proof_recorded event bilingually", () => {
    const zh = renderPledgeStatusUpdateEmail(baseInput({ event: "proof_recorded" }));
    expect(zh.subject).toContain("SP-ABCDEF12");
    expect(zh.html).toContain("陳小姐");

    const en = renderPledgeStatusUpdateEmail(
      baseInput({ event: "proof_recorded", language: "en", supporterName: "Ms. Chan" }),
    );
    expect(en.html).toContain("Ms. Chan");
  });

  test("renders the active event", () => {
    const email = renderPledgeStatusUpdateEmail(baseInput({ event: "active" }));
    expect(email.html).toContain("HK$300");
  });

  test("renders the needs_followup event with a mailto fallback", () => {
    const zh = renderPledgeStatusUpdateEmail(baseInput({ event: "needs_followup" }));
    expect(zh.html).toContain("mailto:");
    expect(zh.html).toContain("SP-ABCDEF12");

    const en = renderPledgeStatusUpdateEmail(
      baseInput({ event: "needs_followup", language: "en" }),
    );
    expect(en.html).toContain("mailto:");
  });

  test("renders the cancelled event", () => {
    const email = renderPledgeStatusUpdateEmail(baseInput({ event: "cancelled" }));
    expect(email.subject).toContain("SP-ABCDEF12");
  });

  test("escapes HTML in supporter name and reference", () => {
    const email = renderPledgeStatusUpdateEmail(
      baseInput({ supporterName: '<script>alert(1)</script>', reference: "SP-<b>X</b>" }),
    );
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/lib/sponsorship/emailTemplates.server.test.ts`
Expected: FAIL — `renderPledgeStatusUpdateEmail is not defined` (not exported yet).

- [ ] **Step 3: Add the new template function**

Add this to the end of `src/lib/sponsorship/emailTemplates.server.ts` (keep the existing `renderPledgeConfirmationEmail` and its helpers unchanged):

```ts
export type PledgeStatusUpdateEvent = "proof_recorded" | "active" | "needs_followup" | "cancelled";

type PledgeStatusUpdateEmailInput = {
  event: PledgeStatusUpdateEvent;
  language: "zh-HK" | "en";
  supporterName: string;
  reference: string;
  amountCents: number;
};

const SUPPORT_EMAIL = "info@hkscda.com";

function pledgeStatusUpdateBodyZh(event: PledgeStatusUpdateEvent, reference: string, amount: string) {
  switch (event) {
    case "proof_recorded":
      return `<p>我們已為您的助養承諾（參考編號 <strong>${reference}</strong>）記錄付款資料，將盡快為您審核。</p>`;
    case "active":
      return `<p>多謝您！您每月 <strong>${amount}</strong> 的助養承諾（參考編號 <strong>${reference}</strong>）已確認生效。</p>`;
    case "needs_followup":
      return [
        `<p>您的助養承諾（參考編號 <strong>${reference}</strong>）的付款資料需要跟進，未能確認。</p>`,
        `<p>請重新提交付款證明，或電郵至 <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a> 查詢，並註明參考編號。</p>`,
      ].join("");
    case "cancelled":
      return `<p>您的助養承諾（參考編號 <strong>${reference}</strong>）已取消。如有疑問歡迎聯絡我們。</p>`;
  }
}

function pledgeStatusUpdateBodyEn(event: PledgeStatusUpdateEvent, reference: string, amount: string) {
  switch (event) {
    case "proof_recorded":
      return `<p>We have recorded a payment for your sponsorship pledge <strong>${reference}</strong> and will review it shortly.</p>`;
    case "active":
      return `<p>Thank you! Your <strong>${amount}</strong>/month sponsorship pledge <strong>${reference}</strong> is now confirmed and active.</p>`;
    case "needs_followup":
      return [
        `<p>We were unable to confirm the payment for your sponsorship pledge <strong>${reference}</strong>.</p>`,
        `<p>Please resubmit your payment proof, or email <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a> quoting your reference.</p>`,
      ].join("");
    case "cancelled":
      return `<p>Your sponsorship pledge <strong>${reference}</strong> has been cancelled. Please contact us if you have any questions.</p>`;
  }
}

const PLEDGE_STATUS_SUBJECT_ZH: Record<PledgeStatusUpdateEvent, string> = {
  proof_recorded: "HKSCDA 已收到您的付款記錄",
  active: "HKSCDA 助養已確認生效",
  needs_followup: "HKSCDA 助養付款需要跟進",
  cancelled: "HKSCDA 助養承諾已取消",
};

const PLEDGE_STATUS_SUBJECT_EN: Record<PledgeStatusUpdateEvent, string> = {
  proof_recorded: "HKSCDA recorded your sponsorship payment",
  active: "HKSCDA sponsorship confirmed",
  needs_followup: "HKSCDA sponsorship payment needs follow-up",
  cancelled: "HKSCDA sponsorship pledge cancelled",
};

export function renderPledgeStatusUpdateEmail(input: PledgeStatusUpdateEmailInput) {
  const supporterName = escapeHtml(input.supporterName);
  const reference = escapeHtml(input.reference);
  const amount = centsToHkd(input.amountCents);

  if (input.language === "en") {
    return {
      subject: `${PLEDGE_STATUS_SUBJECT_EN[input.event]} ${input.reference}`,
      html: [
        `<p>Dear ${supporterName},</p>`,
        pledgeStatusUpdateBodyEn(input.event, reference, amount),
        "<p>HKSCDA Sponsorship Team</p>",
      ].join(""),
    };
  }

  return {
    subject: `${PLEDGE_STATUS_SUBJECT_ZH[input.event]} ${input.reference}`,
    html: [
      `<p>${supporterName} 您好：</p>`,
      pledgeStatusUpdateBodyZh(input.event, reference, amount),
      "<p>HKSCDA 助養團隊</p>",
    ].join(""),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/lib/sponsorship/emailTemplates.server.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sponsorship/emailTemplates.server.ts src/lib/sponsorship/emailTemplates.server.test.ts
git commit -m "feat: add pledge status update email template"
```

---

## Task 6: `sponsorshipAdmin/notifications.server.ts` — `sendPledgeStatusUpdateEmail`

**Files:**
- Create: `src/lib/sponsorshipAdmin/notifications.server.ts`
- Test: `src/lib/sponsorshipAdmin/notifications.server.test.ts`

Mirrors `sendPledgeConfirmationEmail` in `src/lib/sponsorship/submission.server.ts` (lines 355-421): queue a `message` row, attempt send, update to `sent`/`failed`, never throw.

- [ ] **Step 1: Write the failing test**

Create `src/lib/sponsorshipAdmin/notifications.server.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import { sendPledgeStatusUpdateEmail } from "./notifications.server";

type QueryCall = { table: string; method: string; payload?: unknown };

class FakeQuery {
  private mutationPayload: unknown;

  constructor(
    private readonly state: { calls: QueryCall[] },
    private readonly table: string,
  ) {}

  insert(payload: unknown) {
    this.state.calls.push({ table: this.table, method: "insert", payload });
    this.mutationPayload = payload;
    return this;
  }

  update(payload: unknown) {
    this.state.calls.push({ table: this.table, method: "update", payload });
    this.mutationPayload = payload;
    return this;
  }

  eq(column: string, value: unknown) {
    this.state.calls.push({ table: this.table, method: "eq", payload: { column, value } });
    return this;
  }

  select(columns: string) {
    this.state.calls.push({ table: this.table, method: "select", payload: columns });
    return this;
  }

  async single() {
    if (this.table === "message") return { data: { id: "message-1" }, error: null };
    return { data: this.mutationPayload, error: null };
  }

  then<T1 = unknown, T2 = never>(
    onfulfilled?: ((value: unknown) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ) {
    return Promise.resolve({ data: this.mutationPayload, error: null }).then(onfulfilled, onrejected);
  }
}

function createFakeClient() {
  const state = { calls: [] as QueryCall[] };
  const client = {
    from(table: string) {
      return new FakeQuery(state, table);
    },
  };
  return { client: client as never, state };
}

describe("sendPledgeStatusUpdateEmail", () => {
  function baseArgs(overrides: Record<string, unknown> = {}) {
    return {
      event: "active" as const,
      language: "zh-HK" as const,
      supporterId: "supporter-1",
      supporterEmail: "chan@example.com",
      supporterName: "陳小姐",
      reference: "SP-ABCDEF12",
      amountCents: 30000,
      ...overrides,
    };
  }

  test("queues the email and returns 'queued' with no Resend key configured", async () => {
    const { client } = createFakeClient();
    const result = await sendPledgeStatusUpdateEmail(client, baseArgs(), {
      getEmailConfig: () => ({
        resendApiKey: undefined,
        from: "HKSCDA <noreply@hkscda.com>",
        replyTo: "info@hkscda.com",
        notificationEmail: "info@hkscda.com",
      }),
    });
    expect(result).toBe("queued");
  });

  test("returns 'sent' when the email sender succeeds", async () => {
    const { client, state } = createFakeClient();
    const result = await sendPledgeStatusUpdateEmail(client, baseArgs(), {
      getEmailConfig: () => ({
        resendApiKey: "key",
        from: "HKSCDA <noreply@hkscda.com>",
        replyTo: "info@hkscda.com",
        notificationEmail: "info@hkscda.com",
      }),
      createEmailSender: () => ({ send: async () => ({}) }),
    });
    expect(result).toBe("sent");
    expect(state.calls.some((c) => c.table === "message" && c.method === "insert")).toBe(true);
  });

  test("returns 'failed' when the email sender throws", async () => {
    const { client } = createFakeClient();
    const result = await sendPledgeStatusUpdateEmail(client, baseArgs(), {
      getEmailConfig: () => ({
        resendApiKey: "key",
        from: "HKSCDA <noreply@hkscda.com>",
        replyTo: "info@hkscda.com",
        notificationEmail: "info@hkscda.com",
      }),
      createEmailSender: () => ({
        send: async () => {
          throw new Error("network down");
        },
      }),
      logger: { error: () => {} },
    });
    expect(result).toBe("failed");
  });

  test("sets the message payload supporter_id so it surfaces in the CRM timeline", async () => {
    const { client, state } = createFakeClient();
    await sendPledgeStatusUpdateEmail(client, baseArgs({ supporterId: "supporter-42" }), {
      getEmailConfig: () => ({
        resendApiKey: undefined,
        from: "HKSCDA <noreply@hkscda.com>",
        replyTo: "info@hkscda.com",
        notificationEmail: "info@hkscda.com",
      }),
    });
    const insertCall = state.calls.find((c) => c.table === "message" && c.method === "insert");
    expect((insertCall?.payload as { supporter_id: string }).supporter_id).toBe("supporter-42");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/lib/sponsorshipAdmin/notifications.server.test.ts`
Expected: FAIL — `Cannot find module './notifications.server'`.

- [ ] **Step 3: Write the notifications module**

Create `src/lib/sponsorshipAdmin/notifications.server.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  renderPledgeStatusUpdateEmail,
  type PledgeStatusUpdateEvent,
} from "../sponsorship/emailTemplates.server";
import { getEmailConfig } from "../donations/config.server";

type EmailConfig = ReturnType<typeof getEmailConfig>;

type EmailSender = {
  send(payload: {
    from: string;
    to: string;
    replyTo?: string;
    subject: string;
    html: string;
  }): Promise<unknown>;
};

async function defaultCreateEmailSender(apiKey: string): Promise<EmailSender> {
  const { Resend } = await import("resend");
  return new Resend(apiKey).emails;
}

export type SendPledgeStatusUpdateEmailArgs = {
  event: PledgeStatusUpdateEvent;
  language: "zh-HK" | "en";
  supporterId: string;
  supporterEmail: string;
  supporterName: string;
  reference: string;
  amountCents: number;
};

type SendPledgeStatusUpdateEmailDeps = {
  getEmailConfig?: () => EmailConfig;
  createEmailSender?: (apiKey: string) => Promise<EmailSender> | EmailSender;
  logger?: Pick<Console, "error">;
};

export type PledgeStatusUpdateEmailResult = "queued" | "sent" | "failed";

export async function sendPledgeStatusUpdateEmail(
  client: SupabaseClient,
  args: SendPledgeStatusUpdateEmailArgs,
  {
    getEmailConfig: loadEmailConfig = getEmailConfig,
    createEmailSender = defaultCreateEmailSender,
    logger = console,
  }: SendPledgeStatusUpdateEmailDeps = {},
): Promise<PledgeStatusUpdateEmailResult> {
  const config = loadEmailConfig();
  const email = renderPledgeStatusUpdateEmail({
    event: args.event,
    language: args.language,
    supporterName: args.supporterName,
    reference: args.reference,
    amountCents: args.amountCents,
  });

  const messagePayload = {
    kind: "sponsorship_pledge_status_update",
    event: args.event,
    reference: args.reference,
    subject: email.subject,
    entityType: "sponsorship_pledge",
  };

  const { data: message, error: messageError } = await client
    .from("message")
    .insert({
      supporter_id: args.supporterId,
      channel: "email",
      status: "queued",
      payload: messagePayload,
    })
    .select("id")
    .single();
  if (messageError || !message) {
    logger.error("Failed to queue sponsorship pledge status update email", messageError);
    return "failed";
  }

  const messageId = (message as { id: string }).id;
  if (!config.resendApiKey) return "queued";

  try {
    const emails = await createEmailSender(config.resendApiKey);
    await emails.send({
      from: config.from,
      to: args.supporterEmail,
      replyTo: config.replyTo,
      subject: email.subject,
      html: email.html,
    });
  } catch (error) {
    logger.error("Failed to send sponsorship pledge status update email", error);
    await client.from("message").update({ status: "failed" }).eq("id", messageId);
    return "failed";
  }

  await client
    .from("message")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", messageId);
  return "sent";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/lib/sponsorshipAdmin/notifications.server.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sponsorshipAdmin/notifications.server.ts src/lib/sponsorshipAdmin/notifications.server.test.ts
git commit -m "feat: add sponsorship pledge status update email sender"
```

---

## Task 7: `sponsorshipAdmin/service.ts` — validation + orchestration

**Files:**
- Create: `src/lib/sponsorshipAdmin/service.ts`
- Test: `src/lib/sponsorshipAdmin/service.test.ts`

Mirrors `src/lib/adoptions/service.ts`'s `changeCaseStatus` method (parse input with zod, validate state, call repo, no email in that particular method — but here we add the best-effort email call after the DB transition, per the spec's "email failure never rolls back the transition" rule).

- [ ] **Step 1: Write the failing test**

Create `src/lib/sponsorshipAdmin/service.test.ts`:

```ts
import { describe, expect, mock, test } from "bun:test";

import { createSponsorshipAdminService } from "./service";
import type { PledgeDetail } from "./types";
import type { SponsorshipAdminRepository as Repo } from "./repository.server";

const pledgeId = "11111111-2222-4333-8444-555555555555";
const actorUserId = "22222222-3333-4333-8444-555555555555";

function baseDetail(overrides: Partial<PledgeDetail> = {}): PledgeDetail {
  return {
    id: pledgeId,
    supporterId: "supporter-1",
    supporterName: "陳小姐",
    supporterEmail: "chan@example.com",
    monthlyTier: "300",
    amountCents: 30000,
    currency: "HKD",
    language: "zh-HK",
    status: "provisional",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    notes: null,
    supporterPhone: null,
    preferences: [],
    proofHistory: [],
    currentProof: null,
    recentAuditLog: [],
    ...overrides,
  };
}

function createFakeRepo(overrides: Partial<Repo> = {}): Repo {
  return {
    listPledges: mock(async () => ({ pledges: [], total: 0 })),
    getPledgeDetail: mock(async () => baseDetail()),
    getProofSigningInfo: mock(async () => null),
    recordPayment: mock(async () => ({ id: "proof-1" })),
    reviewProof: mock(async () => {}),
    cancelPledge: mock(async () => {}),
    ...overrides,
  } as Repo;
}

function createFakeSender() {
  const calls: unknown[] = [];
  return {
    calls,
    sendPledgeStatusUpdateEmail: mock(async (...args: unknown[]) => {
      calls.push(args);
      return "sent" as const;
    }),
  };
}

describe("createSponsorshipAdminService", () => {
  test("listPledges parses search input and delegates to the repository", async () => {
    const repo = createFakeRepo();
    const service = createSponsorshipAdminService({ repo, sendPledgeStatusUpdateEmail: createFakeSender().sendPledgeStatusUpdateEmail });

    await service.listPledges({ status: "active", page: "2", pageSize: "10" });

    expect(repo.listPledges).toHaveBeenCalledWith({
      status: "active",
      q: undefined,
      page: 2,
      pageSize: 10,
    });
  });

  test("getPledgeDetail returns null when the repository returns null", async () => {
    const repo = createFakeRepo({ getPledgeDetail: mock(async () => null) });
    const service = createSponsorshipAdminService({
      repo,
      sendPledgeStatusUpdateEmail: createFakeSender().sendPledgeStatusUpdateEmail,
    });

    expect(await service.getPledgeDetail(pledgeId)).toBeNull();
  });

  test("recordPayment rejects when the pledge is not pending_payment or needs_followup", async () => {
    const repo = createFakeRepo({
      getPledgeDetail: mock(async () => baseDetail({ status: "active" })),
    });
    const service = createSponsorshipAdminService({
      repo,
      sendPledgeStatusUpdateEmail: createFakeSender().sendPledgeStatusUpdateEmail,
    });

    await expect(
      service.recordPayment({
        actorUserId,
        pledgeId,
        input: {
          paymentMethod: "fps",
          amountCents: 30000,
          paymentDate: "2026-07-01",
        },
      }),
    ).rejects.toThrow("Sponsorship pledge is not eligible for a recorded payment");
    expect(repo.recordPayment).not.toHaveBeenCalled();
  });

  test("recordPayment calls the repository and sends the proof_recorded email", async () => {
    const repo = createFakeRepo({
      getPledgeDetail: mock(async () => baseDetail({ status: "pending_payment" })),
    });
    const sender = createFakeSender();
    const service = createSponsorshipAdminService({
      repo,
      sendPledgeStatusUpdateEmail: sender.sendPledgeStatusUpdateEmail,
    });

    await service.recordPayment({
      actorUserId,
      pledgeId,
      input: {
        paymentMethod: "fps",
        reference: "REF1",
        amountCents: 30000,
        paymentDate: "2026-07-01",
        note: "Recorded manually",
      },
    });

    expect(repo.recordPayment).toHaveBeenCalled();
    expect(sender.sendPledgeStatusUpdateEmail).toHaveBeenCalled();
  });

  test("reviewProof rejects when the pledge is not provisional", async () => {
    const repo = createFakeRepo({
      getPledgeDetail: mock(async () => baseDetail({ status: "active" })),
    });
    const service = createSponsorshipAdminService({
      repo,
      sendPledgeStatusUpdateEmail: createFakeSender().sendPledgeStatusUpdateEmail,
    });

    await expect(
      service.reviewProof({ actorUserId, pledgeId, input: { decision: "approve" } }),
    ).rejects.toThrow("Sponsorship pledge is not awaiting review");
    expect(repo.reviewProof).not.toHaveBeenCalled();
  });

  test("reviewProof approve calls the repository and sends the active email", async () => {
    const repo = createFakeRepo({
      getPledgeDetail: mock(async () => baseDetail({ status: "provisional" })),
    });
    const sender = createFakeSender();
    const service = createSponsorshipAdminService({
      repo,
      sendPledgeStatusUpdateEmail: sender.sendPledgeStatusUpdateEmail,
    });

    await service.reviewProof({ actorUserId, pledgeId, input: { decision: "approve" } });

    expect(repo.reviewProof).toHaveBeenCalledWith({
      pledgeId,
      actorUserId,
      decision: "approve",
      note: null,
    });
    const call = sender.calls[0] as [unknown, { event: string }];
    expect(call[1].event).toBe("active");
  });

  test("reviewProof reject sends the needs_followup email", async () => {
    const repo = createFakeRepo({
      getPledgeDetail: mock(async () => baseDetail({ status: "provisional" })),
    });
    const sender = createFakeSender();
    const service = createSponsorshipAdminService({
      repo,
      sendPledgeStatusUpdateEmail: sender.sendPledgeStatusUpdateEmail,
    });

    await service.reviewProof({
      actorUserId,
      pledgeId,
      input: { decision: "reject", note: "Blurry" },
    });

    const call = sender.calls[0] as [unknown, { event: string }];
    expect(call[1].event).toBe("needs_followup");
  });

  test("cancelPledge rejects an already-cancelled pledge", async () => {
    const repo = createFakeRepo({
      getPledgeDetail: mock(async () => baseDetail({ status: "cancelled" })),
    });
    const service = createSponsorshipAdminService({
      repo,
      sendPledgeStatusUpdateEmail: createFakeSender().sendPledgeStatusUpdateEmail,
    });

    await expect(
      service.cancelPledge({ actorUserId, pledgeId, input: {} }),
    ).rejects.toThrow("Sponsorship pledge is already cancelled");
    expect(repo.cancelPledge).not.toHaveBeenCalled();
  });

  test("cancelPledge calls the repository and sends the cancelled email", async () => {
    const repo = createFakeRepo({
      getPledgeDetail: mock(async () => baseDetail({ status: "active" })),
    });
    const sender = createFakeSender();
    const service = createSponsorshipAdminService({
      repo,
      sendPledgeStatusUpdateEmail: sender.sendPledgeStatusUpdateEmail,
    });

    await service.cancelPledge({ actorUserId, pledgeId, input: { note: "Sponsor left" } });

    expect(repo.cancelPledge).toHaveBeenCalledWith({
      pledgeId,
      actorUserId,
      note: "Sponsor left",
    });
    const call = sender.calls[0] as [unknown, { event: string }];
    expect(call[1].event).toBe("cancelled");
  });

  test("email failure does not throw or roll back the already-committed transition", async () => {
    const repo = createFakeRepo({
      getPledgeDetail: mock(async () => baseDetail({ status: "active" })),
    });
    const service = createSponsorshipAdminService({
      repo,
      sendPledgeStatusUpdateEmail: mock(async () => {
        throw new Error("email provider down");
      }),
    });

    await expect(
      service.cancelPledge({ actorUserId, pledgeId, input: {} }),
    ).resolves.toBeUndefined();
    expect(repo.cancelPledge).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/lib/sponsorshipAdmin/service.test.ts`
Expected: FAIL — `Cannot find module './service'`.

- [ ] **Step 3: Write the service**

Create `src/lib/sponsorshipAdmin/service.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

import type { SponsorshipAdminRepository } from "./repository.server";
import {
  cancelPledgeSchema,
  pledgeListSearchSchema,
  recordPledgePaymentSchema,
  reviewPledgeProofSchema,
} from "./schemas";
import type { PledgeDetail } from "./types";
import type { SendPledgeStatusUpdateEmailArgs } from "./notifications.server";

type SendPledgeStatusUpdateEmail = (
  client: SupabaseClient,
  args: SendPledgeStatusUpdateEmailArgs,
) => Promise<unknown>;

export type CreateSponsorshipAdminServiceArgs = {
  repo: SponsorshipAdminRepository;
  sendPledgeStatusUpdateEmail: SendPledgeStatusUpdateEmail;
  client?: SupabaseClient;
  logger?: Pick<Console, "error">;
};

function requirePledge(detail: PledgeDetail | null): PledgeDetail {
  if (!detail) throw new Error("Sponsorship pledge not found");
  return detail;
}

export function createSponsorshipAdminService({
  repo,
  sendPledgeStatusUpdateEmail,
  client,
  logger = console,
}: CreateSponsorshipAdminServiceArgs) {
  async function notify(detail: PledgeDetail, event: SendPledgeStatusUpdateEmailArgs["event"]) {
    if (!detail.supporterEmail) return;
    try {
      await sendPledgeStatusUpdateEmail(client as SupabaseClient, {
        event,
        language: detail.language,
        supporterId: detail.supporterId,
        supporterEmail: detail.supporterEmail,
        supporterName: detail.supporterName,
        reference: detail.id,
        amountCents: detail.amountCents,
      });
    } catch (error) {
      logger.error("Failed to send sponsorship pledge status update email", error);
    }
  }

  return {
    async listPledges(rawSearch: unknown) {
      const search = pledgeListSearchSchema.parse(rawSearch);
      return repo.listPledges(search);
    },

    async getPledgeDetail(id: string) {
      return repo.getPledgeDetail(id);
    },

    async getProofSigningInfo(id: string) {
      return repo.getProofSigningInfo(id);
    },

    async recordPayment(args: { actorUserId: string; pledgeId: string; input: unknown }) {
      const input = recordPledgePaymentSchema.parse(args.input);
      const detail = requirePledge(await repo.getPledgeDetail(args.pledgeId));
      if (!["pending_payment", "needs_followup"].includes(detail.status)) {
        throw new Error("Sponsorship pledge is not eligible for a recorded payment");
      }

      const result = await repo.recordPayment({
        pledgeId: args.pledgeId,
        actorUserId: args.actorUserId,
        storagePath: input.file?.storagePath ?? "",
        fileName: input.file?.fileName ?? "",
        fileType: input.file?.fileType ?? "",
        fileSize: input.file?.fileSize ?? 0,
        paymentMethod: input.paymentMethod,
        reference: input.reference ?? null,
        amountCents: input.amountCents,
        paymentDate: input.paymentDate,
        note: input.note ?? null,
      });

      await notify(detail, "proof_recorded");
      return result;
    },

    async reviewProof(args: { actorUserId: string; pledgeId: string; input: unknown }) {
      const input = reviewPledgeProofSchema.parse(args.input);
      const detail = requirePledge(await repo.getPledgeDetail(args.pledgeId));
      if (detail.status !== "provisional") {
        throw new Error("Sponsorship pledge is not awaiting review");
      }
      if (!detail.currentProof || detail.currentProof.reviewStatus !== "pending") {
        throw new Error("Sponsorship pledge has no proof pending review");
      }

      await repo.reviewProof({
        pledgeId: args.pledgeId,
        actorUserId: args.actorUserId,
        decision: input.decision,
        note: input.note ?? null,
      });

      await notify(detail, input.decision === "approve" ? "active" : "needs_followup");
    },

    async cancelPledge(args: { actorUserId: string; pledgeId: string; input: unknown }) {
      const input = cancelPledgeSchema.parse(args.input);
      const detail = requirePledge(await repo.getPledgeDetail(args.pledgeId));
      if (detail.status === "cancelled") {
        throw new Error("Sponsorship pledge is already cancelled");
      }

      await repo.cancelPledge({
        pledgeId: args.pledgeId,
        actorUserId: args.actorUserId,
        note: input.note ?? null,
      });

      await notify(detail, "cancelled");
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/lib/sponsorshipAdmin/service.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sponsorshipAdmin/service.ts src/lib/sponsorshipAdmin/service.test.ts
git commit -m "feat: add sponsorshipAdmin service validation and orchestration"
```

---

## Task 8: `sponsorshipAdmin/http.server.ts` — handler factory

**Files:**
- Create: `src/lib/sponsorshipAdmin/http.server.ts`
- Test: `src/lib/sponsorshipAdmin/http.test.ts`

Mirrors `src/lib/adoptions/http.server.ts`'s `jsonResponse`/`requiredUuid`/`withErrors`/`domainError` pattern, adapted to the sponsorship-admin domain error strings.

- [ ] **Step 1: Write the failing test**

Create `src/lib/sponsorshipAdmin/http.test.ts`:

```ts
import { describe, expect, mock, test } from "bun:test";

import { createSponsorshipAdminHandlers } from "./http.server";

const pledgeId = "11111111-2222-4333-8444-555555555555";
const admin = { id: "admin-1", authUserId: "auth-1", email: "a@b.com", role: "staff" as const, status: "active" as const };

function createService(overrides: Record<string, unknown> = {}) {
  return {
    listPledges: mock(async () => ({ pledges: [], total: 0 })),
    getPledgeDetail: mock(async () => null),
    getProofSigningInfo: mock(async () => null),
    recordPayment: mock(async () => ({ id: "proof-1" })),
    reviewProof: mock(async () => {}),
    cancelPledge: mock(async () => {}),
    ...overrides,
  };
}

function requireCoordinator() {
  return async () => admin;
}

function request(url: string, init?: RequestInit) {
  return new Request(url, init);
}

describe("createSponsorshipAdminHandlers", () => {
  test("listPledges returns 200 with the service payload", async () => {
    const service = createService({
      listPledges: mock(async () => ({ pledges: [{ id: pledgeId }], total: 1 })),
    });
    const handlers = createSponsorshipAdminHandlers({
      requireCoordinator: requireCoordinator(),
      service: service as never,
    });

    const response = await handlers.listPledges({
      request: request("http://localhost/api/admin/sponsorships/pledges?status=active"),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.total).toBe(1);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  test("getPledge returns 404 when the service returns null", async () => {
    const service = createService();
    const handlers = createSponsorshipAdminHandlers({
      requireCoordinator: requireCoordinator(),
      service: service as never,
    });

    const response = await handlers.getPledge({
      request: request("http://localhost/api/admin/sponsorships/pledges/" + pledgeId),
      params: { id: pledgeId },
    });
    expect(response.status).toBe(404);
  });

  test("getPledge returns 400 for a non-uuid id", async () => {
    const service = createService();
    const handlers = createSponsorshipAdminHandlers({
      requireCoordinator: requireCoordinator(),
      service: service as never,
    });

    const response = await handlers.getPledge({
      request: request("http://localhost/api/admin/sponsorships/pledges/not-a-uuid"),
      params: { id: "not-a-uuid" },
    });
    expect(response.status).toBe(400);
  });

  test("reviewProof maps a conflict domain error to 409", async () => {
    const service = createService({
      reviewProof: mock(async () => {
        throw new Error("Sponsorship pledge is not awaiting review");
      }),
    });
    const handlers = createSponsorshipAdminHandlers({
      requireCoordinator: requireCoordinator(),
      service: service as never,
    });

    const response = await handlers.reviewProof({
      request: request("http://localhost/x", {
        method: "POST",
        body: JSON.stringify({ decision: "approve" }),
      }),
      params: { id: pledgeId },
    });
    expect(response.status).toBe(409);
  });

  test("recordPayment maps a bad-request domain error to 400", async () => {
    const service = createService({
      recordPayment: mock(async () => {
        throw new Error("Sponsorship pledge is not eligible for a recorded payment");
      }),
    });
    const handlers = createSponsorshipAdminHandlers({
      requireCoordinator: requireCoordinator(),
      service: service as never,
    });

    const response = await handlers.recordPayment({
      request: request("http://localhost/x", {
        method: "POST",
        body: JSON.stringify({ paymentMethod: "fps", amountCents: 1, paymentDate: "2026-07-01" }),
      }),
      params: { id: pledgeId },
    });
    expect(response.status).toBe(400);
  });

  test("cancelPledge returns 200 ok on success", async () => {
    const service = createService();
    const handlers = createSponsorshipAdminHandlers({
      requireCoordinator: requireCoordinator(),
      service: service as never,
    });

    const response = await handlers.cancelPledge({
      request: request("http://localhost/x", { method: "POST", body: JSON.stringify({}) }),
      params: { id: pledgeId },
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
  });

  test("requireCoordinator failure propagates its Response status", async () => {
    const service = createService();
    const handlers = createSponsorshipAdminHandlers({
      requireCoordinator: async () => {
        throw new Response("Forbidden", { status: 403 });
      },
      service: service as never,
    });

    const response = await handlers.listPledges({
      request: request("http://localhost/api/admin/sponsorships/pledges"),
    });
    expect(response.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/lib/sponsorshipAdmin/http.test.ts`
Expected: FAIL — `Cannot find module './http.server'`.

- [ ] **Step 3: Write the handler factory**

Create `src/lib/sponsorshipAdmin/http.server.ts`:

```ts
import { z } from "zod";

import type { AdminUser } from "../donations/supabase.server";
import type { createSponsorshipAdminService } from "./service";

type SponsorshipAdminService = ReturnType<typeof createSponsorshipAdminService>;

type HandlerContext = {
  request: Request;
  params?: Record<string, string | undefined>;
};

type CreateSponsorshipAdminHandlersArgs = {
  requireCoordinator: (request: Request) => Promise<AdminUser>;
  service: SponsorshipAdminService;
};

function jsonResponse(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("cache-control", "no-store");
  return Response.json(body, { ...init, headers });
}

async function jsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    throw jsonResponse({ error: "Invalid JSON body" }, { status: 400 });
  }
}

function requiredUuid(params: HandlerContext["params"], key: string) {
  const value = params?.[key];
  if (!value || !z.string().uuid().safeParse(value).success) {
    throw jsonResponse({ error: `Invalid ${key}` }, { status: 400 });
  }
  return value;
}

const notFoundDomainErrors = new Set(["Sponsorship pledge not found"]);

const conflictDomainErrors = new Set([
  "Sponsorship pledge is not eligible for a recorded payment",
  "Sponsorship pledge is not awaiting review",
  "Sponsorship pledge has no proof pending review",
  "Sponsorship pledge is already cancelled",
]);

async function responseError(error: Response) {
  const status = error.status;
  const contentType = error.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    try {
      const body = await error.clone().json();
      if (body && typeof body === "object") return jsonResponse(body, { status });
    } catch {
      // Fall through to text/status normalization.
    }
  }

  let message = "";
  try {
    message = (await error.clone().text()).trim();
  } catch {
    message = "";
  }

  return jsonResponse({ error: message || error.statusText || "Request failed" }, { status });
}

function domainError(error: Error) {
  if (notFoundDomainErrors.has(error.message)) {
    return jsonResponse({ error: error.message }, { status: 404 });
  }
  if (conflictDomainErrors.has(error.message)) {
    return jsonResponse({ error: error.message }, { status: 409 });
  }
  return null;
}

async function withErrors(operation: () => Promise<Response>) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof Response) return responseError(error);
    if (error instanceof z.ZodError) {
      return jsonResponse({ error: "Invalid sponsorship review request" }, { status: 400 });
    }
    if (error instanceof Error) {
      const response = domainError(error);
      if (response) return response;
    }

    console.error(error);
    return jsonResponse({ error: "Could not process sponsorship review request" }, { status: 500 });
  }
}

export function createSponsorshipAdminHandlers({
  requireCoordinator,
  service,
}: CreateSponsorshipAdminHandlersArgs) {
  return {
    listPledges({ request }: HandlerContext) {
      return withErrors(async () => {
        await requireCoordinator(request);
        const search = Object.fromEntries(new URL(request.url).searchParams);
        return jsonResponse(await service.listPledges(search));
      });
    },

    getPledge({ request, params }: HandlerContext) {
      return withErrors(async () => {
        const pledgeId = requiredUuid(params, "id");
        await requireCoordinator(request);
        const pledge = await service.getPledgeDetail(pledgeId);
        if (!pledge) {
          return jsonResponse({ error: "Sponsorship pledge not found" }, { status: 404 });
        }
        return jsonResponse({ pledge });
      });
    },

    getProofUrl({ request, params }: HandlerContext) {
      return withErrors(async () => {
        const pledgeId = requiredUuid(params, "id");
        await requireCoordinator(request);
        const url = await service.getProofSigningInfo(pledgeId);
        if (!url) {
          return jsonResponse({ error: "Payment proof not found" }, { status: 404 });
        }
        return jsonResponse(url);
      });
    },

    recordPayment({ request, params }: HandlerContext) {
      return withErrors(async () => {
        const pledgeId = requiredUuid(params, "id");
        const admin = await requireCoordinator(request);
        const result = await service.recordPayment({
          actorUserId: admin.authUserId,
          pledgeId,
          input: await jsonBody(request),
        });
        return jsonResponse({ proof: result }, { status: 201 });
      });
    },

    reviewProof({ request, params }: HandlerContext) {
      return withErrors(async () => {
        const pledgeId = requiredUuid(params, "id");
        const admin = await requireCoordinator(request);
        await service.reviewProof({
          actorUserId: admin.authUserId,
          pledgeId,
          input: await jsonBody(request),
        });
        return jsonResponse({ ok: true });
      });
    },

    cancelPledge({ request, params }: HandlerContext) {
      return withErrors(async () => {
        const pledgeId = requiredUuid(params, "id");
        const admin = await requireCoordinator(request);
        await service.cancelPledge({
          actorUserId: admin.authUserId,
          pledgeId,
          input: await jsonBody(request),
        });
        return jsonResponse({ ok: true });
      });
    },
  };
}
```

Note: `getProofSigningInfo` on the service simply delegates to the repository method of the same name (already added to `service.ts` in Task 7).

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/lib/sponsorshipAdmin/http.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sponsorshipAdmin/http.server.ts src/lib/sponsorshipAdmin/http.test.ts
git commit -m "feat: add sponsorshipAdmin HTTP handler factory"
```

---

## Task 9: Route wiring — `-handlers.ts` and list/detail/cancel/review routes

**Files:**
- Create: `src/routes/api/admin/sponsorships/pledges/-handlers.ts`
- Create: `src/routes/api/admin/sponsorships/pledges.ts`
- Create: `src/routes/api/admin/sponsorships/pledges/$id.ts`
- Create: `src/routes/api/admin/sponsorships/pledges/$id/review.ts`
- Create: `src/routes/api/admin/sponsorships/pledges/$id/cancel.ts`

These are thin file-route wrappers with no independent logic to unit-test (matching `src/routes/api/admin/adoptions/cases.ts` and `cases/$id/status.ts`, which have no dedicated test files — coverage comes from the `http.test.ts` handler tests plus manual/E2E verification). Written directly.

- [ ] **Step 1: Write the handlers factory**

Create `src/routes/api/admin/sponsorships/pledges/-handlers.ts`:

```ts
import { createSponsorshipAdminHandlers } from "../../../../../lib/sponsorshipAdmin/http.server";
import { createSupabaseSponsorshipAdminRepository } from "../../../../../lib/sponsorshipAdmin/repository.server";
import { createSponsorshipAdminService } from "../../../../../lib/sponsorshipAdmin/service";
import { sendPledgeStatusUpdateEmail } from "../../../../../lib/sponsorshipAdmin/notifications.server";
import {
  createSupabaseServiceClient,
  requireAdmin,
} from "../../../../../lib/donations/supabase.server";

export function createHandlers() {
  const client = createSupabaseServiceClient();
  const service = createSponsorshipAdminService({
    repo: createSupabaseSponsorshipAdminRepository(client),
    sendPledgeStatusUpdateEmail,
    client,
  });

  return createSponsorshipAdminHandlers({
    requireCoordinator: (request) => requireAdmin(request, ["staff", "admin"], client),
    service,
  });
}
```

- [ ] **Step 2: Write the list route**

Create `src/routes/api/admin/sponsorships/pledges.ts`:

```ts
import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "./pledges/-handlers";

export const Route = createFileRoute("/api/admin/sponsorships/pledges")({
  server: {
    handlers: {
      GET: ({ request }) => createHandlers().listPledges({ request }),
    },
  },
});
```

- [ ] **Step 3: Write the detail route**

Create `src/routes/api/admin/sponsorships/pledges/$id.ts`:

```ts
import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "./-handlers";

export const Route = createFileRoute("/api/admin/sponsorships/pledges/$id")({
  server: {
    handlers: {
      GET: ({ request, params }) => createHandlers().getPledge({ request, params }),
    },
  },
});
```

- [ ] **Step 4: Write the review route**

Create `src/routes/api/admin/sponsorships/pledges/$id/review.ts`:

```ts
import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "../-handlers";

export const Route = createFileRoute("/api/admin/sponsorships/pledges/$id/review")({
  server: {
    handlers: {
      POST: ({ request, params }) => createHandlers().reviewProof({ request, params }),
    },
  },
});
```

- [ ] **Step 5: Write the cancel route**

Create `src/routes/api/admin/sponsorships/pledges/$id/cancel.ts`:

```ts
import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "../-handlers";

export const Route = createFileRoute("/api/admin/sponsorships/pledges/$id/cancel")({
  server: {
    handlers: {
      POST: ({ request, params }) => createHandlers().cancelPledge({ request, params }),
    },
  },
});
```

- [ ] **Step 6: Type-check the new routes**

Run: `bunx tsc --noEmit -p tsconfig.json`
Expected: no new errors from the 5 new files (TanStack Router's file-based routing regenerates `routeTree.gen.ts` automatically on `bun run dev`/`bun run build`; if a stale `routeTree.gen.ts` causes a "route not found" type error, run `bun run build` once locally to force regeneration, then re-run `tsc`).

- [ ] **Step 7: Commit**

```bash
git add src/routes/api/admin/sponsorships/pledges.ts src/routes/api/admin/sponsorships/pledges/-handlers.ts src/routes/api/admin/sponsorships/pledges/\$id.ts src/routes/api/admin/sponsorships/pledges/\$id/review.ts src/routes/api/admin/sponsorships/pledges/\$id/cancel.ts
git commit -m "feat: wire sponsorship pledge admin list/detail/review/cancel routes"
```

---

## Task 10: Proof-url route (signed URL) and proof-record route (multipart)

**Files:**
- Create: `src/routes/api/admin/sponsorships/pledges/$id/proof-url.ts`
- Create: `src/routes/api/admin/sponsorships/pledges/$id/proof.ts`

The proof-url route is copied directly from `src/routes/api/admin/adoptions/applications/$applicationId/photos/$photoId.ts`'s signed-URL pattern (`requireAdmin` + `createSignedUrl(path, 60, {download: fileName})`), adapted to read from `sponsorship_payment_proof` (most recent row) instead of `adoption_application_photo`. The proof-record route parses multipart form data using the same `validateProofDescriptor`/`MAX_PROOF_BYTES`/`PROOF_MIME_TYPES` helpers from `src/lib/sponsorship/schemas.ts`, uploads to the existing `sponsorship-payment-proof` bucket, then calls the service.

- [ ] **Step 1: Write the proof-url route**

Create `src/routes/api/admin/sponsorships/pledges/$id/proof-url.ts`:

```ts
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import {
  createSupabaseServiceClient,
  requireAdmin,
} from "../../../../../../lib/donations/supabase.server";

const paramsSchema = z.object({ id: z.string().uuid() });

const SPONSORSHIP_PROOF_BUCKET = "sponsorship-payment-proof";

type ProofStorageRow = {
  storage_path: string;
  file_name: string;
};

function jsonResponse(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("cache-control", "no-store");
  return Response.json(body, { ...init, headers });
}

async function responseError(error: Response) {
  const status = error.status;
  const contentType = error.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    try {
      const body = await error.clone().json();
      if (body && typeof body === "object") return jsonResponse(body, { status });
    } catch {
      // Fall through to text/status normalization.
    }
  }

  let message = "";
  try {
    message = (await error.clone().text()).trim();
  } catch {
    message = "";
  }

  return jsonResponse({ error: message || error.statusText || "Request failed" }, { status });
}

async function withProofErrors(operation: () => Promise<Response>) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof Response) return responseError(error);
    if (error instanceof z.ZodError) {
      return jsonResponse({ error: "Invalid pledge request" }, { status: 400 });
    }

    console.error(error);
    return jsonResponse({ error: "Could not create proof link" }, { status: 500 });
  }
}

async function getProofUrl({
  request,
  params,
}: {
  request: Request;
  params: { id: string };
}) {
  return withProofErrors(async () => {
    const { id } = paramsSchema.parse(params);
    const client = createSupabaseServiceClient();
    await requireAdmin(request, ["staff", "admin"], client);

    const { data: proof, error } = await client
      .from("sponsorship_payment_proof")
      .select("storage_path,file_name")
      .eq("pledge_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!proof) return jsonResponse({ error: "Payment proof not found" }, { status: 404 });

    const row = proof as ProofStorageRow;
    const { data: signed, error: signedError } = await client.storage
      .from(SPONSORSHIP_PROOF_BUCKET)
      .createSignedUrl(row.storage_path, 60, { download: row.file_name });
    if (signedError) throw signedError;

    return jsonResponse({ url: signed.signedUrl });
  });
}

export const Route = createFileRoute("/api/admin/sponsorships/pledges/$id/proof-url")({
  server: {
    handlers: {
      GET: ({ request, params }) => getProofUrl({ request, params }),
    },
  },
});
```

- [ ] **Step 2: Write the proof-record (multipart) route**

Create `src/routes/api/admin/sponsorships/pledges/$id/proof.ts`:

```ts
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { validateProofDescriptor } from "../../../../../../lib/sponsorship/schemas";
import { SPONSORSHIP_PROOF_BUCKET } from "../../../../../../lib/sponsorship/submission.server";
import {
  createSupabaseServiceClient,
  requireAdmin,
} from "../../../../../../lib/donations/supabase.server";
import { createSupabaseSponsorshipAdminRepository } from "../../../../../../lib/sponsorshipAdmin/repository.server";
import { createSponsorshipAdminService } from "../../../../../../lib/sponsorshipAdmin/service";
import { sendPledgeStatusUpdateEmail } from "../../../../../../lib/sponsorshipAdmin/notifications.server";

const paramsSchema = z.object({ id: z.string().uuid() });

function jsonResponse(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("cache-control", "no-store");
  return Response.json(body, { ...init, headers });
}

function safeFileName(fileName: string) {
  const baseName = fileName.split(/[\\/]/).pop()?.trim() || "proof";
  return baseName.replace(/[^A-Za-z0-9._-]/g, "_");
}

async function responseError(error: Response) {
  const status = error.status;
  const contentType = error.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    try {
      const body = await error.clone().json();
      if (body && typeof body === "object") return jsonResponse(body, { status });
    } catch {
      // Fall through to text/status normalization.
    }
  }

  let message = "";
  try {
    message = (await error.clone().text()).trim();
  } catch {
    message = "";
  }

  return jsonResponse({ error: message || error.statusText || "Request failed" }, { status });
}

const conflictDomainErrors = new Set([
  "Sponsorship pledge is not eligible for a recorded payment",
]);

const notFoundDomainErrors = new Set(["Sponsorship pledge not found"]);

async function recordPayment({
  request,
  params,
}: {
  request: Request;
  params: { id: string };
}) {
  try {
    const { id } = paramsSchema.parse(params);
    const client = createSupabaseServiceClient();
    const admin = await requireAdmin(request, ["staff", "admin"], client);

    const formData = await request.formData();
    const payloadValue = formData.get("payload");
    if (typeof payloadValue !== "string") {
      return jsonResponse({ error: "Missing payment payload" }, { status: 400 });
    }

    const payload = JSON.parse(payloadValue) as {
      paymentMethod: string;
      reference?: string | null;
      amountCents: number;
      paymentDate: string;
      note?: string | null;
    };

    const fileValue = formData.get("file");
    let file: { storagePath: string; fileName: string; fileType: string; fileSize: number } | undefined;

    if (fileValue instanceof File) {
      const descriptor = validateProofDescriptor({
        fileName: fileValue.name,
        mimeType: fileValue.type,
        sizeBytes: fileValue.size,
      });
      const storagePath = `${id}/staff-${Date.now()}-${safeFileName(descriptor.fileName)}`;
      const upload = await client.storage
        .from(SPONSORSHIP_PROOF_BUCKET)
        .upload(storagePath, fileValue, { contentType: descriptor.mimeType, upsert: false });
      if (upload.error) throw upload.error;
      file = {
        storagePath: upload.data?.path ?? storagePath,
        fileName: descriptor.fileName,
        fileType: descriptor.mimeType,
        fileSize: descriptor.sizeBytes,
      };
    }

    const repo = createSupabaseSponsorshipAdminRepository(client);
    const service = createSponsorshipAdminService({
      repo,
      sendPledgeStatusUpdateEmail,
      client,
    });

    const result = await service.recordPayment({
      actorUserId: admin.authUserId,
      pledgeId: id,
      input: { ...payload, file },
    });

    return jsonResponse({ proof: result }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return responseError(error);
    if (error instanceof z.ZodError) {
      return jsonResponse({ error: "Invalid payment proof request" }, { status: 400 });
    }
    if (error instanceof Error) {
      if (notFoundDomainErrors.has(error.message)) {
        return jsonResponse({ error: error.message }, { status: 404 });
      }
      if (conflictDomainErrors.has(error.message)) {
        return jsonResponse({ error: error.message }, { status: 409 });
      }
    }

    console.error(error);
    return jsonResponse({ error: "Could not record sponsorship payment" }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/admin/sponsorships/pledges/$id/proof")({
  server: {
    handlers: {
      POST: ({ request, params }) => recordPayment({ request, params }),
    },
  },
});
```

- [ ] **Step 3: Type-check the new routes**

Run: `bunx tsc --noEmit -p tsconfig.json`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/routes/api/admin/sponsorships/pledges/\$id/proof-url.ts src/routes/api/admin/sponsorships/pledges/\$id/proof.ts
git commit -m "feat: add sponsorship pledge proof signed-url and record-payment routes"
```

---

## Task 11: CRM timeline fix — surface pledge audit rows in `getSupporterDetail`

**Files:**
- Modify: `src/lib/crm/repository.server.ts`
- Create: `src/lib/crm/repository.server.test.ts`

Fixes the gap identified in the spec: `getSupporterDetail`'s `audit_log` query is scoped to `entity_id in (supporterId, ...donationIds)`, so `sponsorship_pledge.*` audit rows (written by the 3 new RPCs) never surface. Fetch the supporter's `sponsorship_pledge` ids alongside `donationIds` and include them in the same filter.

There is no existing `src/lib/crm/repository.server.test.ts` — `getSupporterDetail` is currently only exercised indirectly through fake-repository mocks in `src/lib/crm/service.test.ts` and `src/lib/crm/http.test.ts` (those mock the whole `CrmRepository` interface, never calling into `createSupabaseCrmRepository`'s actual Supabase query logic). This task creates that missing test file with a minimal fake Supabase client, following the same fake-client conventions as `src/lib/sponsorshipAdmin/repository.server.test.ts` (Task 4).

- [ ] **Step 1: Write the failing test**

Create `src/lib/crm/repository.server.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseCrmRepository } from "./repository.server";

const supporterId = "11111111-2222-4333-8444-555555555555";
const pledgeId = "44444444-5555-4333-8444-666666666666";

function supporterRow(overrides: Record<string, unknown> = {}) {
  return {
    id: supporterId,
    name: "陳小姐",
    email: "chan@example.com",
    phone: "91234567",
    language: "zh-HK",
    tags: [],
    source: "donation_form",
    deleted_at: null,
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

type FakeState = {
  supporterRows: Record<string, unknown>[];
  roleRows: Record<string, unknown>[];
  donationRows: Record<string, unknown>[];
  paymentRows: Record<string, unknown>[];
  receiptRows: Record<string, unknown>[];
  consentRows: Record<string, unknown>[];
  messageRows: Record<string, unknown>[];
  pledgeRows: Record<string, unknown>[];
  auditRows: Record<string, unknown>[];
};

class FakeQuery {
  private filters: Array<{ column: string; value: unknown; mode: "eq" | "in" }> = [];

  constructor(
    private readonly state: FakeState,
    private readonly table: string,
  ) {}

  select(_columns: string) {
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ column, value, mode: "eq" });
    return this;
  }

  in(column: string, values: unknown[]) {
    this.filters.push({ column, value: values, mode: "in" });
    return this;
  }

  order() {
    return this;
  }

  private rowsForTable(): Record<string, unknown>[] {
    switch (this.table) {
      case "supporter":
        return this.state.supporterRows;
      case "supporter_role":
        return this.state.roleRows;
      case "donation":
        return this.state.donationRows;
      case "payment":
        return this.state.paymentRows;
      case "receipt":
        return this.state.receiptRows;
      case "consent":
        return this.state.consentRows;
      case "message":
        return this.state.messageRows;
      case "sponsorship_pledge":
        return this.state.pledgeRows;
      case "audit_log":
        return this.state.auditRows;
      default:
        return [];
    }
  }

  private filteredRows() {
    return this.rowsForTable().filter((row) =>
      this.filters.every((filter) =>
        filter.mode === "in"
          ? (filter.value as unknown[]).includes(row[filter.column])
          : row[filter.column] === filter.value,
      ),
    );
  }

  async maybeSingle() {
    const rows = this.filteredRows();
    return { data: rows[0] ?? null, error: null };
  }

  then<T1 = unknown, T2 = never>(
    onfulfilled?: ((value: unknown) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ) {
    return Promise.resolve({ data: this.filteredRows(), error: null }).then(onfulfilled, onrejected);
  }
}

function createFakeClient(overrides: Partial<FakeState> = {}) {
  const state: FakeState = {
    supporterRows: [supporterRow()],
    roleRows: [],
    donationRows: [],
    paymentRows: [],
    receiptRows: [],
    consentRows: [],
    messageRows: [],
    pledgeRows: [],
    auditRows: [],
    ...overrides,
  };

  const client = {
    from(table: string) {
      return new FakeQuery(state, table);
    },
  };

  return { client: client as unknown as SupabaseClient, state };
}

describe("getSupporterDetail", () => {
  test("returns null when the supporter does not exist", async () => {
    const { client } = createFakeClient({ supporterRows: [] });
    const repo = createSupabaseCrmRepository(client);

    expect(await repo.getSupporterDetail(supporterId)).toBeNull();
  });

  test("includes donation-entity audit rows in the timeline (existing behavior)", async () => {
    const donationId = "22222222-3333-4333-8444-555555555555";
    const { client } = createFakeClient({
      donationRows: [
        {
          id: donationId,
          supporter_id: supporterId,
          amount_cents: 10000,
          currency: "HKD",
          purpose: "general",
          status: "succeeded",
          method: "fps",
          receipt_requested: false,
          created_at: "2026-06-15T00:00:00.000Z",
        },
      ],
      auditRows: [
        {
          id: "audit-donation-1",
          actor_user_id: "actor-1",
          action: "donation.mark_received",
          entity: "donation",
          entity_id: donationId,
          timestamp: "2026-06-15T00:00:00.000Z",
          detail: {},
        },
      ],
    });
    const repo = createSupabaseCrmRepository(client);

    const detail = await repo.getSupporterDetail(supporterId);
    expect(detail?.auditLogs.some((row) => row.entityId === donationId)).toBe(true);
  });

  test("includes the supporter's sponsorship_pledge audit rows in the timeline", async () => {
    const { client } = createFakeClient({
      pledgeRows: [{ id: pledgeId, supporter_id: supporterId }],
      auditRows: [
        {
          id: "audit-pledge-1",
          actor_user_id: "actor-1",
          action: "sponsorship_pledge.cancelled",
          entity: "sponsorship_pledge",
          entity_id: pledgeId,
          timestamp: "2026-07-02T00:00:00.000Z",
          detail: {},
        },
      ],
    });
    const repo = createSupabaseCrmRepository(client);

    const detail = await repo.getSupporterDetail(supporterId);
    expect(detail?.auditLogs.some((row) => row.entityId === pledgeId)).toBe(true);
  });

  test("does not include audit rows for a pledge belonging to a different supporter", async () => {
    const otherPledgeId = "77777777-8888-4333-8444-999999999999";
    const { client } = createFakeClient({
      pledgeRows: [{ id: pledgeId, supporter_id: supporterId }],
      auditRows: [
        {
          id: "audit-pledge-other",
          actor_user_id: "actor-1",
          action: "sponsorship_pledge.cancelled",
          entity: "sponsorship_pledge",
          entity_id: otherPledgeId,
          timestamp: "2026-07-02T00:00:00.000Z",
          detail: {},
        },
      ],
    });
    const repo = createSupabaseCrmRepository(client);

    const detail = await repo.getSupporterDetail(supporterId);
    expect(detail?.auditLogs.some((row) => row.entityId === otherPledgeId)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/lib/crm/repository.server.test.ts`
Expected: FAIL — the "includes the supporter's sponsorship_pledge audit rows" test fails because `getSupporterDetail` does not yet query `sponsorship_pledge` ids, so `pledgeId` is absent from the `audit_log` `.in("entity_id", ...)` filter and the row never appears in `detail.auditLogs`.

- [ ] **Step 3: Apply the fix**

In `src/lib/crm/repository.server.ts`, modify `getSupporterDetail` (starting at line 487). Change this block:

```ts
      const { data: donationData, error: donationError } = await client
        .from("donation")
        .select("*")
        .eq("supporter_id", id)
        .order("created_at", { ascending: false });
      if (donationError) throw donationError;
      const donationRows = (donationData ?? []) as DonationRow[];
      const donationIds = donationRows.map((row) => row.id);

      const [paymentsResult, receiptsResult, consentsResult, messagesResult, auditResult] =
        await Promise.all([
          donationIds.length
            ? client
                .from("payment")
                .select(
                  "id,donation_id,provider,provider_ref,amount_cents,status,received_at,bank_reference,created_at",
                )
                .in("donation_id", donationIds)
                .order("created_at", { ascending: false })
            : Promise.resolve({ data: [], error: null }),
          client
            .from("receipt")
            .select("*")
            .eq("supporter_id", id)
            .order("issued_at", { ascending: false }),
          client
            .from("consent")
            .select("id,supporter_id,channel,status,source,timestamp")
            .eq("supporter_id", id)
            .order("timestamp", { ascending: false }),
          client
            .from("message")
            .select("id,supporter_id,channel,status,payload,sent_at,created_at")
            .eq("supporter_id", id)
            .order("created_at", { ascending: false }),
          client
            .from("audit_log")
            .select("id,actor_user_id,action,entity,entity_id,timestamp,detail")
            .in("entity_id", [id, ...donationIds])
            .order("timestamp", { ascending: false }),
        ]);
```

to:

```ts
      const [donationResult, pledgeResult] = await Promise.all([
        client
          .from("donation")
          .select("*")
          .eq("supporter_id", id)
          .order("created_at", { ascending: false }),
        client.from("sponsorship_pledge").select("id").eq("supporter_id", id),
      ]);
      if (donationResult.error) throw donationResult.error;
      if (pledgeResult.error) throw pledgeResult.error;
      const donationRows = (donationResult.data ?? []) as DonationRow[];
      const donationIds = donationRows.map((row) => row.id);
      const pledgeIds = ((pledgeResult.data ?? []) as Array<{ id: string }>).map((row) => row.id);

      const [paymentsResult, receiptsResult, consentsResult, messagesResult, auditResult] =
        await Promise.all([
          donationIds.length
            ? client
                .from("payment")
                .select(
                  "id,donation_id,provider,provider_ref,amount_cents,status,received_at,bank_reference,created_at",
                )
                .in("donation_id", donationIds)
                .order("created_at", { ascending: false })
            : Promise.resolve({ data: [], error: null }),
          client
            .from("receipt")
            .select("*")
            .eq("supporter_id", id)
            .order("issued_at", { ascending: false }),
          client
            .from("consent")
            .select("id,supporter_id,channel,status,source,timestamp")
            .eq("supporter_id", id)
            .order("timestamp", { ascending: false }),
          client
            .from("message")
            .select("id,supporter_id,channel,status,payload,sent_at,created_at")
            .eq("supporter_id", id)
            .order("created_at", { ascending: false }),
          client
            .from("audit_log")
            .select("id,actor_user_id,action,entity,entity_id,timestamp,detail")
            .in("entity_id", [id, ...donationIds, ...pledgeIds])
            .order("timestamp", { ascending: false }),
        ]);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/lib/crm/repository.server.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full CRM test directory to check for regressions**

Run: `bun test src/lib/crm/`
Expected: PASS (all existing CRM tests still pass — `service.test.ts` and `http.test.ts` mock the whole `CrmRepository` interface directly, so they are unaffected by this change to `repository.server.ts`'s internals).

- [ ] **Step 6: Commit**

```bash
git add src/lib/crm/repository.server.ts src/lib/crm/repository.server.test.ts
git commit -m "fix: surface sponsorship pledge audit rows in supporter CRM timeline"
```

---

## Task 12: `pledgeReviewLogic.ts` — pure UI logic (filter/search params)

**Files:**
- Create: `src/components/admin/sponsorship/pledgeReviewLogic.ts`
- Test: `src/components/admin/sponsorship/pledgeReviewLogic.test.ts`

Mirrors `buildCaseListSearchParams`/`formatFallback`/`formatDate` from `src/components/admin/adoptions/caseWorkflowLogic.ts`.

- [ ] **Step 1: Write the failing test**

Create `src/components/admin/sponsorship/pledgeReviewLogic.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import {
  buildPledgeListSearchParams,
  formatFallback,
  formatDate,
  pledgeStatusTone,
} from "./pledgeReviewLogic";

describe("buildPledgeListSearchParams", () => {
  test("omits empty filters and applies page/pageSize defaults", () => {
    const params = buildPledgeListSearchParams({ q: "", status: "", page: undefined, pageSize: undefined });
    expect(params.has("q")).toBe(false);
    expect(params.has("status")).toBe(false);
    expect(params.get("page")).toBe("1");
    expect(params.get("pageSize")).toBe("25");
  });

  test("includes a trimmed search query and status filter", () => {
    const params = buildPledgeListSearchParams({ q: "  陳小姐  ", status: "provisional", page: 2, pageSize: 10 });
    expect(params.get("q")).toBe("陳小姐");
    expect(params.get("status")).toBe("provisional");
    expect(params.get("page")).toBe("2");
    expect(params.get("pageSize")).toBe("10");
  });

  test("falls back to page 1 / pageSize 25 for invalid numbers", () => {
    const params = buildPledgeListSearchParams({ page: 0, pageSize: -5 });
    expect(params.get("page")).toBe("1");
    expect(params.get("pageSize")).toBe("25");
  });
});

describe("formatFallback", () => {
  test("returns a dash for empty or nullish values", () => {
    expect(formatFallback(null)).toBe("-");
    expect(formatFallback(undefined)).toBe("-");
    expect(formatFallback("   ")).toBe("-");
  });

  test("returns the trimmed value otherwise", () => {
    expect(formatFallback("  陳小姐  ")).toBe("陳小姐");
  });
});

describe("formatDate", () => {
  test("returns a dash for empty values", () => {
    expect(formatDate(null)).toBe("-");
  });

  test("truncates an ISO timestamp to the date portion", () => {
    expect(formatDate("2026-07-01T00:00:00.000Z")).toBe("2026-07-01");
  });
});

describe("pledgeStatusTone", () => {
  test("maps each status to its expected StatusPill tone", () => {
    expect(pledgeStatusTone("pending_payment")).toBe("warning");
    expect(pledgeStatusTone("provisional")).toBe("info");
    expect(pledgeStatusTone("active")).toBe("success");
    expect(pledgeStatusTone("needs_followup")).toBe("danger");
    expect(pledgeStatusTone("cancelled")).toBe("neutral");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/components/admin/sponsorship/pledgeReviewLogic.test.ts`
Expected: FAIL — `Cannot find module './pledgeReviewLogic'`.

- [ ] **Step 3: Write the logic module**

Create `src/components/admin/sponsorship/pledgeReviewLogic.ts`:

```ts
import type { StatusTone } from "../StatusBadge";
import type { PledgeStatus } from "../../../lib/sponsorshipAdmin/types";

export type PledgeListFilters = {
  q?: string;
  status?: string;
  page?: number;
  pageSize?: number;
};

function trimmed(value: string | null | undefined) {
  const nextValue = value?.trim();
  return nextValue ? nextValue : "";
}

function normalizedPositiveInteger(value: number | undefined, fallback: number) {
  return Number.isInteger(value) && value && value > 0 ? value : fallback;
}

export function buildPledgeListSearchParams(filters: PledgeListFilters) {
  const params = new URLSearchParams();
  const q = trimmed(filters.q);
  const status = trimmed(filters.status);

  if (q) params.set("q", q);
  if (status) params.set("status", status);
  params.set("page", String(normalizedPositiveInteger(filters.page, 1)));
  params.set("pageSize", String(normalizedPositiveInteger(filters.pageSize, 25)));
  return params;
}

export function formatFallback(value: string | null | undefined) {
  return trimmed(value) || "-";
}

export function formatDate(value: string | null | undefined) {
  const nextValue = trimmed(value);
  if (!nextValue) return "-";
  return nextValue.slice(0, 10);
}

const PLEDGE_STATUS_TONE: Record<PledgeStatus, StatusTone> = {
  pending_payment: "warning",
  provisional: "info",
  active: "success",
  needs_followup: "danger",
  cancelled: "neutral",
};

export function pledgeStatusTone(status: PledgeStatus): StatusTone {
  return PLEDGE_STATUS_TONE[status];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/components/admin/sponsorship/pledgeReviewLogic.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/sponsorship/pledgeReviewLogic.ts src/components/admin/sponsorship/pledgeReviewLogic.test.ts
git commit -m "feat: add pledge review lane pure filter/search/status logic"
```

---

## Task 13: `PledgeReviewLane.tsx` — list UI

**Files:**
- Create: `src/components/admin/sponsorship/PledgeReviewLane.tsx`

Per the spec, no component-level tests are required (matching the project's existing precedent for `CaseList.tsx` and similar admin panels — coverage is via the pure-logic file from Task 12). Mirrors `CaseList.tsx`'s `DataTable` + search + status-filter-chips + pagination shape, using `fetchCoordinatorJson` for auth'd fetches and `StatusPill` (not `StatusBadge`, since pledge status is a plain enum, not a `CoordinatorStatus`).

- [ ] **Step 1: Write the component**

Create `src/components/admin/sponsorship/PledgeReviewLane.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, ListChecks, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { fetchCoordinatorJson } from "../adoptions/api";
import { DataTable, type DataTableColumn } from "../DataTable";
import { StatusPill } from "../StatusBadge";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import type { PledgeStatus, PledgeSummary } from "../../../lib/sponsorshipAdmin/types";
import {
  buildPledgeListSearchParams,
  formatDate,
  formatFallback,
  pledgeStatusTone,
} from "./pledgeReviewLogic";
import { PledgeDetailDrawer } from "./PledgeDetailDrawer";

type PledgeListResponse = {
  pledges: PledgeSummary[];
  total: number;
};

const PLEDGE_STATUS_OPTIONS: Array<{ value: PledgeStatus | "all"; label: string }> = [
  { value: "all", label: "全部狀態" },
  { value: "pending_payment", label: "待付款" },
  { value: "provisional", label: "待審核" },
  { value: "active", label: "已確認" },
  { value: "needs_followup", label: "需要跟進" },
  { value: "cancelled", label: "已取消" },
];

const PLEDGE_STATUS_LABEL: Record<PledgeStatus, string> = {
  pending_payment: "待付款",
  provisional: "待審核",
  active: "已確認",
  needs_followup: "需要跟進",
  cancelled: "已取消",
};

const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;

function amountLabel(pledge: PledgeSummary) {
  const dollars = Math.round(pledge.amountCents / 100).toLocaleString("en-US");
  return `HK$${dollars}/月`;
}

export function PledgeReviewLane() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<PledgeStatus | "all">("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(25);
  const [selectedPledgeId, setSelectedPledgeId] = useState<string | null>(null);

  const searchParams = useMemo(
    () =>
      buildPledgeListSearchParams({
        q: query,
        status: status === "all" ? "" : status,
        page,
        pageSize,
      }),
    [page, pageSize, query, status],
  );

  const { data, error, isLoading, isFetching, refetch } = useQuery<PledgeListResponse, Error>({
    queryKey: ["sponsorship-pledges", searchParams.toString()],
    queryFn: () =>
      fetchCoordinatorJson<PledgeListResponse>(
        `/api/admin/sponsorships/pledges?${searchParams}`,
      ),
  });

  const pledges = data?.pledges ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function resetToFirstPage() {
    setPage(1);
  }

  const columns: DataTableColumn<PledgeSummary>[] = [
    {
      id: "supporter",
      header: "支持者",
      className: "px-4",
      cell: (pledge) => (
        <div>
          <div className="font-semibold text-[var(--color-panel)]">{pledge.supporterName}</div>
          <div className="text-xs text-[var(--color-text-muted)]">
            {formatFallback(pledge.supporterEmail)}
          </div>
        </div>
      ),
    },
    {
      id: "amount",
      header: "承諾金額",
      cell: (pledge) => <span className="text-[var(--color-panel)]">{amountLabel(pledge)}</span>,
    },
    {
      id: "created",
      header: "建立日期",
      cell: (pledge) => (
        <span className="text-[var(--color-text-muted)]">{formatDate(pledge.createdAt)}</span>
      ),
    },
    {
      id: "status",
      header: "狀態",
      cell: (pledge) => (
        <StatusPill tone={pledgeStatusTone(pledge.status)}>
          {PLEDGE_STATUS_LABEL[pledge.status]}
        </StatusPill>
      ),
    },
  ];

  function renderCard(pledge: PledgeSummary) {
    return (
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="font-semibold text-[var(--color-panel)]">{pledge.supporterName}</div>
            <div className="text-xs text-[var(--color-text-muted)]">
              {formatFallback(pledge.supporterEmail)}
            </div>
          </div>
          <StatusPill tone={pledgeStatusTone(pledge.status)}>
            {PLEDGE_STATUS_LABEL[pledge.status]}
          </StatusPill>
        </div>
        <div className="text-xs text-[var(--color-text-muted)]">
          {amountLabel(pledge)} · {formatDate(pledge.createdAt)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="grid gap-3 p-4 lg:grid-cols-[minmax(260px,1fr)_220px]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
            <Input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                resetToFirstPage();
              }}
              aria-label="搜尋支持者姓名、電郵或編號"
              className="h-9 pl-9"
              placeholder="搜尋支持者姓名、電郵或編號"
            />
          </label>

          <Select
            value={status}
            onValueChange={(value) => {
              setStatus(value as PledgeStatus | "all");
              resetToFirstPage();
            }}
          >
            <SelectTrigger aria-label="狀態" className="h-9">
              <SelectValue placeholder="狀態" />
            </SelectTrigger>
            <SelectContent>
              {PLEDGE_STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </section>

      <section
        aria-busy={isLoading || isFetching}
        className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]"
      >
        <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] px-4">
          <div>
            <h2 className="text-base font-semibold text-[var(--color-panel)]">承諾審核</h2>
            <p className="text-xs text-[var(--color-text-muted)]">
              {isLoading ? "載入中..." : `共 ${total} 項`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="pledge-page-size" className="text-xs text-[var(--color-text-muted)]">
              每頁
            </Label>
            <Select
              value={String(pageSize)}
              onValueChange={(value) => {
                setPageSize(Number(value) as (typeof PAGE_SIZE_OPTIONS)[number]);
                resetToFirstPage();
              }}
            >
              <SelectTrigger id="pledge-page-size" className="h-8 w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((option) => (
                  <SelectItem key={option} value={String(option)}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" onClick={() => refetch()} disabled={isFetching}>
              <ListChecks className="h-4 w-4" />
              重新整理
            </Button>
          </div>
        </div>

        {error && !isLoading && (
          <div role="alert" className="border-t border-[var(--color-border)] px-4 py-3 text-sm text-[var(--color-error)]">
            {error.message}
          </div>
        )}

        <DataTable<PledgeSummary>
          columns={columns}
          rows={pledges}
          getRowKey={(pledge) => pledge.id}
          loading={isLoading}
          skeletonRows={5}
          empty="沒有承諾"
          onRowClick={(pledge) => setSelectedPledgeId(pledge.id)}
          renderMobileCard={renderCard}
        />

        <div className="flex min-h-12 flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border)] px-4 py-2 text-xs text-[var(--color-text-muted)]">
          <span>{`第 ${page} 頁，共 ${totalPages} 頁`}</span>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
              disabled={page <= 1 || isFetching}
            >
              <ChevronLeft className="h-4 w-4" />
              上一頁
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setPage((currentPage) => currentPage + 1)}
              disabled={page >= totalPages || isFetching}
            >
              下一頁
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>

      {selectedPledgeId && (
        <PledgeDetailDrawer
          pledgeId={selectedPledgeId}
          onClose={() => setSelectedPledgeId(null)}
          onChanged={() => refetch()}
        />
      )}
    </div>
  );
}
```

`PledgeReviewLane.tsx` imports `PledgeDetailDrawer` (created next, in Task 14), so this file will not type-check in isolation yet — do not commit it alone. Proceed directly to Task 14, which type-checks and commits both files together.

---

## Task 14: `PledgeDetailDrawer.tsx` — slide-over detail + actions

**Files:**
- Create: `src/components/admin/sponsorship/PledgeDetailDrawer.tsx`

Mirrors the adoption `CaseDetail.tsx` panel's data-fetch + action-button shape, but as a slide-over rather than a page (per the spec's explicit "drawer, not dedicated page" decision). Renders state-dependent content: record-payment form (`pending_payment`/`needs_followup` with no pending proof), review buttons (`provisional`), cancel button (`active`), and read-only (`cancelled`).

- [ ] **Step 1: Write the component**

Create `src/components/admin/sponsorship/PledgeDetailDrawer.tsx`:

```tsx
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { fetchCoordinatorJson } from "../adoptions/api";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { StatusPill } from "../StatusBadge";
import type { PledgeDetail } from "../../../lib/sponsorshipAdmin/types";
import { formatDate, formatFallback, pledgeStatusTone } from "./pledgeReviewLogic";

type PledgeDetailResponse = { pledge: PledgeDetail };

const PLEDGE_STATUS_LABEL: Record<PledgeDetail["status"], string> = {
  pending_payment: "待付款",
  provisional: "待審核",
  active: "已確認",
  needs_followup: "需要跟進",
  cancelled: "已取消",
};

const PAYMENT_METHOD_OPTIONS = [
  { value: "fps", label: "轉數快 FPS" },
  { value: "bank_transfer", label: "銀行轉帳" },
  { value: "payme", label: "PayMe" },
  { value: "paypal", label: "PayPal" },
  { value: "give_asia", label: "Give.asia" },
] as const;

function amountLabel(amountCents: number) {
  const dollars = Math.round(amountCents / 100).toLocaleString("en-US");
  return `HK$${dollars}/月`;
}

export function PledgeDetailDrawer({
  pledgeId,
  onClose,
  onChanged,
}: {
  pledgeId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [cancelNote, setCancelNote] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<(typeof PAYMENT_METHOD_OPTIONS)[number]["value"]>("fps");
  const [reference, setReference] = useState("");
  const [amountHkd, setAmountHkd] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [paymentNote, setPaymentNote] = useState("");

  const { data, isLoading, error, refetch } = useQuery<PledgeDetailResponse, Error>({
    queryKey: ["sponsorship-pledge", pledgeId],
    queryFn: () =>
      fetchCoordinatorJson<PledgeDetailResponse>(`/api/admin/sponsorships/pledges/${pledgeId}`),
  });

  const pledge = data?.pledge ?? null;

  async function refreshAll() {
    await refetch();
    onChanged();
    queryClient.invalidateQueries({ queryKey: ["sponsorship-pledges"] });
  }

  async function submitReview(decision: "approve" | "reject") {
    setSubmitting(true);
    setActionError(null);
    try {
      await fetchCoordinatorJson(`/api/admin/sponsorships/pledges/${pledgeId}/review`, {
        method: "POST",
        body: JSON.stringify({ decision, note: reviewNote || undefined }),
      });
      setReviewNote("");
      await refreshAll();
    } catch (submitError) {
      setActionError(submitError instanceof Error ? submitError.message : "審核失敗");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitCancel() {
    setSubmitting(true);
    setActionError(null);
    try {
      await fetchCoordinatorJson(`/api/admin/sponsorships/pledges/${pledgeId}/cancel`, {
        method: "POST",
        body: JSON.stringify({ note: cancelNote || undefined }),
      });
      setCancelNote("");
      await refreshAll();
    } catch (submitError) {
      setActionError(submitError instanceof Error ? submitError.message : "取消失敗");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitPayment() {
    setSubmitting(true);
    setActionError(null);
    try {
      const amountCents = Math.round(Number(amountHkd) * 100);
      const formData = new FormData();
      formData.set(
        "payload",
        JSON.stringify({
          paymentMethod,
          reference: reference || undefined,
          amountCents,
          paymentDate,
          note: paymentNote || undefined,
        }),
      );

      await fetchCoordinatorJson(`/api/admin/sponsorships/pledges/${pledgeId}/proof`, {
        method: "POST",
        body: formData,
        headers: {},
      });
      setReference("");
      setAmountHkd("");
      setPaymentDate("");
      setPaymentNote("");
      await refreshAll();
    } catch (submitError) {
      setActionError(submitError instanceof Error ? submitError.message : "記錄付款失敗");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" role="dialog" aria-modal="true">
      <div className="flex h-full w-full max-w-md flex-col overflow-y-auto bg-[var(--color-surface)] p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold text-[var(--color-panel)]">承諾詳情</h2>
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            關閉
          </Button>
        </div>

        {isLoading && <p className="mt-6 text-sm text-[var(--color-text-muted)]">載入中...</p>}
        {error && <p className="mt-6 text-sm text-[var(--color-error)]">{error.message}</p>}

        {pledge && (
          <div className="mt-6 space-y-6">
            <section className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[var(--color-panel)]">{pledge.supporterName}</span>
                <StatusPill tone={pledgeStatusTone(pledge.status)}>
                  {PLEDGE_STATUS_LABEL[pledge.status]}
                </StatusPill>
              </div>
              <p className="text-sm text-[var(--color-text-muted)]">
                {formatFallback(pledge.supporterEmail)} · {formatFallback(pledge.supporterPhone)}
              </p>
              <p className="text-sm text-[var(--color-panel)]">
                {amountLabel(pledge.amountCents)}（{pledge.monthlyTier === "custom" ? "自訂" : pledge.monthlyTier}）
              </p>
              <p className="text-xs text-[var(--color-text-muted)]">
                建立於 {formatDate(pledge.createdAt)}
              </p>
            </section>

            <section className="space-y-1">
              <h3 className="text-sm font-semibold text-[var(--color-panel)]">動物排序</h3>
              <ul className="space-y-1 text-sm text-[var(--color-text-muted)]">
                {pledge.preferences.map((preference) => (
                  <li key={preference.id}>
                    {preference.rank}. {preference.animalNameSnapshot}
                  </li>
                ))}
              </ul>
            </section>

            {actionError && (
              <p role="alert" className="text-sm text-[var(--color-error)]">
                {actionError}
              </p>
            )}

            {(pledge.status === "pending_payment" || pledge.status === "needs_followup") && (
              <section className="space-y-3 rounded-lg border border-[var(--color-border)] p-4">
                <h3 className="text-sm font-semibold text-[var(--color-panel)]">記錄付款</h3>
                <Select
                  value={paymentMethod}
                  onValueChange={(value) => setPaymentMethod(value as typeof paymentMethod)}
                >
                  <SelectTrigger aria-label="付款方式" className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHOD_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Label htmlFor="pledge-reference">參考編號</Label>
                <Input id="pledge-reference" value={reference} onChange={(event) => setReference(event.target.value)} />
                <Label htmlFor="pledge-amount">金額 (HKD)</Label>
                <Input
                  id="pledge-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={amountHkd}
                  onChange={(event) => setAmountHkd(event.target.value)}
                />
                <Label htmlFor="pledge-payment-date">付款日期</Label>
                <Input
                  id="pledge-payment-date"
                  type="date"
                  value={paymentDate}
                  onChange={(event) => setPaymentDate(event.target.value)}
                />
                <Label htmlFor="pledge-payment-note">備註</Label>
                <Input id="pledge-payment-note" value={paymentNote} onChange={(event) => setPaymentNote(event.target.value)} />
                <Button type="button" onClick={submitPayment} disabled={submitting || !amountHkd || !paymentDate}>
                  儲存付款記錄
                </Button>
              </section>
            )}

            {pledge.status === "provisional" && (
              <section className="space-y-3 rounded-lg border border-[var(--color-border)] p-4">
                <h3 className="text-sm font-semibold text-[var(--color-panel)]">審核付款證明</h3>
                {pledge.currentProof && (
                  <p className="text-sm text-[var(--color-text-muted)]">
                    {pledge.currentProof.paymentMethod} · {formatFallback(pledge.currentProof.reference)} ·{" "}
                    {amountLabel(pledge.currentProof.amountCents)}
                  </p>
                )}
                <Label htmlFor="pledge-review-note">備註</Label>
                <Input id="pledge-review-note" value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} />
                <div className="flex gap-2">
                  <Button type="button" onClick={() => submitReview("approve")} disabled={submitting}>
                    核實通過
                  </Button>
                  <Button type="button" variant="outline" onClick={() => submitReview("reject")} disabled={submitting}>
                    拒絕
                  </Button>
                </div>
              </section>
            )}

            {pledge.status === "active" && (
              <section className="space-y-3 rounded-lg border border-[var(--color-border)] p-4">
                <Label htmlFor="pledge-cancel-note">取消備註</Label>
                <Input id="pledge-cancel-note" value={cancelNote} onChange={(event) => setCancelNote(event.target.value)} />
                <Button type="button" variant="outline" onClick={submitCancel} disabled={submitting}>
                  取消助養
                </Button>
              </section>
            )}

            <section className="space-y-1">
              <h3 className="text-sm font-semibold text-[var(--color-panel)]">近期活動</h3>
              <ul className="space-y-1 text-xs text-[var(--color-text-muted)]">
                {pledge.recentAuditLog.map((entry) => (
                  <li key={entry.id}>
                    {formatDate(entry.timestamp)} — {entry.action}
                  </li>
                ))}
              </ul>
              <a
                href={`/admin/supporters/${pledge.supporterId}`}
                className="text-sm text-[var(--color-primary)] hover:underline"
              >
                查看完整支持者時間軸
              </a>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check both new components together**

Run: `bunx tsc --noEmit -p tsconfig.json`
Expected: no new errors from `PledgeReviewLane.tsx` / `PledgeDetailDrawer.tsx` (this closes the mutual-import gap noted at the end of Task 13).

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/sponsorship/PledgeReviewLane.tsx src/components/admin/sponsorship/PledgeDetailDrawer.tsx
git commit -m "feat: add sponsorship pledge detail drawer with review/record/cancel actions"
```

---

## Task 15: Wire the view toggle into `/admin?section=sponsor`

**Files:**
- Modify: `src/routes/admin/index.tsx`

Gives `sponsor` its own branch (parallel to the existing `payments`/`applications` special cases) with a toggle between the existing `AnimalsTable` and the new `PledgeReviewLane`, per the spec's "same route, same nav entry, in-page toggle" decision.

- [ ] **Step 1: Modify the route component**

In `src/routes/admin/index.tsx`, add the import:

```ts
import { PledgeReviewLane } from "../../components/admin/sponsorship/PledgeReviewLane";
```

Add `useState` to the existing `react` import area — actually `useState` needs importing from `"react"` since the file currently has no React import beyond JSX; add:

```ts
import { useState } from "react";
```

Change the `AdminDashboardContent` function. Replace this block:

```tsx
function AdminDashboardContent({ section }: { section: DashboardSection }) {
  const queryClient = useQueryClient();
  const { copy } = useAdminLanguage();

  const { data: animals = [], isLoading } = useQuery({
    queryKey: ["admin-animals", section],
    queryFn: async () => {
      if (section === "applications" || section === "payments") return [];
      const { data, error } = await supabase
        .from("animals")
        .select("*")
        .eq("type", section)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: section !== "applications" && section !== "payments",
  });

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold">{copy.dashboard.title[section]}</h1>
        {section === "payments" ? (
          <Link
            to="/admin/supporters"
            className="rounded border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-[var(--color-panel)] hover:bg-[var(--color-primary-highlight)]"
          >
            {copy.dashboard.supporters}
          </Link>
        ) : section !== "applications" ? (
          <Link
            to="/admin/animals/new"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white transition-colors hover:bg-blue-700"
          >
            + {copy.dashboard.addNew}
          </Link>
        ) : null}
      </div>

      {section === "payments" ? (
        <PaymentsReconcile />
      ) : section === "applications" ? (
        <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <h2 className="text-lg font-semibold text-[var(--color-panel)]">
            {copy.dashboard.applicationsMovedTitle}
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-[var(--color-text-muted)]">
            {copy.dashboard.applicationsMovedDescription}
          </p>
          <Link
            to="/admin/applications"
            className="mt-4 inline-flex items-center rounded border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-[var(--color-panel)] hover:bg-[var(--color-primary-highlight)]"
          >
            {copy.dashboard.openAdoptionCases}
          </Link>
        </section>
      ) : isLoading ? (
        <div className="py-12 text-center text-gray-400">{copy.common.loading}</div>
      ) : (
        <AnimalsTable
          animals={animals}
          onDeleted={() => queryClient.invalidateQueries({ queryKey: ["admin-animals", section] })}
        />
      )}
    </div>
  );
}
```

with:

```tsx
function AdminDashboardContent({ section }: { section: DashboardSection }) {
  const queryClient = useQueryClient();
  const { copy } = useAdminLanguage();
  const [sponsorView, setSponsorView] = useState<"animals" | "pledges">("animals");

  const showAnimalsTable =
    section !== "applications" && section !== "payments" && (section !== "sponsor" || sponsorView === "animals");

  const { data: animals = [], isLoading } = useQuery({
    queryKey: ["admin-animals", section],
    queryFn: async () => {
      if (section === "applications" || section === "payments") return [];
      const { data, error } = await supabase
        .from("animals")
        .select("*")
        .eq("type", section)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: showAnimalsTable,
  });

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold">{copy.dashboard.title[section]}</h1>
        {section === "payments" ? (
          <Link
            to="/admin/supporters"
            className="rounded border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-[var(--color-panel)] hover:bg-[var(--color-primary-highlight)]"
          >
            {copy.dashboard.supporters}
          </Link>
        ) : section === "sponsor" ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSponsorView("animals")}
              className={
                sponsorView === "animals"
                  ? "rounded border border-[var(--color-panel)] bg-[var(--color-panel)] px-3 py-2 text-sm font-medium text-white"
                  : "rounded border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-[var(--color-panel)] hover:bg-[var(--color-primary-highlight)]"
              }
            >
              動物列表
            </button>
            <button
              type="button"
              onClick={() => setSponsorView("pledges")}
              className={
                sponsorView === "pledges"
                  ? "rounded border border-[var(--color-panel)] bg-[var(--color-panel)] px-3 py-2 text-sm font-medium text-white"
                  : "rounded border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-[var(--color-panel)] hover:bg-[var(--color-primary-highlight)]"
              }
            >
              承諾審核
            </button>
          </div>
        ) : section !== "applications" ? (
          <Link
            to="/admin/animals/new"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white transition-colors hover:bg-blue-700"
          >
            + {copy.dashboard.addNew}
          </Link>
        ) : null}
      </div>

      {section === "payments" ? (
        <PaymentsReconcile />
      ) : section === "applications" ? (
        <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <h2 className="text-lg font-semibold text-[var(--color-panel)]">
            {copy.dashboard.applicationsMovedTitle}
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-[var(--color-text-muted)]">
            {copy.dashboard.applicationsMovedDescription}
          </p>
          <Link
            to="/admin/applications"
            className="mt-4 inline-flex items-center rounded border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-[var(--color-panel)] hover:bg-[var(--color-primary-highlight)]"
          >
            {copy.dashboard.openAdoptionCases}
          </Link>
        </section>
      ) : section === "sponsor" && sponsorView === "pledges" ? (
        <PledgeReviewLane />
      ) : isLoading ? (
        <div className="py-12 text-center text-gray-400">{copy.common.loading}</div>
      ) : (
        <AnimalsTable
          animals={animals}
          onDeleted={() => queryClient.invalidateQueries({ queryKey: ["admin-animals", section] })}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `bunx tsc --noEmit -p tsconfig.json`
Expected: no new errors.

- [ ] **Step 3: Manual verification**

Run: `bun run dev`, sign in as a staff/admin user, navigate to `/admin?section=sponsor`, and confirm both buttons toggle between the animals table and the pledge review lane without a page reload.

- [ ] **Step 4: Commit**

```bash
git add src/routes/admin/index.tsx
git commit -m "feat: add pledge review view toggle to the sponsor admin section"
```

---

## Task 16: Full test suite regression pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `bun test`
Expected: PASS — all ~300+ existing tests plus every new test added in Tasks 1–14 pass.

- [ ] **Step 2: Type-check the whole project**

Run: `bunx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Lint the changed files only (repo-wide `bun run lint` is known to hang; lint touched files individually)**

Run:

```bash
bunx eslint src/lib/sponsorshipAdmin/*.ts src/lib/sponsorship/emailTemplates.server.ts src/lib/crm/repository.server.ts src/routes/api/admin/sponsorships/pledges.ts src/routes/api/admin/sponsorships/pledges/*.ts src/routes/api/admin/sponsorships/pledges/*/*.ts src/components/admin/sponsorship/*.tsx src/components/admin/sponsorship/*.ts src/routes/admin/index.tsx
```

Expected: no errors.

- [ ] **Step 4: Commit (only if any lint auto-fixes were applied)**

```bash
git add -A
git commit -m "chore: lint fixes for sponsorship pledge admin review"
```

(Skip this step entirely if lint reported no changes.)

---

## Open Questions

- **`sendPledgeStatusUpdateEmail` dependency shape in the service.** The spec doesn't pin down whether the service should accept `sendPledgeStatusUpdateEmail` as an injected function (this plan's choice, matching how `service.ts` files in this repo take dependencies as constructor args for testability) versus importing it directly. This plan injects it via `createSponsorshipAdminService({ repo, sendPledgeStatusUpdateEmail, client })` so `service.test.ts` can mock it without touching the real Supabase/Resend path — consistent with how `submission.server.ts`'s `sendPledgeConfirmationEmail` takes its own dependency-injection object, just one level up. If a reviewer prefers the service to import `sendPledgeStatusUpdateEmail` directly (no DI) for symmetry with `route.ts`-level orchestration elsewhere, that's a small mechanical change confined to Task 7 and Task 9's `-handlers.ts`.
- **Manual proof upload storage path collisions.** The public submission path uses `${pledgeId}/${safeFileName(fileName)}` with `upsert: false`, which fails on a second upload with the same filename. This plan's staff-record route (Task 10) instead uses `${id}/staff-${Date.now()}-${safeFileName(fileName)}` to guarantee uniqueness across repeated staff corrections after a `needs_followup` rejection (the spec explicitly calls out this scenario). This is a plan-time implementation choice, not a spec decision — flagging in case the reviewer wants a different naming scheme (e.g. incorporating the proof row's future id instead of a timestamp).
