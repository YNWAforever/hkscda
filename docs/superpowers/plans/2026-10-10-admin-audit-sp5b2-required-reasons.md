# SP-5b-2 Required Reasons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Financial and irreversible admin actions require a typed reason. The reason travels from `ConfirmActionDialog` through the API route, the service and the audited RPC into `audit_log.detail.reason`.

**Architecture:**

- One server-side reason schema (`src/lib/admin/requiredReason.ts`) and one dialog preset (`requiredReasonDialog`).
- A registry of every required-reason action. A ratchet guard proves that each listed action has its dialog, or its existing required inline field, and a tagged pass-through test.
- Six backward-compatible migrations make the RPCs record the reason. Production can take them before this branch deploys. The app's zod schemas are what make the reason required.

**Tech Stack:** TanStack Start, React 19, React Query, zod, Supabase Postgres (plpgsql RPCs), Bun tests.

**Spec:** `docs/superpowers/specs/2026-10-10-admin-audit-sp5b-admin-ux-conformance-design.md`, in particular §2 "Required reasons (SP-5b-2)", Global constraints and Owner gates.

**Stacks on:** SP-5b-1 (`codex/audit-final-sp5b-20261010` at 59625875, draft PR #206).

- Branch: `codex/audit-final-sp5b2-20261010`
- Worktree: `.worktrees/audit-final-sp5b2-20261010`

## Decisions made while planning

The plan argues these from the spec and the code. Review them before execution.

- **D1. Backward-compatible SQL.**
  - Every new argument is `p_reason text default null`. Every RPC that takes a jsonb payload reads `payload->>'reason'` instead of gaining an argument.
  - The database records the reason when it is present. The app's zod schemas make it required.
  - Why: the spec requires the migrations to reach production _before_ merge. The currently deployed app sends no reason and must keep working against the migrated database.
  - `void_receipt_with_audit` keeps `'manual'` as the stored reason when none is sent.
  - Making the database itself require the reason is a later migration, after this branch deploys. It is not in this plan.
- **D2. `p_reason` versus a payload key.** The spec says to add a `p_reason text` argument "where an RPC does not take a reason yet".
  - RPCs with a jsonb payload already take arbitrary keys, so the reason rides in the payload.
  - Only fixed-argument RPCs gain `p_reason`: `void_receipt_with_audit`, `set_volunteer_registration_status_with_audit` and `deactivate_faq_entry_with_audit`.
- **D3. Mapping the spec's list to the actions that exist.** Each line is a ruling.

  | Spec item                         | Concrete action in the code                                                                                                  | What this plan does                                                                                                                             |
  | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
  | Void a receipt                    | `POST /api/admin/receipts/$id/void` → `void_receipt_with_audit`                                                              | Migration M1 plus required reason (Task 2)                                                                                                      |
  | Refund a receipt                  | No admin receipt refund exists: provider refunds arrive by webhook. The admin refund is the sponsorship `record_refund`      | Already required (5+ characters) and audited. Registered as `inline` (Task 9)                                                                   |
  | Reallocate or reconcile a payment | Sponsorship `FinancePanel`: reverse, reallocate, reconcile legacy                                                            | Already required (5+ characters) and audited. Registered as `inline` (Task 9)                                                                   |
  | Reallocate or reconcile a payment | Donation mark-received (`payments/$id/reconcile`) and bank-match apply                                                       | **No change.** Both already require a bank reference (1-120 characters) that lands in `audit_log`. That reference is the recorded justification |
  | End a sponsorship                 | Cancel pledge (`pledges/$id/cancel`, note optional)                                                                          | The note becomes a required reason (Task 9)                                                                                                     |
  | End a sponsorship                 | End assignment (`assignments/$assignmentId/end`)                                                                             | **No change.** It already requires a reason code from a fixed list, and the code is audited                                                     |
  | Reject a pledge proof             | `pledges/$id/review` with `decision: "reject"` (note optional)                                                               | The note becomes required on reject (Task 9)                                                                                                    |
  | Reject a registration             | `volunteers/registrations/$id/status` with `status: "rejected"`                                                              | Migration M2 plus required reason (Task 3)                                                                                                      |
  | Reject an application             | An adoption case moves to a status with `is_closing` (`cases/$id/status`)                                                    | The note becomes required for closing statuses (Task 10)                                                                                        |
  | Reject an internship              | `internship_command` `review` with `status: "rejected"`. The reason is already required, but `audit_log` keeps only `result` | Migration M3 adds the reason to `audit_log` (Task 4)                                                                                            |
  | Delete a status                   | `DELETE adoptions/statuses/$id` → `mutate_adoption_coordinator_with_audit`                                                   | Migration M6 plus required reason (Task 7)                                                                                                      |
  | Delete a FAQ                      | Deactivate a FAQ entry → `deactivate_faq_entry_with_audit` (there is no hard delete)                                         | Migration M4 plus a new dialog with required reason (Task 5)                                                                                    |
  | Delete a document                 | `DELETE documents/$id` and annual report delete → `mutate_document_asset_with_audit` / `mutate_annual_report_with_audit`     | **No migration.** The delete branch already writes `p_values` to `audit_log.detail`. Required reason added (Task 8)                             |
  | Delete an estate                  | Estate delete → `mutate_admin_content_with_audit` (`dog_friendly_estate`, `delete`)                                          | Migration M5 plus required reason (Task 6)                                                                                                      |
  | Delete a fee                      | **Does not exist.** Fees can only be reordered or edited                                                                     | Nothing                                                                                                                                         |
  | Delete a board member             | Step down → `mutate_admin_content_with_audit` (`board_member`, `deactivate`)                                                 | Migration M5 plus a new dialog with required reason (Task 6)                                                                                    |
  | Delete a payment method           | **No delete route or UI.** Withdraw and return-to-draft only move an _in-review_ row back to draft, which can be undone      | Nothing                                                                                                                                         |
  | Cancel an activity                | Only the bulk operation cancels. It already requires a reason (zod and SQL) and audits it                                    | Registered as `inline` (Task 11)                                                                                                                |
  | Cancel a case                     | The same path as rejecting an application                                                                                    | Task 10                                                                                                                                         |
  | Bulk versions                     | Activity bulk cancel is the only destructive bulk action                                                                     | Covered above                                                                                                                                   |

- **D4. Knowledge delete** is not in the spec list. Migration M5 also records a reason for it if one is ever sent, but its UI keeps `reason="none"`.
- **D5. Minimum length.** New required reasons use `minLength: 1`, matching the spec's "trimmed, 1-500". The sponsorship finance actions keep their existing server minimum of 5.
- **D6. Copy.**
  - Reason label: 原因 / Reason, already in `confirmActionCopy`.
  - The new dialogs (FAQ, board member) reuse the button's existing wording as both the title and the confirm verb.
  - Their zh consequence sentence is `""`; the English one is new copy. Each new zh draft is added to the SP-5b owner review list.
  - The pledge drawer loses its inline cancel-note field. That is a zh markup change made of existing text, which SP-5b-1 Ruling 6 accepts.
- **D7. Database verification.** No shared stack may run these migrations, so every migration gets two kinds of test:
  - A **static body-diff test**: the new function body equals the previous definition apart from the listed edits.
  - A `*.database.test.ts` that runs only where `SUPABASE_LOCAL_URL` answers.

  Executors run the database tests only on an isolated, disposable stack, never the shared one on port 55321. If none is available, the report says "not run". The owner applies the migrations to production (Owner gates) and runs `scripts/check-release-schema.ts`.

## Global Constraints

- **zh rendering** stays byte-identical except for the dialog changes in D6. Every new zh line is drafted in `docs/superpowers/plans/2026-10-10-admin-audit-sp5b-owner-review.md`.
- **SP-5a rules hold:**
  - bilingual copy modules (`defineAdminCopy`), with no Chinese outside copy modules;
  - `adminCopyGuard`, `adminErrorRenderGuard` and the English smoke test with its empty allow-list;
  - glossary terms;
  - no BOMs or invisible characters.
- **SP-5b-1 rules hold:**
  - every destructive action uses `ConfirmActionDialog`;
  - `onConfirm` awaits `mutateAsync` (`confirmSettlesGuard`);
  - errors go through `LoadFailure` and `adminErrorMessage`.
- **Project rules:**
  - injectable clocks;
  - `var(--color-*)` tokens only;
  - zero `any`;
  - admin data only through `/api/admin/**` with `requireAdmin`;
  - service-role mutations audited inside a `*_with_audit` RPC.
- **Reason contract:**
  - The reason is trimmed and 1-500 characters (zod), and is stored as `audit_log.detail.reason`.
  - Whitespace-only input is rejected with 400 before any RPC call.
  - The dialog caps input at 500 (`CONFIRM_REASON_MAX_LENGTH`).
- **Migrations:**
  - Named `supabase/migrations/202610101300NN_sp5b2_<name>.sql`, with NN = 00..05 in task order.
  - Every `security definer` function keeps its pinned `search_path`; copy it verbatim.
  - Each ends with `revoke all … from public, anon, authenticated, service_role;` and `grant execute … to service_role;` for the new identity.
  - A changed identity is `drop function if exists <old identity>;` then `create function`. Never leave two overloads, because PostgREST cannot choose between them.
  - Never run against the shared local stack.
- **The gate:**
  - `bunx tsc --noEmit`
  - `bun run lint`: 0 errors, warnings ≤ 52
  - `$env:SUPABASE_LOCAL_URL='http://127.0.0.1:1'; bun run test`
  - `bun run build`, with `routeTree.gen.ts` current (restore a reorder-only diff)

## Review Focus

1. **The deployed app calls a migrated RPC without `p_reason` or a payload reason.** The call still succeeds, and the audit row has no `reason` key (void stores `'manual'`).
   - Pinned by each migration's static test: it asserts `default null` on every new argument and a `jsonb_strip_nulls` or `coalesce` path.
   - Also pinned by the database test, where a stack is available.
2. **A whitespace-only reason (`"   "`).** The route returns 400, and the fake service or RPC is never called. Pinned by one assertion per route in each task's pass-through test.
3. **A reason at the length boundary.** 500 characters is accepted. 501 is rejected with 400 at the route, and the dialog truncates input to 500. Pinned in Task 1 (the schema) and once per route in the pass-through tests (`"x".repeat(501)`).
4. **A DELETE with a JSON body.** A DELETE carrying `{"reason": "…"}` is parsed. A missing or invalid body returns 400, not 500. Pinned in Tasks 6, 7 and 8.
5. **A failed confirm keeps the typed reason.** When the mutation rejects, the dialog stays open with its text, and `onConfirm` received the trimmed reason. Pinned by each task's UI test, which drives `runConfirm` with a rejecting `onConfirm` and asserts the reason argument and that the dialog stayed open.

---

### Task 1: Shared reason contract and ratchet guard

**Files:**

- Create:
  - `src/lib/admin/requiredReason.ts`
  - `src/lib/admin/requiredReason.test.ts`
  - `src/lib/admin/requiredReasonActions.ts`
  - `src/components/admin/requiredReasonGuard.test.ts`
  - `src/lib/operations/sqlFunctionBody.ts`
  - `src/lib/operations/sqlFunctionBody.test.ts`
- Modify: `src/components/admin/confirmActionState.ts`. Import the maximum from `requiredReason.ts`, re-export `CONFIRM_REASON_MAX_LENGTH`, and add `requiredReasonDialog`.

**Interfaces:**

- **Produces:**
  - `REQUIRED_REASON_MAX = 500`.
  - `requiredReasonSchema: z.ZodString`, which is `z.string().trim().min(1).max(500)`.
  - `optionalReasonSchema`, which is `requiredReasonSchema.optional()`. It is for readers that need D1 compatibility; routes do not use it.
  - `requiredReasonDialog: ConfirmReason = { required: true, minLength: 1 }`.
- **Registry:**
  - `type RequiredReasonAction = { id: RequiredReasonId; kind: "dialog" | "inline"; ui: readonly string[]; note?: string }`.
  - `REQUIRED_REASON_ACTIONS: readonly RequiredReasonAction[]` and `PENDING_REQUIRED_REASON_IDS: ReadonlySet<RequiredReasonId>`.
  - `RequiredReasonId` is the union of exactly these IDs:
    - `receipt.void`
    - `volunteer_registration.reject`
    - `internship.reject`
    - `faq.deactivate`
    - `estate.delete`
    - `board_member.deactivate`
    - `coordinator_status.delete`
    - `document.delete`
    - `annual_report.delete`
    - `sponsorship_pledge.cancel`
    - `sponsorship_proof.reject`
    - `sponsorship_finance.adjust`
    - `adoption_case.close`
    - `volunteer_activity.bulk_cancel`
- **SQL helpers:**
  - `extractFunctionBody(sql: string, qualifiedName: string): string`. It finds the **last** `create [or replace] function <qualifiedName>(` in `sql` and returns the text between that body's opening `as $tag$` and its closing `$tag$`. It works inside the `execute $definition$…$definition$` wrappers used by the r01 forward migrations, and throws if there is no match.
  - `normaliseSql(text: string): string`. It lowercases the text, collapses runs of whitespace and strips `--` comments.

- [ ] **Step 1: Write the failing tests.**
  - `requiredReason.test.ts`:
    - `requiredReasonSchema.parse("  ok  ")` returns `"ok"`;
    - `"   "` throws;
    - `"x".repeat(500)` parses;
    - `"x".repeat(501)` throws;
    - `CONFIRM_REASON_MAX_LENGTH === REQUIRED_REASON_MAX`.
  - `sqlFunctionBody.test.ts`:
    - it extracts a plain `as $$…$$` body;
    - it extracts an `as $function$…$function$` body nested in `execute $definition$…$definition$`;
    - it picks the last of two definitions;
    - it throws for a missing name.
  - `requiredReasonGuard.test.ts`. For every action that is **not** in `PENDING_REQUIRED_REASON_IDS`, it asserts:
    - (a) for `kind: "dialog"`, each `ui` file contains `required-reason: <id>` on the line of, or the line above, a `<ConfirmActionDialog` whose props include `reason={requiredReasonDialog}` or `reason={{ required: true`. For `kind: "inline"`, the marker sits beside the inline reason field.
    - (b) some `*.test.ts(x)` file under `src/` contains `// required-reason: <id>`.

    It also asserts:
    - (c) the registry's ID set equals the `RequiredReasonId` union, written out as a hard-coded list in the test;
    - (d) `PENDING_REQUIRED_REASON_IDS` is a subset of the registry IDs.

    Self-tests on synthetic strings cover a marker missing, a marker without a reason prop, and a marker two lines above (rejected).

- [ ] **Step 2: Run the tests and see them fail.**
      Run `bun test src/lib/admin/requiredReason.test.ts src/lib/operations/sqlFunctionBody.test.ts src/components/admin/requiredReasonGuard.test.ts`.
      Expected: module-not-found failures.
- [ ] **Step 3: Implement the modules.** `PENDING_REQUIRED_REASON_IDS` starts with every ID. The `ui` paths below are relative to `src/components/admin/` and come from D3:

  | ID                               | Kind   | `ui` path                                                                          |
  | -------------------------------- | ------ | ---------------------------------------------------------------------------------- |
  | `receipt.void`                   | dialog | `donations/PaymentsReconcile.tsx`                                                  |
  | `volunteer_registration.reject`  | dialog | `volunteers/VolunteerManagement.tsx`, `volunteers/VolunteerRegistrationDetail.tsx` |
  | `internship.reject`              | inline | `internships/InternshipManagement.tsx`                                             |
  | `faq.deactivate`                 | dialog | `content/FaqManagement.tsx`                                                        |
  | `estate.delete`                  | dialog | `content/AdoptionInformationManagement.tsx`                                        |
  | `board_member.deactivate`        | dialog | `content/GovernanceManagement.tsx`                                                 |
  | `coordinator_status.delete`      | dialog | `adoptions/StatusAdmin.tsx`                                                        |
  | `document.delete`                | dialog | `content/DocumentManagement.tsx`                                                   |
  | `annual_report.delete`           | dialog | `content/AnnualReportManagement.tsx`                                               |
  | `sponsorship_pledge.cancel`      | dialog | `sponsorship/PledgeDetailDrawer.tsx`                                               |
  | `sponsorship_proof.reject`       | dialog | `sponsorship/PledgeDetailDrawer.tsx`                                               |
  | `sponsorship_finance.adjust`     | inline | `sponsorship/FinancePanel.tsx`                                                     |
  | `adoption_case.close`            | dialog | `adoptions/CaseDetail.tsx`                                                         |
  | `volunteer_activity.bulk_cancel` | inline | `volunteers/ActivityOperationForm.tsx`                                             |

- [ ] **Step 4: Run the tests and see them pass.** Same command. Expected: PASS, with every ID pending.
- [ ] **Step 5: Commit** with the message `feat(admin): add the required-reason contract, registry and guard`.

### Task 2: Void a receipt with a reason (M1)

**Files:**

- Create:
  - `supabase/migrations/20261010130000_sp5b2_receipt_void_reason.sql`
  - `src/lib/donations/receiptVoidReason.migration.test.ts`
  - `src/lib/donations/receiptVoidReason.database.test.ts`
- Modify:
  - `src/lib/donations/reconcile.server.ts` (`voidReceipt`)
  - `src/routes/api/admin/receipts/$id/void.ts`
  - `src/routes/api/admin/receipts/-void.test.ts`
  - `src/components/admin/donations/PaymentsReconcile.tsx`: the dialog at about `:354` and its void mutation.
  - `src/lib/operations/releaseManifest.ts:949-955`
  - The registry: remove `receipt.void` from pending.
  - The PaymentsReconcile test, or a new `PaymentsReconcileVoid.test.tsx`.

**Interfaces:**

- **Consumes:** `requiredReasonSchema`, `requiredReasonDialog`, `extractFunctionBody` and `normaliseSql`, all from Task 1.
- **Produces:**
  - `voidReceipt(client, receiptId: string, actorUserId: string, options: { supporterId?: string; reason: string })`.
  - The RPC `public.void_receipt_with_audit(p_receipt_id uuid, p_actor uuid, p_supporter_id uuid, p_reason text default null)`. Keep any default that `p_supporter_id` already has.

- [ ] **Step 1: Write the failing tests.**
  - **Migration test.**
    - Extract the function body from the new file and from `20261002170945_r01_finance_callback_forward.sql`.
    - In the new body, replace `coalesce(nullif(pg_catalog.btrim(p_reason), ''), 'manual')` with `'manual'`. The `normaliseSql` result must equal `normaliseSql(old)`.
    - The file contains `drop function if exists public.void_receipt_with_audit(uuid, uuid, uuid);`, `p_reason text default null` and `set search_path = ''`, plus the revoke and grant for `(uuid,uuid,uuid,text)`.
  - **Route test**, tagged `// required-reason: receipt.void`:
    - With `{ reason: "  duplicate  " }`, the fake `voidReceipt` receives `reason: "duplicate"`.
    - `{}`, `{ reason: "   " }` and `{ reason: "x".repeat(501) }` each return 400 without calling it.
  - **UI test:**
    - The void dialog renders 原因 in zh and Reason in en.
    - `runConfirm` with the text `" wrong donor "` calls the void mutation with `"wrong donor"`.
    - A rejecting mutation keeps the dialog open with the text intact.
  - **Database test** (skipped without a stack):
    - The 4-argument call stores `detail.reason = 'wrong donor'`.
    - The 3-named-argument call stores `'manual'`.
- [ ] **Step 2: Run the tests and see them fail.**
      Run `bun test src/lib/donations/receiptVoidReason.migration.test.ts src/routes/api/admin/receipts/-void.test.ts <ui test>`.
      Expected: FAIL, because the migration does not exist and the route accepts `{}`.
- [ ] **Step 3: Write the migration.**
  - Copy the header, body, `security definer` and `set search_path = ''` verbatim from the r01 file.
  - Add only the parameter and the one `reason` expression.
  - Drop the old identity first, then create the new one.
  - Update the release manifest `arguments` to `"p_receipt_id uuid, p_actor uuid, p_supporter_id uuid, p_reason text"`.
- [ ] **Step 4: Thread the reason through.**
  - The route schema becomes `z.object({ supporterId: z.string().uuid().optional(), reason: requiredReasonSchema })`, and the body is now required.
  - `voidReceipt` passes `p_reason`.
  - The UI dialog uses `reason={requiredReasonDialog}` and carries the marker `required-reason: receipt.void`. `onConfirm(reason)` awaits the mutation with `{ reason }` in the POST body.
- [ ] **Step 5: Run the tests and see them pass.** Run the same tests plus `src/lib/operations/releaseManifest.test.ts` and `src/lib/supabaseMigrations.test.ts`. Expected: PASS.
- [ ] **Step 6: Commit** with the message `feat(finance): require and audit a reason when voiding a receipt`.

### Task 3: Reject a volunteer registration with a reason (M2)

**Files:**

- Create:
  - `supabase/migrations/20261010130100_sp5b2_volunteer_registration_reason.sql`
  - `src/lib/volunteers/registrationReason.migration.test.ts`
  - `src/lib/volunteers/registrationReason.database.test.ts`
- Modify:
  - `src/lib/volunteers/schemas.ts`: the registration status schema.
  - `src/lib/volunteers/service.ts`, and `src/lib/volunteers/repository.server.ts:460-475`, where `updateRegistrationStatus` passes `p_reason`.
  - The registration status `http.server` and handler tests.
  - `src/components/admin/volunteers/VolunteerManagement.tsx`, at about `:661`.
  - `src/components/admin/volunteers/VolunteerRegistrationDetail.tsx`, at about `:163`.
  - `src/lib/operations/releaseManifest.ts`: add an entry for `set_volunteer_registration_status_with_audit`:
    - `arguments`: `"p_registration_id uuid, p_actor_user_id uuid, p_expected_updated_at timestamp with time zone, p_status text, p_internal_notes text, p_update_internal_notes boolean, p_reason text"`
    - `returns`: `"jsonb"`
    - `executeRoles`: `["service_role"]`
    - `feature`: `"volunteers"`
  - The registry: remove `volunteer_registration.reject` from pending.

**Interfaces:**

- **Produces:**
  - The status input becomes `{ status, expectedUpdatedAt, internalNotes?, reason? }`. A zod `superRefine` requires `reason` to parse with `requiredReasonSchema` when `status === "rejected"`, and leaves it optional otherwise.
  - The repository input gains `reason: string | null`.
  - The RPC `set_volunteer_registration_status_with_audit(p_registration_id uuid, p_actor_user_id uuid, p_expected_updated_at timestamptz, p_status text, p_internal_notes text default null, p_update_internal_notes boolean default true, p_reason text default null)`.
  - Its audit detail becomes `pg_catalog.jsonb_strip_nulls(jsonb_build_object('status', p_status, 'reason', nullif(btrim(p_reason), '')))`.

- [ ] **Step 1: Write the failing tests.**
  - **Migration test:**
    - The new body equals the body in `20260913062837` (line 468), with only the `jsonb_build_object('status',p_status)` expression replaced as above.
    - The file drops the 6-argument identity and creates the 7-argument one.
    - It pins `search_path = public, pg_temp` and grants `(uuid,uuid,timestamptz,text,text,boolean,text)` to `service_role`.
  - **Handler test**, tagged `// required-reason: volunteer_registration.reject`:
    - `rejected` with `" no-show history "` reaches the repository as `"no-show history"`.
    - `rejected` with no reason returns 400.
    - `approved` with no reason passes through as `reason: null`.
    - A whitespace-only reason and a 501-character reason each return 400.
  - **UI tests:** on both sites, the reject dialog is a required-reason dialog, and `onConfirm` sends `{ status: "rejected", reason }`. Cover zh and en renders.
- [ ] **Step 2: Run the tests and see them fail.**
- [ ] **Step 3: Implement** the migration, the schema, the service, the repository and both UI sites, with the marker on each dialog.
- [ ] **Step 4: Run the tests and see them pass.** Also run `src/lib/volunteers` and `src/components/admin/volunteers`.
- [ ] **Step 5: Commit** with the message `feat(volunteers): require and audit a reason when rejecting a registration`.

### Task 4: Audit the internship rejection reason (M3)

**Files:**

- Create:
  - `supabase/migrations/20261010130200_sp5b2_internship_review_audit_reason.sql`
  - `src/lib/internships/reviewAuditReason.migration.test.ts`
  - `src/lib/internships/reviewAuditReason.database.test.ts`
- Modify:
  - The http test in `src/lib/internships/`: add the pass-through tag.
  - `src/components/admin/internships/InternshipManagement.tsx`: add the marker on the inline reason field.
  - The registry: remove `internship.reject` from pending.

**Interfaces:**

- **Produces:** `internship_command(p_actor uuid, p_command jsonb)` keeps the same identity. Only the detail expression in its final `audit_log` insert changes, to:
  `case when action = 'review' then result || pg_catalog.jsonb_build_object('status', p_command->>'status', 'reason', pg_catalog.btrim(p_command->>'reason')) else result end`.

- [ ] **Step 1: Write the failing tests.**
  - **Migration test:**
    - The new body equals the body in `20260913072454`, with only the `audit_log` detail argument changed.
    - The `internship_command_result` insert still stores `result`, so a replay returns the same result. Assert that this insert's text is unchanged.
    - It uses `create or replace function` (the identity is unchanged) and keeps `search_path=public,pg_temp`, the revoke and the grant.
  - **Route test**, tagged `// required-reason: internship.reject`. The existing review route sends `reason` in the command.
    - The fake receives the trimmed reason.
    - `"   "` returns 400.
    - If the route does not already trim and validate the reason with `requiredReasonSchema`, change it to.
- [ ] **Step 2: Run the tests and see them fail.**
- [ ] **Step 3: Write the migration:** copy the whole function verbatim, then make the one edit.
- [ ] **Step 4: Run the tests and see them pass.** Also run `src/lib/internships`.
- [ ] **Step 5: Commit** with the message `feat(internships): record the review reason in the audit log`.

### Task 5: Deactivate a FAQ entry with a reason (M4)

**Files:**

- Create:
  - `supabase/migrations/20261010130300_sp5b2_faq_deactivate_reason.sql`
  - `src/lib/faq/deactivateReason.migration.test.ts`
  - `src/lib/faq/deactivateReason.database.test.ts`
- Modify:
  - `src/lib/faq/http.ts` (the deactivate handler body), `src/lib/faq/service.ts` and `src/lib/faq/repository.server.ts:103`, with their tests.
  - `src/components/admin/content/FaqManagement.tsx`: the mutation at about `:134` and the button at `:231`. Add a `ConfirmActionDialog`.
  - The FAQ copy module: an English consequence sentence, and `""` in zh. Add the zh draft to the owner list.
  - `releaseManifest.ts`: add `deactivate_faq_entry_with_audit` with `arguments` `"p_actor_user_id uuid, p_id uuid, p_reason text"`, `returns` `"void"` and `feature` `"content"`.
  - The registry.

**Interfaces:**

- **Produces:**
  - `service.deactivate({ actorUserId, id, reason }: { actorUserId: string; id: string; reason: string })`.
  - The repository method `deactivate(id, actorUserId, reason)`.
  - The RPC `deactivate_faq_entry_with_audit(p_actor_user_id uuid, p_id uuid, p_reason text default null)`, with the audit detail `jsonb_strip_nulls(jsonb_build_object('reason', nullif(btrim(p_reason), '')))`.

- [ ] **Step 1: Write the failing tests.**
  - **Migration test:**
    - The body differs from the one in `20260830120000` only in the detail expression.
    - It drops `(uuid, uuid)`.
    - It keeps `security definer` with `search_path = public, pg_temp`.
    - It grants `(uuid, uuid, text)` to `service_role`.
  - **Handler test**, tagged `// required-reason: faq.deactivate`:
    - The trimmed reason passes through.
    - `{}` returns 400.
    - `"   "` returns 400.
    - A 501-character reason returns 400.

    Use the route's existing HTTP method. If it reads no body today, make it parse a JSON body.

  - **UI test:**
    - The deactivate button opens the dialog instead of mutating directly.
    - Confirming sends `{ reason }`.
    - Cover zh and en renders.
    - A rejection keeps the typed text.

- [ ] **Step 2: Run the tests and see them fail.**
- [ ] **Step 3: Implement** the migration and the code. The dialog's title and confirm verb reuse the button's existing label.
- [ ] **Step 4: Run the tests and see them pass.** Also run `src/lib/faq`, `src/components/admin/content` and `adminCopyGuard`.
- [ ] **Step 5: Commit** with the message `feat(content): require and audit a reason when deactivating a FAQ entry`.

### Task 6: Estate delete and board member step-down with a reason (M5)

**Files:**

- Create:
  - `supabase/migrations/20261010130400_sp5b2_admin_content_delete_reason.sql`
  - `src/lib/adoptionInformation/contentDeleteReason.migration.test.ts`
  - `src/lib/adoptionInformation/contentDeleteReason.database.test.ts`
- Modify:
  - `src/lib/adoptionInformation/repository.server.ts:411-421` (`deleteEstate`), with its service and http handler.
  - `src/lib/governance/repository.server.ts:115-120`, with its service and http handler.
  - The tests for both.
  - `src/components/admin/content/AdoptionInformationManagement.tsx`: the dialog at about `:327`.
  - `src/components/admin/content/GovernanceManagement.tsx`: the mutation at `:54` and the button at `:124`. Add a new dialog.
  - The governance copy: an English consequence sentence, and `""` in zh. Add the zh draft to the owner list.
  - The registry.

**Interfaces:**

- **Produces:**
  - `deleteEstate(id, actorUserId, reason: string)` sends `p_payload: { reason }`.
  - The governance method `deactivate(id, actorUserId, reason: string)` sends `p_payload: { reason }`.
  - The RPC `mutate_admin_content_with_audit` keeps the same identity. The detail in its final insert becomes:
    `case when p_operation = 'upsert' then p_payload else pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('reason', nullif(pg_catalog.btrim(p_payload->>'reason'), ''))) end`.

- [ ] **Step 1: Write the failing tests.**
  - **Migration test:**
    - The new body equals the body in `20261002011249` (the `$function$` at `:347`), with only that `case` expression changed.
    - It uses `create or replace` and keeps `search_path = ''`, so every reference stays schema-qualified.
    - It keeps the revoke and grant for `(uuid,text,text,uuid,jsonb)`.
  - **Handler tests**, tagged `// required-reason: estate.delete` and `// required-reason: board_member.deactivate`:
    - A DELETE (or the route's existing method) with `{"reason":" closed "}` passes `"closed"` to the repository.
    - No body returns 400.
    - `"   "` returns 400.
    - A 501-character reason returns 400.
  - **UI tests** for both screens, as in Task 5.
- [ ] **Step 2: Run the tests and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests and see them pass.** Also run `src/lib/adoptionInformation`, `src/lib/governance` and `src/components/admin/content`.
- [ ] **Step 5: Commit** with the message `feat(content): require and audit a reason for estate deletes and board step-downs`.

### Task 7: Delete a coordinator status with a reason (M6)

**Files:**

- Create:
  - `supabase/migrations/20261010130500_sp5b2_coordinator_status_delete_reason.sql`
  - `src/lib/adoptions/statusDeleteReason.migration.test.ts`
  - `src/lib/adoptions/statusDeleteReason.database.test.ts`
- Modify:
  - `src/lib/adoptions/repository.server.ts:1775-1785` (`deleteStatus`), with its service and its http handler (`DELETE adoptions/statuses/$id`).
  - Their tests.
  - `src/components/admin/adoptions/StatusAdmin.tsx:234-249`.
  - The registry.

**Interfaces:**

- **Produces:**
  - `deleteStatus(id, actorUserId, reason: string)` sends `p_payload: { reason }`.
  - The RPC `mutate_adoption_coordinator_with_audit` keeps the same identity. In its delete branch, `audit_detail` becomes:
    `pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('category', current_status.category, 'key', current_status.key, 'reason', nullif(pg_catalog.btrim(p_payload->>'reason'), '')))`.

- [ ] **Step 1: Write the failing tests.**
  - **Migration test:**
    - The new body equals the body in `20261002045253` (at `:133`), with only that assignment changed.
    - It uses `create or replace` and keeps `search_path = ''`.
    - It keeps the revoke and grant for `(uuid,text,text,uuid,jsonb)`.
  - **Handler test**, tagged `// required-reason: coordinator_status.delete`:
    - A DELETE with a JSON reason passes it through, trimmed.
    - A missing body returns 400.
    - `"   "` returns 400.
    - A 501-character reason returns 400.
  - **UI test** for the StatusAdmin dialog, in zh and en.
- [ ] **Step 2: Run the tests and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests and see them pass.** Also run `src/lib/adoptions` and `src/components/admin/adoptions`.
- [ ] **Step 5: Commit** with the message `feat(adoptions): require and audit a reason when deleting a status`.

### Task 8: Delete a document or annual report with a reason (no migration)

**Files:**

- Modify:
  - `src/lib/documents/http.server.ts:163-170` (`deleteAsset`) and the annual-report delete handler.
  - `src/lib/documents/service.ts:245,357`.
  - `src/lib/documents/repository.server.ts:360,493`: pass `values: { reason }` to `runAtomicMutation`.
  - The tests for all three.
  - `src/components/admin/content/DocumentManagement.tsx`, at about `:255`.
  - `src/components/admin/content/AnnualReportManagement.tsx`, at about `:198`.
  - The registry.

**Interfaces:**

- **Produces:**
  - `deleteAsset({ actorUserId, assetId, reason })` and `deleteAnnualReport({ actorUserId, reportId, reason })`.
  - The repository calls `runAtomicMutation(name, "delete", id, { reason }, actorUserId)`. The existing RPC writes `p_values` to `audit_log.detail`, so `detail.reason` is set.

- [ ] **Step 1: Write the failing tests.**
  - **Handler tests**, tagged `// required-reason: document.delete` and `// required-reason: annual_report.delete`:
    - The trimmed reason passes through.
    - A missing body returns 400.
    - `"   "` returns 400.
    - A 501-character reason returns 400.
  - **Repository test:** the delete RPC call's `p_values` equals `{ reason: "…" }`.
  - **Static test:** the delete path in `20260719120000` inserts `coalesce(p_values, '{}'::jsonb)` as the detail. Use `extractFunctionBody` on the latest definition across all migrations, so that a later redefinition cannot silently break the no-migration assumption.
  - **UI tests** for both dialogs.
- [ ] **Step 2: Run the tests and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests and see them pass.** Also run `src/lib/documents` and `src/components/admin/content`.
- [ ] **Step 5: Commit** with the message `feat(content): require a reason when deleting a document or annual report`.

### Task 9: Sponsorship cancel, proof rejection and finance adjustments (no migration)

**Files:**

- Modify:
  - `src/lib/sponsorshipAdmin/schemas.ts:52-63`.
  - The `http.server.ts` and service tests.
  - `src/components/admin/sponsorship/PledgeDetailDrawer.tsx`: the handlers at `:274-312`, and the fields and buttons at `:659-700`.
  - `src/components/admin/sponsorship/FinancePanel.tsx`: the marker only, beside the inline reason input at `:189`.
  - The registry.

**Interfaces:**

- **Produces:**
  - `cancelPledgeSchema = z.object({ note: requiredReasonSchema })`.
  - `reviewPledgeProofSchema` gains a `superRefine`: when `decision === "reject"`, `note` must parse with `requiredReasonSchema`.
  - The RPCs already store `note` in `audit_log` (`cancel_sponsorship_pledge`, `review_exact_sponsorship_payment_proof`).
- **UI:**
  - The cancel button opens a required-reason `ConfirmActionDialog`, whose reason is sent as `note`. The inline cancel-note field is removed.
  - The reject button opens a required-reason dialog, whose reason is sent as `note`.
  - The approve path keeps its optional inline note.

- [ ] **Step 1: Write the failing tests.**
  - **Handler tests**, tagged `// required-reason: sponsorship_pledge.cancel` and `// required-reason: sponsorship_proof.reject`:
    - Cancel with no note returns 400.
    - Reject with no note returns 400.
    - Approve with no note passes.
    - The trimmed note passes through.
    - `"   "` returns 400.
    - A 501-character note returns 400.
  - **Finance test**, tagged `// required-reason: sponsorship_finance.adjust`: the existing server rule rejects a reason shorter than 5 characters, and the reason reaches the RPC. Add the tag to the existing `finance.test.ts` case.
  - **UI tests** for both dialogs:
    - zh and en renders.
    - `onConfirm` sends `note`.
    - A rejection keeps the typed text.
- [ ] **Step 2: Run the tests and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests and see them pass.** Also run `src/lib/sponsorshipAdmin` and `src/components/admin/sponsorship`.
- [ ] **Step 5: Commit** with the message `feat(sponsorship): require a reason to cancel a pledge or reject a proof`.

### Task 10: Close or reject an adoption case with a reason (no migration)

**Files:**

- Modify:
  - `src/lib/adoptions/service.ts:597-610` (`changeCaseStatus`) and its test.
  - The adoption `http.server.ts` mapping, so that the new error returns 400.
  - `src/components/admin/adoptions/CaseDetail.tsx`: the status change at `:521-538` and the note at `:705-710`.
  - The registry.

**Interfaces:**

- **Produces:**
  - When `status.isClosing`, `changeCaseStatus` requires `requiredReasonSchema.safeParse(input.note ?? "")` to succeed. Otherwise it throws the domain's existing validation error that maps to 400, with the code `reason_required`.
  - Non-closing statuses keep the note optional.
  - `change_adoption_case_status` already writes `detail.note`.
- **UI:**
  - Choosing a closing status and submitting opens a required-reason dialog, whose reason is sent as `note`.
  - Non-closing statuses submit as they do today.

- [ ] **Step 1: Write the failing tests.**
  - **Service and handler test**, tagged `// required-reason: adoption_case.close`:
    - Closing with no note returns 400 `reason_required`, and the repository is not called.
    - Closing with `" applicant withdrew "` reaches the repository as `"applicant withdrew"`.
    - A non-closing status with no note passes.
    - A whitespace-only note on a closing status returns 400.
  - **UI test:**
    - A closing status opens the dialog.
    - A non-closing status does not.
    - Cover zh and en renders.
- [ ] **Step 2: Run the tests and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests and see them pass.** Also run `src/lib/adoptions` and `src/components/admin/adoptions`.
- [ ] **Step 5: Commit** with the message `feat(adoptions): require a reason when closing or rejecting a case`.

### Task 11: Finish: empty ratchet, production runbook, gate

**Files:**

- Modify:
  - `src/lib/admin/requiredReasonActions.ts`: remove `volunteer_activity.bulk_cancel` from pending, and add its marker in `ActivityOperationForm.tsx`.
  - `src/components/admin/requiredReasonGuard.test.ts`: assert `PENDING_REQUIRED_REASON_IDS.size === 0`. Delete the pending mechanism if nothing uses it any more.
  - `docs/superpowers/plans/2026-10-10-admin-audit-sp5b-owner-review.md`: add the new zh drafts from Tasks 5 and 6.
  - `CLAUDE.md` and `AGENTS.md`, using the Edit tool. Append this to the Admin UX line: ` Financial and irreversible actions take a required reason (requiredReasonActions.ts; requiredReasonGuard.test.ts).`
- Create: `docs/superpowers/plans/2026-10-10-admin-audit-sp5b2-production-migrations.md`. It lists the six migrations in order, and for each one gives:
  - what it changes;
  - a read-only verification query: `select pg_get_function_identity_arguments(oid) from pg_proc where proname = '<name>'`, plus a `prosrc like` check for the `reason` expression;
  - the command `bun scripts/check-release-schema.ts`.

  It also states that the deployed app keeps working (D1), and that tightening the database to require the reason is a follow-up.

- Test: run `requiredReasonGuard`, `adminConfirmGuard`, `confirmSettlesGuard` and `adminEnglishSmoke` under `bun --preload` with the clock-shift preloads used in SP-5b-1.

- [ ] **Step 1: Empty the ratchet.** Run `bun test src/components/admin/requiredReasonGuard.test.ts`. Expected: PASS with 0 pending.
- [ ] **Step 2: Write the runbook and the owner-list additions.**
- [ ] **Step 3: Add the Conventions line.**
- [ ] **Step 4: Run the full gate.**
  - `bunx tsc --noEmit`
  - `bun run lint`
  - `$env:SUPABASE_LOCAL_URL='http://127.0.0.1:1'; bun run test`
  - `bun run build`
  - the clock preloads

  Expected: all green, with lint at 0 errors and warnings ≤ 52.

- [ ] **Step 5: Commit** with the message `docs(admin): finish SP-5b-2 required reasons and the production migration runbook`.

## Owner gates (from the spec)

- **Before merge:**
  - the six migrations are applied to production, and `scripts/check-release-schema.ts` is green;
  - release approval.
- **Merge order:** SP-5a (#207), then SP-5b-1 (#206), then this branch.
