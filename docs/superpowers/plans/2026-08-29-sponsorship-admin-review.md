# Sponsorship Pledge Admin Review (BP-4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-implement the sponsorship pledge admin review (record payment / approve / reject / cancel, with lifecycle emails and CRM timeline integration) on current `main`, using the never-merged July branch as the verbatim source wherever it still fits.

**Architecture:** The July branch `feat/sponsorship-pledge-admin-review` contains a complete, tested implementation whose base (`9a02135`) predates today's `main` by ~321 commits. Verified on 2026-08-29: its API-route convention (`createFileRoute` + `server.handlers`), all its UI dependencies (`DataTable`, `StatusPill`, `ui/sheet`, `fetchCoordinatorJson`), and every symbol it imports (`SPONSORSHIP_PROOF_BUCKET`, `pledgeReference`, `getEmailConfig`, `AdminUser`, `requireAdmin`) still exist unchanged on `main`. So most tasks **extract the reference file verbatim** (`git show <ref>:<path> > <path>`) or **apply the reference diff** (for the four touched files that have not drifted since `9a02135`), test-first. Only five integration points drifted and get fresh code here: the consolidated migration + its safety tests, the `sponsorshipReview` access area, `adminI18n` keys, the `admin/index.tsx` view toggle (now gated by the access area), and the CRM timeline fix.

**Tech Stack:** TanStack Start (React 19), Supabase Postgres (service-role client + 3 SECURITY DEFINER RPCs), Zod, `@tanstack/react-query`, Bun test runner.

**Spec:** `docs/superpowers/specs/2026-08-29-sponsorship-admin-review-design.md`

**Reference constants used throughout** (define these in every shell session):

```bash
REF=origin/feat/sponsorship-pledge-admin-review
BASE=9a0213577a2cc2b6c5ef9f88dfd53921813fab73   # merge-base of REF and main
```

`git diff $BASE $REF -- <file> | git apply` is used only for files verified unchanged between `$BASE` and current `main` (`src/lib/sponsorship/emailTemplates.server.ts` + its test, `src/lib/sponsorship/schemas.ts`, `src/routes/api/sponsorships/status/$token.ts`). Everything else is either a whole-file extraction (file does not exist on `main`) or fresh code written below.

**Hard rules (from AGENTS.md and the integration plan):** never hand-edit `src/routeTree.gen.ts` (regenerate with `bun run build`, then commit it); never touch existing public URLs, query params, loader/action signatures, or `/api/*` schemas; the migration SQL is committed to the repo but NEVER applied to the live database in this plan — live apply is a separate, explicitly-human-confirmed step; never merge the PR yourself.

---

## Git setup

- [ ] **Step 1: Create the impl worktree**

```bash
cd C:/Users/laich/Documents/HKCSDA/HKCSDA/hkscda
git worktree add .worktrees/sponsorship-admin-review -b docs/sponsorship-admin-review-impl docs/sponsorship-admin-review-design
cd .worktrees/sponsorship-admin-review
bun install --frozen-lockfile
```

Expected: worktree created; `git log --oneline -1` shows `docs: design the BP-4 sponsorship pledge admin review re-implementation`. All subsequent tasks run inside `.worktrees/sponsorship-admin-review`.

- [ ] **Step 2: Baseline gate**

```bash
bun run typecheck && bun test --isolate 2>&1 | tail -3
```

Expected: typecheck clean; all tests pass (0 fail — the count has grown past the plan-era 1,253). If the baseline is red, STOP and report; do not build on a red base.

---

### Task 1: Consolidated migration + migration-safety tests

**Files:**
- Create: `supabase/migrations/20260829180000_sponsorship_pledge_admin_review.sql`
- Modify: `src/lib/supabaseMigrations.test.ts` (append one test inside the existing `describe("supabase migration safety", ...)` block, before its closing `});`)

The reference branch had three migrations; the spec consolidates them into one file. Concatenating their SQL bodies in order (base changes → optional-file alters → message idempotency index) preserves the already-reviewed SQL verbatim while producing a single file.

- [ ] **Step 1: Write the failing test**

Append inside the `describe` block at the end of `src/lib/supabaseMigrations.test.ts` (adapted from the reference's two tests — both now read the one consolidated file, plus assertions for the message-idempotency index from the reference's third migration):

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
    expect(sql).toContain("v_pledge.status <> 'provisional'");
    expect(sql).toContain("v_proof.review_status <> 'pending'");
    expect(sql).toContain("v_new_review_status := 'approved';");
    expect(sql).toContain("v_new_pledge_status := 'active';");
    expect(sql).toContain("v_new_review_status := 'rejected';");
    expect(sql).toContain("v_new_pledge_status := 'needs_followup';");

    expect(sql).toMatch(
      /revoke all on function public\.record_sponsorship_payment_proof\([\s\S]*?\) from public;\ngrant execute on function public\.record_sponsorship_payment_proof\([\s\S]*?\) to service_role;/,
    );
    expect(sql).toMatch(
      /revoke all on function public\.review_sponsorship_payment_proof\([\s\S]*?\) from public;\ngrant execute on function public\.review_sponsorship_payment_proof\([\s\S]*?\) to service_role;/,
    );
    expect(sql).toMatch(
      /revoke all on function public\.cancel_sponsorship_pledge\([\s\S]*?\) from public;\ngrant execute on function public\.cancel_sponsorship_pledge\([\s\S]*?\) to service_role;/,
    );

    // Folded follow-up 1: a staff-recorded payment may have no file, but the
    // payment facts themselves stay required.
    expect(sql).toContain("alter column storage_path drop not null");
    expect(sql).toContain("alter column file_name drop not null");
    expect(sql).toContain("drop constraint if exists sponsorship_payment_proof_file_type_check");
    expect(sql).toContain(
      "check (file_type is null or file_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf'))",
    );
    expect(sql).toContain("drop constraint if exists sponsorship_payment_proof_file_size_check");
    expect(sql).toContain("check (file_size is null or (file_size > 0 and file_size <= 8388608))");
    for (const column of [
      "payment_method",
      "reference",
      "amount_cents",
      "payment_date",
      "review_status",
      "source",
    ]) {
      expect(sql).not.toContain(`alter column ${column} drop not null`);
    }

    // Folded follow-up 2: DB-level idempotency for lifecycle emails.
    expect(sql).toContain("create unique index if not exists message_pledge_status_update_unique");
    expect(sql).toContain("payload ->> 'kind' = 'sponsorship_pledge_status_update'");
  });
```

- [ ] **Step 2: Run to verify failure**

```bash
bun test src/lib/supabaseMigrations.test.ts 2>&1 | tail -5
```

Expected: FAIL — `readMigrationBySuffix` finds no file matching `_sponsorship_pledge_admin_review.sql` (it either throws or the first `toContain` fails; either failure mode is the correct red).

- [ ] **Step 3: Create the consolidated migration**

```bash
REF=origin/feat/sponsorship-pledge-admin-review
{
  git show $REF:supabase/migrations/20260702183000_sponsorship_pledge_admin_review.sql
  echo ""
  git show $REF:supabase/migrations/20260703110000_sponsorship_payment_proof_optional_file.sql
  echo ""
  git show $REF:supabase/migrations/20260703090000_pledge_status_update_message_unique.sql
} > supabase/migrations/20260829180000_sponsorship_pledge_admin_review.sql
```

Then open the file and add this header comment at the very top:

```sql
-- BP-4 (2026-08-29): consolidated re-take of the July reference branch's
-- three migrations (20260702183000, 20260703110000, 20260703090000 on
-- feat/sponsorship-pledge-admin-review), unchanged except for this header.
-- See docs/superpowers/specs/2026-08-29-sponsorship-admin-review-design.md.
-- NOT applied to the live database by the implementation PR; live apply is a
-- separate, explicitly-confirmed operational step (spec: "Live-apply gate").
```

Sanity-check the concatenation:

```bash
grep -c "create or replace function" supabase/migrations/20260829180000_sponsorship_pledge_admin_review.sql
```

Expected: `3`

- [ ] **Step 4: Run tests to verify pass**

```bash
bun test src/lib/supabaseMigrations.test.ts 2>&1 | tail -5
```

Expected: PASS (all tests in the file, including the pre-existing ones).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260829180000_sponsorship_pledge_admin_review.sql src/lib/supabaseMigrations.test.ts
git commit -m "feat: add the sponsorship pledge admin review migration (consolidated)"
```

---

### Task 2: Export the shared validators from `sponsorship/schemas.ts`

The reference's `sponsorshipAdmin/schemas.ts` imports `trimmed`, `optionalTrimmed`, `isoDate`, `isIsoDate` from `src/lib/sponsorship/schemas.ts`, which are still module-private on `main`. The file is byte-identical to the reference's base, so the reference diff applies cleanly.

**Files:**
- Modify: `src/lib/sponsorship/schemas.ts:19-31` (add `export` to four declarations; no behavior change)

- [ ] **Step 1: Apply the reference diff**

```bash
REF=origin/feat/sponsorship-pledge-admin-review
BASE=9a0213577a2cc2b6c5ef9f88dfd53921813fab73
git diff $BASE $REF -- src/lib/sponsorship/schemas.ts | git apply
git diff --stat
```

Expected: `src/lib/sponsorship/schemas.ts | 8 ++++----`. If `git apply` rejects (it should not — file unchanged since `$BASE`), make the edits manually: add `export` in front of `const trimmed`, `const optionalTrimmed`, `function isIsoDate`, `const isoDate`.

- [ ] **Step 2: Run the module's tests**

```bash
bun test src/lib/sponsorship/ 2>&1 | tail -3
```

Expected: PASS, no failures.

- [ ] **Step 3: Commit**

```bash
git add src/lib/sponsorship/schemas.ts
git commit -m "refactor: export sponsorship schema validators for the admin module"
```

---

### Task 3: `sponsorshipAdmin` types + schemas

**Files:**
- Create: `src/lib/sponsorshipAdmin/types.ts` (115 lines, extracted)
- Create: `src/lib/sponsorshipAdmin/schemas.ts` (55 lines, extracted + one addition)
- Test: `src/lib/sponsorshipAdmin/schemas.test.ts` (238 lines, extracted)

- [ ] **Step 1: Extract the failing test**

```bash
REF=origin/feat/sponsorship-pledge-admin-review
mkdir -p src/lib/sponsorshipAdmin
git show $REF:src/lib/sponsorshipAdmin/schemas.test.ts > src/lib/sponsorshipAdmin/schemas.test.ts
bun test src/lib/sponsorshipAdmin/schemas.test.ts 2>&1 | tail -3
```

Expected: FAIL — cannot resolve `./schemas` / `./types`.

- [ ] **Step 2: Extract the implementation**

```bash
git show $REF:src/lib/sponsorshipAdmin/types.ts > src/lib/sponsorshipAdmin/types.ts
git show $REF:src/lib/sponsorshipAdmin/schemas.ts > src/lib/sponsorshipAdmin/schemas.ts
```

Then add to `src/lib/sponsorshipAdmin/schemas.ts` (new in this re-take — the single source for the review roles, consumed by the route wiring in Task 9 and asserted against the access area in Task 12). Put the `import type` line with the other imports at the top of the file, the constant at the bottom:

```ts
import type { AdminRole } from "../admin/access";

/**
 * The roles allowed to review pledges. Must stay in lockstep with the
 * `sponsorshipReview` access area in src/lib/admin/access.ts —
 * src/lib/admin/access.test.ts asserts the two agree.
 */
export const SPONSORSHIP_REVIEW_ROLES = ["staff", "admin"] as const satisfies readonly AdminRole[];
```

- [ ] **Step 3: Run tests to verify pass**

```bash
bun test src/lib/sponsorshipAdmin/schemas.test.ts 2>&1 | tail -3
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/sponsorshipAdmin/
git commit -m "feat: add sponsorship admin review types and input schemas"
```

---

### Task 4: Pledge status-update email template

`src/lib/sponsorship/emailTemplates.server.ts` and its test are byte-identical to the reference's base on current `main`, so the reference diff (which adds `renderPledgeStatusUpdateEmail` + ~147 lines and its tests) applies cleanly.

**Files:**
- Modify: `src/lib/sponsorship/emailTemplates.server.ts` (+~147 lines)
- Modify: `src/lib/sponsorship/emailTemplates.server.test.ts` (reference's added tests)

- [ ] **Step 1: Apply the test diff and verify failure**

```bash
REF=origin/feat/sponsorship-pledge-admin-review
BASE=9a0213577a2cc2b6c5ef9f88dfd53921813fab73
git diff $BASE $REF -- src/lib/sponsorship/emailTemplates.server.test.ts | git apply
bun test src/lib/sponsorship/emailTemplates.server.test.ts 2>&1 | tail -3
```

Expected: FAIL — `renderPledgeStatusUpdateEmail` is not exported.

- [ ] **Step 2: Apply the implementation diff**

```bash
git diff $BASE $REF -- src/lib/sponsorship/emailTemplates.server.ts | git apply
```

- [ ] **Step 3: Run tests to verify pass**

```bash
bun test src/lib/sponsorship/emailTemplates.server.test.ts 2>&1 | tail -3
```

Expected: PASS — all 4 events render bilingually, HTML-escaped, `needs_followup` carries the `mailto:` fallback.

- [ ] **Step 4: Commit**

```bash
git add src/lib/sponsorship/emailTemplates.server.ts src/lib/sponsorship/emailTemplates.server.test.ts
git commit -m "feat: add the bilingual pledge status-update email template"
```

---

### Task 5: `sponsorshipAdmin` repository

**Files:**
- Create: `src/lib/sponsorshipAdmin/repository.server.ts` (384 lines, extracted)
- Test: `src/lib/sponsorshipAdmin/repository.server.test.ts` (606 lines, extracted)

- [ ] **Step 1: Extract the failing test**

```bash
REF=origin/feat/sponsorship-pledge-admin-review
git show $REF:src/lib/sponsorshipAdmin/repository.server.test.ts > src/lib/sponsorshipAdmin/repository.server.test.ts
bun test src/lib/sponsorshipAdmin/repository.server.test.ts 2>&1 | tail -3
```

Expected: FAIL — cannot resolve `./repository.server`.

- [ ] **Step 2: Extract the implementation**

```bash
git show $REF:src/lib/sponsorshipAdmin/repository.server.ts > src/lib/sponsorshipAdmin/repository.server.ts
```

- [ ] **Step 3: Run tests to verify pass**

```bash
bun test src/lib/sponsorshipAdmin/repository.server.test.ts 2>&1 | tail -3
```

Expected: PASS — RPC wrappers, list/detail shaping, proof history ordering.

- [ ] **Step 4: Commit**

```bash
git add src/lib/sponsorshipAdmin/repository.server.ts src/lib/sponsorshipAdmin/repository.server.test.ts
git commit -m "feat: add the sponsorship admin repository (RPC wrappers, list/detail)"
```

---

### Task 6: `sponsorshipAdmin` notifications

**Files:**
- Create: `src/lib/sponsorshipAdmin/notifications.server.ts` (134 lines, extracted)
- Test: `src/lib/sponsorshipAdmin/notifications.server.test.ts` (201 lines, extracted)

- [ ] **Step 1: Extract the failing test**

```bash
REF=origin/feat/sponsorship-pledge-admin-review
git show $REF:src/lib/sponsorshipAdmin/notifications.server.test.ts > src/lib/sponsorshipAdmin/notifications.server.test.ts
bun test src/lib/sponsorshipAdmin/notifications.server.test.ts 2>&1 | tail -3
```

Expected: FAIL — cannot resolve `./notifications.server`.

- [ ] **Step 2: Extract the implementation**

```bash
git show $REF:src/lib/sponsorshipAdmin/notifications.server.ts > src/lib/sponsorshipAdmin/notifications.server.ts
```

- [ ] **Step 3: Run tests to verify pass**

```bash
bun test src/lib/sponsorshipAdmin/notifications.server.test.ts 2>&1 | tail -3
```

Expected: PASS — queued-before-send claim, 23505 duplicate short-circuits without sending, failure marks the `message` row `failed`, never throws.

- [ ] **Step 4: Commit**

```bash
git add src/lib/sponsorshipAdmin/notifications.server.ts src/lib/sponsorshipAdmin/notifications.server.test.ts
git commit -m "feat: add idempotent pledge status-update email sending"
```

---

### Task 7: `sponsorshipAdmin` service

**Files:**
- Create: `src/lib/sponsorshipAdmin/service.ts` (166 lines, extracted)
- Test: `src/lib/sponsorshipAdmin/service.test.ts` (484 lines, extracted)

- [ ] **Step 1: Extract the failing test**

```bash
REF=origin/feat/sponsorship-pledge-admin-review
git show $REF:src/lib/sponsorshipAdmin/service.test.ts > src/lib/sponsorshipAdmin/service.test.ts
bun test src/lib/sponsorshipAdmin/service.test.ts 2>&1 | tail -3
```

Expected: FAIL — cannot resolve `./service`.

- [ ] **Step 2: Extract the implementation**

```bash
git show $REF:src/lib/sponsorshipAdmin/service.ts > src/lib/sponsorshipAdmin/service.ts
```

- [ ] **Step 3: Run tests to verify pass**

```bash
bun test src/lib/sponsorshipAdmin/service.test.ts 2>&1 | tail -3
```

Expected: PASS — validation, state-guard mapping, email fired per event only after the repo call succeeds, email failure swallowed.

- [ ] **Step 4: Commit**

```bash
git add src/lib/sponsorshipAdmin/service.ts src/lib/sponsorshipAdmin/service.test.ts
git commit -m "feat: add the sponsorship admin service (record/review/cancel + emails)"
```

---

### Task 8: `sponsorshipAdmin` HTTP layer

**Files:**
- Create: `src/lib/sponsorshipAdmin/http.server.ts` (179 lines, extracted)
- Test: `src/lib/sponsorshipAdmin/http.test.ts` (327 lines, extracted)

- [ ] **Step 1: Extract the failing test**

```bash
REF=origin/feat/sponsorship-pledge-admin-review
git show $REF:src/lib/sponsorshipAdmin/http.test.ts > src/lib/sponsorshipAdmin/http.test.ts
bun test src/lib/sponsorshipAdmin/http.test.ts 2>&1 | tail -3
```

Expected: FAIL — cannot resolve `./http.server`.

- [ ] **Step 2: Extract the implementation**

```bash
git show $REF:src/lib/sponsorshipAdmin/http.server.ts > src/lib/sponsorshipAdmin/http.server.ts
```

- [ ] **Step 3: Run tests to verify pass**

```bash
bun test src/lib/sponsorshipAdmin/http.test.ts 2>&1 | tail -3
```

Expected: PASS — auth gate → 401/403, happy paths, 400/404/409 mapping, `Cache-Control: no-store` on every response.

- [ ] **Step 4: Commit**

```bash
git add src/lib/sponsorshipAdmin/http.server.ts src/lib/sponsorshipAdmin/http.test.ts
git commit -m "feat: add the sponsorship admin HTTP handlers"
```

---

### Task 9: API routes + route tree

**Files:**
- Create: `src/routes/api/admin/sponsorships/pledges.ts` (11 lines, extracted)
- Create: `src/routes/api/admin/sponsorships/pledges/$id.ts` (11 lines, extracted)
- Create: `src/routes/api/admin/sponsorships/pledges/$id/cancel.ts` (extracted)
- Create: `src/routes/api/admin/sponsorships/pledges/$id/proof-url.ts` (extracted)
- Create: `src/routes/api/admin/sponsorships/pledges/$id/proof.ts` (extracted)
- Create: `src/routes/api/admin/sponsorships/pledges/$id/review.ts` (extracted)
- Create: `src/routes/api/admin/sponsorships/pledges/-handlers.ts` (44 lines, extracted + 1 adaptation)
- Create: `src/routes/api/admin/sponsorships/pledges/-recordPaymentUpload.ts` (112 lines, extracted)
- Test: `src/routes/api/admin/sponsorships/pledges/-recordPaymentUpload.test.ts` (280 lines, extracted)
- Modify: `src/routeTree.gen.ts` (regenerated by the build — never by hand)

- [ ] **Step 1: Extract the failing test**

```bash
REF=origin/feat/sponsorship-pledge-admin-review
mkdir -p "src/routes/api/admin/sponsorships/pledges/\$id"
git show "$REF:src/routes/api/admin/sponsorships/pledges/-recordPaymentUpload.test.ts" > "src/routes/api/admin/sponsorships/pledges/-recordPaymentUpload.test.ts"
bun test "src/routes/api/admin/sponsorships/pledges/-recordPaymentUpload.test.ts" 2>&1 | tail -3
```

Expected: FAIL — cannot resolve `./-recordPaymentUpload`.

- [ ] **Step 2: Extract the route files**

```bash
for f in "pledges.ts" "pledges/\$id.ts" "pledges/\$id/cancel.ts" "pledges/\$id/proof-url.ts" "pledges/\$id/proof.ts" "pledges/\$id/review.ts" "pledges/-handlers.ts" "pledges/-recordPaymentUpload.ts"; do
  git show "$REF:src/routes/api/admin/sponsorships/$f" > "src/routes/api/admin/sponsorships/$f"
done
```

- [ ] **Step 3: Wire the roles constant into the handlers**

In `src/routes/api/admin/sponsorships/pledges/-handlers.ts`, add the import:

```ts
import { SPONSORSHIP_REVIEW_ROLES } from "../../../../../lib/sponsorshipAdmin/schemas";
```

and replace

```ts
  const requireCoordinator = (request: Request) =>
    requireAdmin(request, ["staff", "admin"], client);
```

with

```ts
  const requireCoordinator = (request: Request) =>
    requireAdmin(request, [...SPONSORSHIP_REVIEW_ROLES], client);
```

- [ ] **Step 4: Regenerate the route tree and run the tests**

```bash
VITE_SUPABASE_URL=https://example.supabase.co VITE_SUPABASE_ANON_KEY=ci-placeholder-anon-key bun run build 2>&1 | tail -2
git status --short src/routeTree.gen.ts
bun test "src/routes/api/admin/sponsorships/" 2>&1 | tail -3
```

Expected: build OK; `routeTree.gen.ts` modified (six new route ids); upload tests PASS (eligibility check, MIME/size 400s, storage upload path, delegation to `recordPayment`).

- [ ] **Step 5: Typecheck**

```bash
bun run typecheck
```

Expected: clean. (This is the step that catches a stale route tree — the exact failure mode that killed PR #60.)

- [ ] **Step 6: Commit (including the regenerated route tree)**

```bash
git add src/routes/api/admin/sponsorships/ src/routeTree.gen.ts
git commit -m "feat: add the admin sponsorship pledge API routes"
```

---

### Task 10: Status API returns the newest proof

On `main`, `/api/sponsorships/status/$token` still assumes one proof per pledge (`.maybeSingle()` with no ordering). With proof history it must read the newest row. The file is unchanged since `$BASE`, so the reference's 2-line diff applies cleanly.

**Files:**
- Modify: `src/routes/api/sponsorships/status/$token.ts:69-74`

- [ ] **Step 1: Apply the diff**

```bash
REF=origin/feat/sponsorship-pledge-admin-review
BASE=9a0213577a2cc2b6c5ef9f88dfd53921813fab73
git diff $BASE $REF -- "src/routes/api/sponsorships/status/\$token.ts" | git apply
git diff -- "src/routes/api/sponsorships/status/\$token.ts"
```

Expected diff — the proof query gains, between `.eq("pledge_id", tokenRow.entity_id)` and `.maybeSingle()`:

```ts
        .order("created_at", { ascending: false })
        .limit(1)
```

- [ ] **Step 2: Run the status tests**

```bash
bun test "src/routes/sponsors_.status.\$token.test.tsx" 2>&1 | tail -3
```

Expected: PASS (no contract change — same response shape).

- [ ] **Step 3: Commit**

```bash
git add "src/routes/api/sponsorships/status/\$token.ts"
git commit -m "fix: status API reads the newest payment proof once history exists"
```

---

### Task 11: CRM supporter timeline surfaces pledge audit rows

**Files:**
- Modify: `src/lib/crm/repository.server.ts` (`getSupporterDetail`, ~line 505)
- Test: `src/lib/crm/repository.server.test.ts` (221 lines, extracted — `main` has no test file at this path, verified 2026-08-29)

- [ ] **Step 1: Extract the failing test**

```bash
REF=origin/feat/sponsorship-pledge-admin-review
git show $REF:src/lib/crm/repository.server.test.ts > src/lib/crm/repository.server.test.ts
bun test src/lib/crm/repository.server.test.ts 2>&1 | tail -3
```

Expected: FAIL — the fake client receives no `sponsorship_pledge` query and the pledge audit row is missing from the timeline.

- [ ] **Step 2: Apply the fix**

In `src/lib/crm/repository.server.ts`, inside `getSupporterDetail`, replace:

```ts
      const { data: donationData, error: donationError } = await client
        .from("donation")
        .select("*")
        .eq("supporter_id", id)
        .order("created_at", { ascending: false });
      if (donationError) throw donationError;
      const donationRows = (donationData ?? []) as DonationRow[];
      const donationIds = donationRows.map((row) => row.id);
```

with:

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
```

and further down in the same function, in the `audit_log` query, replace:

```ts
            .in("entity_id", [id, ...donationIds])
```

with:

```ts
            .in("entity_id", [id, ...donationIds, ...pledgeIds])
```

- [ ] **Step 3: Run tests to verify pass**

```bash
bun test src/lib/crm/ 2>&1 | tail -3
```

Expected: PASS, including every pre-existing CRM test.

- [ ] **Step 4: Commit**

```bash
git add src/lib/crm/repository.server.ts src/lib/crm/repository.server.test.ts
git commit -m "feat: surface pledge audit entries in the supporter timeline"
```

---

### Task 12: `sponsorshipReview` access area

**Files:**
- Modify: `src/lib/admin/access.ts` (type + two role sets)
- Test: `src/lib/admin/access.test.ts` (append one test)

- [ ] **Step 1: Write the failing test**

Append to `src/lib/admin/access.test.ts` (match the file's existing import/`describe` style; it already imports `canRoleAccessAdminArea` — add the roles-constant import at the top with the others):

```ts
import { SPONSORSHIP_REVIEW_ROLES } from "../sponsorshipAdmin/schemas";

test("sponsorshipReview area agrees with the API route roles", () => {
  const allRoles = ["staff", "treasurer", "admin"] as const;
  for (const role of allRoles) {
    expect(canRoleAccessAdminArea(role, "sponsorshipReview")).toBe(
      (SPONSORSHIP_REVIEW_ROLES as readonly string[]).includes(role),
    );
  }
});
```

- [ ] **Step 2: Run to verify failure**

```bash
bun run typecheck 2>&1 | head -5
```

Expected: typecheck FAILS — `"sponsorshipReview"` is not assignable to `AdminAccessArea`.

- [ ] **Step 3: Implement**

In `src/lib/admin/access.ts`:

1. Add to the `AdminAccessArea` union, after `| "governanceManagement"`:

```ts
  | "sponsorshipReview"
```

2. In `ROLE_ACCESS`, add `"sponsorshipReview"` to the `staff` set (after `"contentManagement"`) and to the `admin` set (after `"governanceManagement"`). Do **not** add it to `treasurer`.

- [ ] **Step 4: Run tests to verify pass**

```bash
bun run typecheck && bun test src/lib/admin/access.test.ts 2>&1 | tail -3
```

Expected: typecheck clean; PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin/access.ts src/lib/admin/access.test.ts
git commit -m "feat: add the sponsorshipReview admin access area"
```

---

### Task 13: Admin i18n labels

**Files:**
- Modify: `src/components/admin/adminI18n.tsx` (three spots — the `AdminCopy` interface's `dashboard` block and both language objects' `dashboard` blocks)

The file drifted since `$BASE` (+83 lines), so edit manually rather than applying the reference diff. The three anchor lines below still exist verbatim on `main`.

- [ ] **Step 1: Add the keys**

1. In `interface AdminCopy`, `dashboard: { ... }`, after the line `openAdoptionCases: string;`:

```ts
    sponsorViewAnimals: string;
    sponsorViewPledges: string;
```

2. In the `"zh-HK"` object's `dashboard` block, after `openAdoptionCases: "開啟領養個案",`:

```ts
      sponsorViewAnimals: "動物列表",
      sponsorViewPledges: "承諾審核",
```

3. In the `en` object's `dashboard` block, after `openAdoptionCases: "Open adoption cases",`:

```ts
      sponsorViewAnimals: "Animal list",
      sponsorViewPledges: "Pledge review",
```

- [ ] **Step 2: Typecheck (both languages must carry the keys or the `Record<AdminLanguage, AdminCopy>` type errors)**

```bash
bun run typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/adminI18n.tsx
git commit -m "feat: add sponsor view-toggle labels to admin i18n"
```

---

### Task 14: Pledge review UI logic

**Files:**
- Create: `src/components/admin/sponsorship/pledgeReviewLogic.ts` (95 lines, extracted)
- Test: `src/components/admin/sponsorship/pledgeReviewLogic.test.ts` (174 lines, extracted)

- [ ] **Step 1: Extract the failing test**

```bash
REF=origin/feat/sponsorship-pledge-admin-review
mkdir -p src/components/admin/sponsorship
git show $REF:src/components/admin/sponsorship/pledgeReviewLogic.test.ts > src/components/admin/sponsorship/pledgeReviewLogic.test.ts
bun test src/components/admin/sponsorship/pledgeReviewLogic.test.ts 2>&1 | tail -3
```

Expected: FAIL — cannot resolve `./pledgeReviewLogic`.

- [ ] **Step 2: Extract the implementation**

```bash
git show $REF:src/components/admin/sponsorship/pledgeReviewLogic.ts > src/components/admin/sponsorship/pledgeReviewLogic.ts
```

- [ ] **Step 3: Run tests to verify pass**

```bash
bun test src/components/admin/sponsorship/pledgeReviewLogic.test.ts 2>&1 | tail -3
```

Expected: PASS — search-param building, status tones, state gates (`canRecordPayment`/`canReviewProof`/`canCancelPledge`), file validation, formatting.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/sponsorship/
git commit -m "feat: add pledge review lane/drawer pure logic"
```

---

### Task 15: Review lane + detail drawer components

**Files:**
- Create: `src/components/admin/sponsorship/PledgeReviewLane.tsx` (275 lines, extracted)
- Create: `src/components/admin/sponsorship/PledgeDetailDrawer.tsx` (435 lines, extracted)

Both import only things verified to exist on `main` (`fetchCoordinatorJson` — now an alias of `fetchAdminJson` — `DataTable`, `StatusPill`, `ui/{button,input,label,select,sheet}`, `pledgeReviewLogic`, `sponsorshipAdmin/types`). Per the project's admin-panel precedent, they have no component-level tests; their logic lives in `pledgeReviewLogic` (Task 14).

- [ ] **Step 1: Extract**

```bash
REF=origin/feat/sponsorship-pledge-admin-review
git show $REF:src/components/admin/sponsorship/PledgeReviewLane.tsx > src/components/admin/sponsorship/PledgeReviewLane.tsx
git show $REF:src/components/admin/sponsorship/PledgeDetailDrawer.tsx > src/components/admin/sponsorship/PledgeDetailDrawer.tsx
```

- [ ] **Step 2: Typecheck and lint**

```bash
bun run typecheck && bun run lint 2>&1 | tail -3
```

Expected: typecheck clean; lint 0 errors (the 30 pre-existing react-refresh warnings are known). If prettier complains about the extracted files, run `bunx prettier --write src/components/admin/sponsorship/` and re-lint.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/sponsorship/
git commit -m "feat: add the pledge review lane and detail drawer"
```

---

### Task 16: Dashboard view toggle, gated by the access area

**Files:**
- Modify: `src/routes/admin/index.tsx` (108 lines on `main`; the reference's toggle diff nearly applies, but this re-take also gates the toggle on the `sponsorshipReview` area, which did not exist in July)

- [ ] **Step 1: Edit the file**

1. Add imports. `useState` joins React imports (the file currently has none from `react` — add `import { useState } from "react";`); merge the access import with the existing one:

```tsx
import { useState } from "react";
import { PledgeReviewLane } from "../../components/admin/sponsorship/PledgeReviewLane";
import { adminIdentityQueryOptions } from "../../lib/admin/identity";
import { canRoleAccessAdminArea, getAdminAreaForLocation } from "../../lib/admin/access";
```

(Replace the existing `import { getAdminAreaForLocation } from "../../lib/admin/access";` line with the merged form.)

2. In `AdminDashboardContent`, after `const { copy } = useAdminLanguage();`:

```tsx
  const { data: identity } = useQuery(adminIdentityQueryOptions());
  const canReviewPledges =
    identity != null && canRoleAccessAdminArea(identity.role, "sponsorshipReview");
  const [sponsorView, setSponsorView] = useState<"animals" | "pledges">("animals");
  const showPledgeReview = section === "sponsor" && canReviewPledges && sponsorView === "pledges";
```

3. Change the animals query's `enabled` line from:

```tsx
    enabled: section !== "applications" && section !== "payments",
```

to:

```tsx
    enabled: section !== "applications" && section !== "payments" && !showPledgeReview,
```

4. In the header JSX, insert a new branch for the sponsor section **before** the existing `section !== "applications"` branch (so sponsor with review access no longer falls through to the "+ add new" link; a role without the area sees the section exactly as today):

```tsx
        ) : section === "sponsor" && canReviewPledges ? (
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
              {copy.dashboard.sponsorViewAnimals}
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
              {copy.dashboard.sponsorViewPledges}
            </button>
          </div>
```

5. In the body JSX, insert the review branch before the `isLoading` branch:

```tsx
      ) : showPledgeReview ? (
        <PledgeReviewLane />
```

- [ ] **Step 2: Typecheck, lint, and run the admin tests**

```bash
bun run typecheck && bun run lint 2>&1 | tail -3 && bun test src/routes/admin/ src/components/admin/ 2>&1 | tail -3
```

Expected: all clean/PASS.

- [ ] **Step 3: Commit**

```bash
git add src/routes/admin/index.tsx
git commit -m "feat: add the pledge review view toggle to the sponsor admin section"
```

---

### Task 17: Full verification gate

- [ ] **Step 1: The complete pre-PR gate**

```bash
bun run typecheck
bun test --isolate 2>&1 | tail -3
bun run lint 2>&1 | tail -3
VITE_SUPABASE_URL=https://example.supabase.co VITE_SUPABASE_ANON_KEY=ci-placeholder-anon-key bun run build 2>&1 | tail -2
git diff --exit-code -- src/routeTree.gen.ts
```

Expected: typecheck clean · 0 test failures (baseline count + the new files) · lint 0 errors / 30 known warnings · build OK · route-tree parity clean.

- [ ] **Step 2: Contract greps (paste outputs into the PR)**

```bash
# no service key/secret leaks into client paths
grep -rniE "service_role|SUPABASE_SERVICE" src/ --include=*.tsx --include=*.ts | grep -viE "\.server\.|routes/api/|\.functions\.ts|\.test\."
# no hardcoded colours in the new UI
grep -rnE "#[0-9a-fA-F]{6}" src/components/admin/sponsorship --include=*.tsx | grep -v "var(--"
# public sponsorship contract untouched (URLs, params, localStorage)
git diff origin/main...HEAD --stat -- src/routes/sponsors.tsx src/routes/sponsors_.pledge.tsx "src/routes/sponsors_.\$id.tsx" src/lib/publicAdoption/
```

Expected: first two greps empty; third shows **no changes** (the only public-side change in this PR is the `/api/sponsorships/status/$token` newest-proof ordering, same response schema).

- [ ] **Step 3: Confirm a clean tree**

```bash
git status --short
```

Expected: clean (everything committed in its task).

---

### Task 18: Open the draft PR

- [ ] **Step 1: Push and open**

```bash
git push -u origin docs/sponsorship-admin-review-impl
gh pr create --draft --title "BP-4: sponsorship pledge admin review" --body "$(cat <<'EOF'
Re-implements the July `feat/sponsorship-pledge-admin-review` work on current `main` (integration-plan C-8: re-implement, don't rebase). Spec: `docs/superpowers/specs/2026-08-29-sponsorship-admin-review-design.md`.

**What staff get:** a 承諾審核 view inside the sponsor admin section — record a payment (file optional), approve/reject proof (auto-transitioning the pledge to active / needs_followup), cancel a pledge. Every action re-validates the actor inside a SECURITY DEFINER RPC, writes one audit_log row, and sends a bilingual, DB-idempotent status email. Pledge audit rows now appear in the CRM supporter timeline.

**Adaptations vs the July reference (per spec):** new `sponsorshipReview` access area (staff+admin) gating the view; one consolidated migration; current adminI18n structure.

**Contracts held:** no public URL/param/loader/action/schema change. The only public-side diff is `/api/sponsorships/status/$token` reading the newest proof row (same response shape) — required once proof history exists.

**⚠ Not applied to the live database.** `supabase/migrations/20260829180000_sponsorship_pledge_admin_review.sql` ships in the repo only; until it is applied (candidate to batch with the still-pending `20260829120000_governance_board_members.sql`), the review view shows its error state. Live apply is a separate explicitly-confirmed step.

**D-9:** this builds the admin capability only; sponsorship go-live terms stay with the owner.

Verification outputs and contract greps: see the comment below.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 2: Attach the verification outputs**

Post a PR comment with the Task 17 command outputs (typecheck/test/lint/build tails, route-tree parity, the three greps).

- [ ] **Step 3: Stop**

Wait for the tech lead's review. Do not merge. After merge, remind the user that the migration (plus BP-3's `board_member` one) still needs the explicitly-confirmed live apply against project `iihqjzilgawhfdhdevam`.

---

## Self-review checklist (done at plan-writing time)

- **Spec coverage:** data model + RPCs + idempotency index (Task 1), shared validators (2), types/schemas + roles constant (3), email template (4), repository (5), notifications (6), service (7), HTTP (8), routes + signed proof URL + multipart upload + route tree (9), status-page newest-proof (10), CRM timeline (11), access area + agreement test (12), i18n (13), UI logic (14), components (15), toggle + area gating (16), full gate + contract greps (17), draft PR + live-apply warning + D-9 note (18). The spec's out-of-scope list has no tasks, as intended.
- **Type consistency:** `SPONSORSHIP_REVIEW_ROLES` defined once in `sponsorshipAdmin/schemas.ts` (Task 3), consumed in Tasks 9 and 12. The `"sponsorshipReview"` literal is identical in Tasks 12 and 16. The i18n keys `sponsorViewAnimals`/`sponsorViewPledges` are identical in Tasks 13 and 16.
- **Extraction safety:** every `git apply` target verified byte-unchanged between `$BASE` and `origin/main` on 2026-08-29; every extracted file verified absent on `main`; every cross-module import of extracted code verified present on `main` (including `fetchCoordinatorJson`, which survives as an alias re-export).
