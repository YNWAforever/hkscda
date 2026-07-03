# Sponsorship Pledge Admin Review Design (Slice C)

## Summary

Give staff a way to review sponsorship pledges: verify uploaded payment proof,
manually record a payment when a sponsor didn't upload one at submission,
approve or reject proof, and cancel a pledge. This is the last piece of the
`sponsorship_pledge` lifecycle — Slice A+B (public submission) and Slice D
(magic-link status page) both ship the plumbing for the three staff-only
statuses (`active`, `needs_followup`, `cancelled`) without any way to reach
them. This slice adds that path, mirroring the existing adoption **coordinator
ops workbench** (`src/components/admin/adoptions/`,
`src/routes/api/admin/adoptions/cases*`) file-for-file wherever the shape
matches.

## Current Context

- `sponsorship_pledge.status` already supports all 5 values via a plain CHECK
  constraint (not the generic configurable `adoption_status`-style category
  table adoption cases use) — this slice does not introduce that machinery.
- `sponsorship_payment_proof` (from
  `supabase/migrations/20260702130000_sponsorship_pledge_phase_2.sql`) has
  `pledge_id uuid unique` (strictly one proof per pledge today) and no
  reviewer-attribution columns (`reviewed_by`/`reviewed_at`/`review_note`) and
  no way to distinguish a publicly-submitted proof from a staff-recorded one.
- The adoption side already has a proven, security-reviewed pattern for
  admin-mutating actions: `change_adoption_case_status` and
  `finalize_successful_adoption`
  (`supabase/migrations/20260626144836_adoption_coordinator_workflow_rpcs.sql`,
  hardened in `20260628160000_validate_rpc_actor.sql`) are `SECURITY DEFINER`
  functions that re-validate the caller-supplied actor is an active
  `admin_user` with role `staff`/`admin` **inside the function**, defense in
  depth against a forged actor id from anything holding the service-role key.
  They write one `audit_log` row per transition and are
  `revoke ... from public; grant execute ... to service_role`.
- The CRM supporter timeline (`src/lib/crm/timeline.ts`,
  `src/lib/crm/repository.server.ts`) is assembled generically from
  `donations`/`payments`/`receipts`/`consents`/`messages`/`audit_log` scoped to
  a supporter. `message` rows are already scoped by `supporter_id` directly
  (the existing pledge confirmation email sets this), but the `audit_log`
  query is scoped to
  `entity_id in (supporterId, ...donationIds)` — pledge-entity audit rows
  would never surface without a small fix (see below).
- Adoption's admin photo-signing route
  (`src/routes/api/admin/adoptions/applications/$applicationId/photos/$photoId.ts`)
  is the direct precedent for serving a private-bucket file to staff: gate
  with `requireAdmin`, `createSignedUrl(path, 60, {download: fileName})`.

## Approved Decisions

- **Lifecycle emails:** staff actions (record payment / approve / reject /
  cancel) send a bilingual email to the sponsor, reusing the existing
  message-ledger pattern (queued → sent/failed, never throws, never rolls back
  the already-committed DB transition). This closes the gap Slice D left open
  (it explicitly scoped "further lifecycle emails" out).
- **Proof review auto-transitions the pledge:** approving proof sets
  `review_status = 'approved'` **and** `pledge.status = 'active'` in one
  action; rejecting sets `review_status = 'rejected'` **and**
  `pledge.status = 'needs_followup'`. These are not independent controls.
- **Manual proof entry is in scope:** staff can record a payment (method,
  reference, amount, date, optional file) directly on a `pending_payment` or
  `needs_followup` pledge, moving it into the same review queue as a
  publicly-submitted proof (`provisional`, `review_status = 'pending'`).
- **Nav placement:** folds into the existing **助養 (sponsor)** nav item
  rather than a new top-level nav group. `/admin?section=sponsor` gains an
  in-page view toggle (動物列表 / 承諾審核); no new sidebar entry.
- **Detail interaction:** clicking a pledge in the review list opens a
  slide-over drawer (not a dedicated page/route) — chosen over the
  adoption-style dedicated-page pattern for faster queue-clearing when
  reviewing many pledges in one sitting.

## Data Model

New migration
`supabase/migrations/<timestamp>_sponsorship_pledge_admin_review.sql`:

### `sponsorship_payment_proof` changes

- Drop the `unique (pledge_id)` constraint (previously enforced strictly one
  proof per pledge); replace with a plain index on `pledge_id`. Proof rows now
  accumulate as history — the most recent row (`created_at desc`) is "current"
  for review purposes; older rows are read-only history in the drawer. This is
  required to let staff attach a corrected proof after a `needs_followup`
  rejection, since the pledge already has an (rejected) proof row.
- Add `reviewed_by uuid references public.admin_user(id)`,
  `reviewed_at timestamptz`, `review_note text`.
- Add `source text not null default 'public' check (source in ('public', 'staff'))`
  so the UI/audit trail can distinguish a sponsor's own upload from a
  staff-recorded payment.

### New RPCs (mirroring the `change_adoption_case_status` template exactly)

Each is `security definer`, validates
`exists (select 1 from admin_user where auth_user_id = p_actor_user_id and status = 'active' and role in ('staff','admin'))`
before doing anything, writes exactly one `audit_log` row, and ends with
`revoke all ... from public; grant execute ... to service_role`.

- **`record_sponsorship_payment_proof(p_pledge_id, p_actor_user_id, p_storage_path, p_file_name, p_file_type, p_file_size, p_payment_method, p_reference, p_amount_cents, p_payment_date, p_note)`**
  — only valid when `pledge.status in ('pending_payment', 'needs_followup')`;
  inserts a `sponsorship_payment_proof` row (`source = 'staff'`,
  `review_status = 'pending'`) and sets `pledge.status = 'provisional'`.
- **`review_sponsorship_payment_proof(p_pledge_id, p_decision, p_actor_user_id, p_note)`**
  — only valid when `pledge.status = 'provisional'` and the current proof's
  `review_status = 'pending'`; `p_decision = 'approve'` sets the proof
  `review_status = 'approved'` + `pledge.status = 'active'`;
  `p_decision = 'reject'` sets `review_status = 'rejected'` +
  `pledge.status = 'needs_followup'`. Both set `reviewed_by`/`reviewed_at`/`review_note`.
- **`cancel_sponsorship_pledge(p_pledge_id, p_actor_user_id, p_note)`** — valid
  from any state except `cancelled`; sets `pledge.status = 'cancelled'`.

No changes to `sponsorship_pledge.status`'s CHECK constraint (already covers
all 5 values) and no generic status-config table — this stays a plain enum,
unlike adoption cases.

## Backend

New module `src/lib/sponsorshipAdmin/` (mirrors `src/lib/adoptions/`):

- `types.ts` — `PledgeSummary`, `PledgeDetail`, `PaymentProofRecord`, decision
  input types.
- `repository.server.ts` — thin wrappers over the 3 RPCs (via
  `client.rpc(...)`, matching `repository.server.ts`'s `changeCaseStatus`
  pattern) plus list/detail selects (pledge + preferences + proof history +
  recent `audit_log` rows for that pledge).
- `service.ts` — zod-validates input, calls the repo, then triggers the
  matching lifecycle email (best-effort, after the DB transition has already
  committed).

### Routes (mirror `api/admin/adoptions/cases*`)

- `GET /api/admin/sponsorships/pledges` — list, filterable by `status`,
  searchable by supporter name/email/reference, paginated.
- `GET /api/admin/sponsorships/pledges/$id` — detail payload for the drawer.
- `GET /api/admin/sponsorships/pledges/$id/proof-url` — signed URL for the
  current proof file, copied from the adoption photo-signing route
  (`createSignedUrl`, 60s TTL, `requireAdmin`).
- `POST /api/admin/sponsorships/pledges/$id/proof` — multipart
  (method/reference/amount/date + optional file) →
  `record_sponsorship_payment_proof`. Reuses `validateProofDescriptor`,
  `MAX_PROOF_BYTES`, `PROOF_MIME_TYPES` from `src/lib/sponsorship/schemas.ts`
  unchanged.
- `POST /api/admin/sponsorships/pledges/$id/review` —
  `{decision: "approve" | "reject", note?}` →
  `review_sponsorship_payment_proof`.
- `POST /api/admin/sponsorships/pledges/$id/cancel` — `{note?}` →
  `cancel_sponsorship_pledge`.

All gated by `requireAdmin(request, ["staff", "admin"], client)`, identical to
the adoption coordinator routes.

## Emails

One new `renderPledgeStatusUpdateEmail({event, language, supporterName, reference, ...})`
in `src/lib/sponsorship/emailTemplates.server.ts`, parametrized over 4 events:

- `proof_recorded` — fires only from the staff-manual-entry path. Public
  self-submissions with proof already get equivalent messaging in their
  existing submission confirmation email, so this does not duplicate that.
- `active` — payment confirmed.
- `needs_followup` — includes a `mailto:` fallback referencing the pledge
  reference, matching the status page's existing copy for this state.
- `cancelled`.

Sent via a new `sendPledgeStatusUpdateEmail`, following the exact
queued → sent/failed message-ledger pattern already in
`sendPledgeConfirmationEmail`: insert a `message` row (`status: 'queued'`,
`supporter_id` set) before sending, update to `sent`/`failed` after, never
throw. Email failure is logged but never rolls back the already-committed
pledge/proof transition.

## CRM Timeline Fix

`getSupporterDetail` in `src/lib/crm/repository.server.ts` currently scopes
the `audit_log` query to `entity_id in (supporterId, ...donationIds)`. Fetch
the supporter's `sponsorship_pledge` ids in the same `Promise.all` batch as
`donationIds` and include them in that `.in(...)` filter, so pledge status
changes (written by the 3 new RPCs) surface in the supporter's timeline. No
change needed to the `message` query — it's already scoped by `supporter_id`
directly, and the new lifecycle emails set that field the same way the
existing confirmation email does.

## Admin UI

- `/admin?section=sponsor` (`src/routes/admin/index.tsx`) gains a view toggle
  between 動物列表 (existing `AnimalsTable`, unchanged) and 承諾審核 (new).
  Same route, same nav entry — no new sidebar group.
- `src/components/admin/sponsorship/PledgeReviewLane.tsx` (new, mirrors
  `CaseList.tsx`): `DataTable` with status filter chips for the 5 statuses,
  search by supporter name/email/reference, pagination.
- `src/components/admin/sponsorship/PledgeDetailDrawer.tsx` (new, slide-over):
  pledge summary (tier, amount, contact, ranked animals), plus state-dependent
  content:
  - `pending_payment` / `needs_followup` (no pending proof) → "記錄付款" form
    → `POST .../proof`.
  - `provisional` (proof awaiting review) → proof preview (inline image or PDF
    link via the signed-URL endpoint) + 核實通過/拒絕 buttons →
    `POST .../review`.
  - `active` → read-only + a 取消 button → `POST .../cancel`.
  - `cancelled` → fully read-only, no actions.
  - A "近期活動" list at the bottom shows the pledge's recent `audit_log`
    entries, plus a link out to the full supporter page for the complete CRM
    timeline.

## Error Handling

Mirrors the adoption coordinator routes throughout:

- All 3 RPCs raise (`errcode 42501`) if the actor isn't an active staff/admin
  `admin_user`, and raise on an invalid state transition (e.g. reviewing a
  pledge that isn't `provisional`, or recording proof on a pledge that's
  already `provisional`/`active`/`cancelled`) — routes map these to 409/400.
- Proof upload validation (MIME/size) → 400, mirroring the public submission
  route's `validateProofDescriptor` errors.
- Missing pledge/proof → 404.
- Email failure is logged (`message` row `failed`) but never fails the
  request or rolls back the transition — identical to the existing
  confirmation-email behavior.
- Unexpected errors → logged, generic 500, no internal detail leaked.

## Testing Plan (bun test, TDD)

- **schemas/service:** input validation for record/review/cancel; state-guard
  logic (e.g. review only valid from `provisional`).
- **repository:** RPC-calling wrappers against the fake-Supabase-client
  pattern established in `submission.server.test.ts`; list/detail query
  shaping.
- **email templates:** all 4 events render, bilingual, HTML-escaped;
  `needs_followup` includes the `mailto:` fallback.
- **routes:** auth-gating (non-staff → 403), happy path per endpoint, 400/404/409
  mapping, `no-store` header.
- **CRM repository:** pledge-entity `audit_log` rows now appear in
  `getSupporterDetail`'s timeline output.
- **UI logic:** a pure-logic test file for the review lane's filter/search
  param building, mirroring `caseWorkflowLogic.ts`/`coordinatorReportsLogic.ts`.
  No component-level tests, matching the project's existing precedent for
  similar admin panels.
- **migration safety:** relaxed `pledge_id` constraint, new columns, and
  anon-inaccessibility, mirroring the existing Slice A+B migration test.

## Out of Scope

- CSV export and bulk actions on the review lane.
- Staff editing a pledge's tier/amount/preferences.
- A generic configurable-status system for pledges (stays a plain 5-value
  enum; no admin "statuses" settings page like adoption cases have).
- Recurring/automatic billing and monthly payment reminders (already out of
  scope per the original Phase 2 blueprint).
- A resend-link flow for the magic-link status page (Slice D's existing scope
  boundary, unchanged).

## Design Defaults

- Mirror the adoption coordinator workbench's file layout, RPC-security
  template, and route conventions wherever the shape matches.
- Reuse existing helpers unchanged: `requireAdmin`, the proof-descriptor
  validators, the message-ledger email-send pattern, the signed-URL photo
  route pattern.
- Keep the pledge status model a plain enum — do not introduce the generic
  status-category machinery adoption cases use.
