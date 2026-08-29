# Sponsorship Pledge Admin Review Design (BP-4 re-implementation)

## Summary

Give staff a way to review sponsorship pledges: verify uploaded payment proof,
manually record a payment when a sponsor didn't upload one at submission,
approve or reject proof, and cancel a pledge. This is the last piece of the
`sponsorship_pledge` lifecycle — public submission (Slices A+B) and the
magic-link status page (Slice D) are both live on `main` and ship the plumbing
for the three staff-only statuses (`active`, `needs_followup`, `cancelled`)
without any way to reach them.

This is a **re-implementation on current `main`** of the approved July design
(`docs/superpowers/specs/2026-07-03-sponsorship-pledge-admin-review-design.md`
on branch `feat/sponsorship-pledge-admin-review` — never landed on `main`
(its PR #26 merged only into the equally-unmerged
`feat/sponsorship-status-page`), now 321+ commits behind). Integration-plan correction C-8 directs: re-implement
from the branch's design and code as reference; do not rebase or merge the
old branch. All decisions approved in the July design carry forward
unchanged; the sections marked **[Adaptation]** below are the only new
decisions, approved 2026-08-29.

## Current Context (verified on `main` 2026-08-29)

- `sponsorship_pledge.status` supports all 5 values via a plain CHECK
  constraint (`supabase/migrations/20260702130000_sponsorship_pledge_phase_2.sql`):
  `pending_payment`, `provisional`, `active`, `needs_followup`, `cancelled`.
  No generic status-category machinery — stays a plain enum.
- `sponsorship_payment_proof` has `pledge_id uuid not null unique` (strictly
  one proof per pledge), NOT NULL file columns, `review_status`
  (`pending`/`approved`/`rejected`), and no reviewer-attribution columns and
  no public-vs-staff source marker.
- The adoption side has the proven, security-reviewed template for
  admin-mutating actions: `change_adoption_case_status` /
  `finalize_successful_adoption`
  (`20260626144836_adoption_coordinator_workflow_rpcs.sql`, hardened in
  `20260628160000_validate_rpc_actor.sql`) are `SECURITY DEFINER` functions
  that re-validate the caller-supplied actor is an active `admin_user` with
  role `staff`/`admin` inside the function, write one `audit_log` row per
  transition, and end with `revoke all from public; grant execute to
  service_role`.
- `src/lib/sponsorship/schemas.ts` still exports `validateProofDescriptor`,
  `MAX_PROOF_BYTES` (8 MiB), `PROOF_MIME_TYPES` — reused unchanged.
- The message-ledger email pattern (`sendPledgeConfirmationEmail` in
  `src/lib/sponsorship/`): insert a `message` row (`status: 'queued'`,
  `supporter_id` set) before sending, update to `sent`/`failed` after, never
  throw, never roll back the committed DB transition.
- CRM supporter timeline: `getSupporterDetail` in
  `src/lib/crm/repository.server.ts` (~line 537) scopes its `audit_log` query
  to `entity_id in (supporterId, ...donationIds)` — pledge-entity audit rows
  written by the new RPCs would never surface without the fix below.
- Admin photo-signing precedent for serving a private-bucket file to staff:
  `src/routes/api/admin/adoptions/applications/$applicationId/photos/$photoId.ts`
  (`requireAdmin` gate, `createSignedUrl(path, 60, { download: fileName })`).
- **Drift since July:** the admin now has an explicit access-area model —
  `AdminAccessArea` in `src/lib/admin/access.ts` with `ROLE_ACCESS` per role
  (`staff` / `treasurer` / `admin`) and `NAV_ITEM_AREAS` mapping nav items to
  areas; page-level gating goes through `requireAdminPageAccess(area, ...)`
  (`src/lib/admin/session.ts`). BP-3 (governance) is the closest recent
  precedent for adding an area. `adminI18n.tsx` and `adminNav` have grown
  accordingly. API-level gating is still
  `requireAdmin(request, roles, client)` (`src/lib/admin/session.server.ts`).

## Approved Decisions

Carried forward from the July design:

- **Lifecycle emails:** staff actions (record payment / approve / reject /
  cancel) send a bilingual email to the sponsor via the message-ledger
  pattern. Email failure never rolls back the committed transition.
- **Proof review auto-transitions the pledge:** approve sets
  `review_status = 'approved'` **and** `pledge.status = 'active'`; reject
  sets `review_status = 'rejected'` **and**
  `pledge.status = 'needs_followup'`. Not independent controls.
- **Manual proof entry is in scope:** staff record a payment (method,
  reference, amount, date, **optional** file) on a `pending_payment` or
  `needs_followup` pledge, moving it into the same review queue
  (`provisional`, `review_status = 'pending'`).
- **Nav placement:** folds into the existing 助養 (sponsor) nav item.
  `/admin?section=sponsor` gains an in-page view toggle
  (動物列表 / 承諾審核); no new sidebar entry.
- **Detail interaction:** clicking a pledge opens a slide-over drawer, not a
  dedicated page/route.

New this round **[Adaptation]**:

- **Access area:** a new `AdminAccessArea` value `"sponsorshipReview"`,
  granted to `staff` and `admin` (not `treasurer`), gates the review view;
  the API routes gate with `requireAdmin(request, ["staff", "admin"],
  client)`; a test asserts the area's role set and the routes' role list
  agree. The sponsor nav item keeps its existing `animals` mapping for the
  animal-list view.
- **One consolidated migration** replaces the reference branch's three
  (see Data Model) — the two follow-up fixes are folded in from the start.
- **One impl branch + one PR** to `main`, same flow as BP-1/BP-3. The spec
  lives on `docs/sponsorship-admin-review-design`; implementation branches
  from it as `docs/sponsorship-admin-review-impl`.

## Data Model

One new migration
`supabase/migrations/20260829180000_sponsorship_pledge_admin_review.sql`
(timestamp after `20260829120000_governance_board_members.sql`), folding the
reference branch's `20260702183000_sponsorship_pledge_admin_review.sql`,
`20260703090000_pledge_status_update_message_unique.sql`, and
`20260703110000_sponsorship_payment_proof_optional_file.sql`:

### `sponsorship_payment_proof` changes

- Drop the `unique (pledge_id)` constraint
  (`sponsorship_payment_proof_pledge_id_key`); replace with a plain index on
  `pledge_id`. Proof rows accumulate as history — the most recent row
  (`created_at desc`) is "current" for review; older rows are read-only
  history in the drawer. Required so staff can attach a corrected proof after
  a rejection, when the pledge already has a (rejected) proof row.
- Add `reviewed_by uuid references public.admin_user(id)`,
  `reviewed_at timestamptz`, `review_note text`.
- Add `source text not null default 'public'
  check (source in ('public', 'staff'))`.
- Relax `storage_path` / `file_name` to nullable; re-create the `file_type` /
  `file_size` CHECK constraints to allow null (a staff-recorded payment may
  have no file; payment_method / reference / amount_cents / payment_date /
  review_status / source stay required).

### Email idempotency guard

Partial unique index mirroring the donation-acknowledgement guard in
`20260630120000_donation_lifecycle_integrity.sql`:

```sql
create unique index if not exists message_pledge_status_update_unique
  on public.message (supporter_id, (payload ->> 'reference'), (payload ->> 'event'))
  where channel = 'email' and payload ->> 'kind' = 'sponsorship_pledge_status_update';
```

The key includes `event` because one pledge legitimately produces several
distinct status-update emails over its lifecycle; a retried request,
double-click, or replay of the same admin action must not send a duplicate.
The claim insert happens before any external send; a concurrent duplicate
becomes a 23505 no-op.

### New RPCs (mirroring the `change_adoption_case_status` template exactly)

Each is `security definer`, first validates
`exists (select 1 from admin_user where auth_user_id = p_actor_user_id and
status = 'active' and role in ('staff','admin'))` (raising `42501`
otherwise), raises on an invalid state transition, writes exactly one
`audit_log` row (`entity = 'sponsorship_pledge'`, `entity_id = p_pledge_id`),
and ends with `revoke all ... from public; grant execute ... to
service_role`:

- **`record_sponsorship_payment_proof(p_pledge_id, p_actor_user_id,
  p_storage_path, p_file_name, p_file_type, p_file_size, p_payment_method,
  p_reference, p_amount_cents, p_payment_date, p_note)`** — only valid when
  `pledge.status in ('pending_payment', 'needs_followup')`; inserts a
  `sponsorship_payment_proof` row (`source = 'staff'`,
  `review_status = 'pending'`, file params nullable) and sets
  `pledge.status = 'provisional'`.
- **`review_sponsorship_payment_proof(p_pledge_id, p_decision,
  p_actor_user_id, p_note)`** — only valid when
  `pledge.status = 'provisional'` and the current (newest) proof's
  `review_status = 'pending'`; `'approve'` → proof `approved` + pledge
  `active`; `'reject'` → proof `rejected` + pledge `needs_followup`. Both
  set `reviewed_by` / `reviewed_at` / `review_note`.
- **`cancel_sponsorship_pledge(p_pledge_id, p_actor_user_id, p_note)`** —
  valid from any state except `cancelled`; sets
  `pledge.status = 'cancelled'`.

No change to `sponsorship_pledge.status`'s CHECK constraint and no
status-config table.

### Live-apply gate

The migration SQL is committed to the repo only. Applying it to the live
Supabase project (`iihqjzilgawhfdhdevam`) happens solely on explicit human
confirmation — never automatically — and can be batched with BP-3's
still-pending `20260829120000_governance_board_members.sql`. Until applied,
the deployed admin review view degrades to its error state (same situation
as `/about/team` today); the public sponsorship flow is unaffected.

## Backend

New module `src/lib/sponsorshipAdmin/` (mirrors the adoption coordinator
layering):

- `types.ts` — `PledgeSummary`, `PledgeDetail`, `PaymentProofRecord`,
  decision input types.
- `schemas.ts` — zod input schemas for record / review / cancel and the
  list-query params.
- `repository.server.ts` — thin wrappers over the 3 RPCs (`client.rpc(...)`)
  plus list/detail selects (pledge + preferences + proof history + recent
  `audit_log` rows for that pledge).
- `service.ts` — validates input, calls the repo, then triggers the matching
  lifecycle email best-effort after the DB transition has committed.
- `http.server.ts` — request parsing / response shaping shared by the route
  handlers.
- `notifications.server.ts` — `sendPledgeStatusUpdateEmail` (see Emails).

### Routes (mirror `api/admin/adoptions/cases*`)

- `GET /api/admin/sponsorships/pledges` — list, filterable by `status`,
  searchable by supporter name/email/reference, paginated.
- `GET /api/admin/sponsorships/pledges/$id` — detail payload for the drawer.
- `GET /api/admin/sponsorships/pledges/$id/proof-url` — signed URL for a
  proof file (`createSignedUrl`, 60 s TTL, `download: fileName`), copied
  from the adoption photo-signing route. 404 when the current proof has no
  file.
- `POST /api/admin/sponsorships/pledges/$id/proof` — multipart
  (method/reference/amount/date + optional file) →
  `record_sponsorship_payment_proof`. Reuses `validateProofDescriptor`,
  `MAX_PROOF_BYTES`, `PROOF_MIME_TYPES` unchanged; uploads to the same
  bucket/path convention as the public submission.
- `POST /api/admin/sponsorships/pledges/$id/review` —
  `{ decision: "approve" | "reject", note? }` →
  `review_sponsorship_payment_proof`.
- `POST /api/admin/sponsorships/pledges/$id/cancel` — `{ note? }` →
  `cancel_sponsorship_pledge`.

All gated by `requireAdmin(request, ["staff", "admin"], client)`; all
responses `Cache-Control: no-store`. `src/routeTree.gen.ts` is regenerated by
the build and committed, never hand-edited.

## Emails

One `renderPledgeStatusUpdateEmail({ event, language, supporterName,
reference, ... })` in `src/lib/sponsorship/emailTemplates.server.ts`,
parametrized over 4 events:

- `proof_recorded` — fires only from the staff-manual-entry path (public
  self-submissions already get equivalent messaging in the submission
  confirmation email).
- `active` — payment confirmed.
- `needs_followup` — includes a `mailto:` fallback referencing the pledge
  reference, matching the status page's copy for this state.
- `cancelled`.

Sent via `sendPledgeStatusUpdateEmail`
(`src/lib/sponsorshipAdmin/notifications.server.ts`), following the exact
queued → sent/failed message-ledger pattern of `sendPledgeConfirmationEmail`,
with `payload.kind = 'sponsorship_pledge_status_update'` and
`payload.event` / `payload.reference` feeding the idempotency index. Never
throws; failure marks the `message` row `failed` and logs.

## CRM Timeline Fix

In `getSupporterDetail` (`src/lib/crm/repository.server.ts`): fetch the
supporter's `sponsorship_pledge` ids in the same `Promise.all` batch as the
donation rows and include them in the `audit_log` `.in("entity_id", ...)`
filter, so pledge status changes surface in the supporter's timeline. No
change to the `message` query — it is already scoped by `supporter_id`, and
the new lifecycle emails set that field.

## Admin UI

- **Access [Adaptation]:** `src/lib/admin/access.ts` — add
  `"sponsorshipReview"` to `AdminAccessArea`, grant it to `staff` and
  `admin` in `ROLE_ACCESS`. The review view inside the sponsor section
  renders only when the current identity's role has the area
  (`canRoleAccessAdminArea`); today that set equals the sponsor nav item's
  visibility, so nothing moves in the sidebar.
- `/admin?section=sponsor` (`src/routes/admin/index.tsx` /
  `AdminDashboardContent`) gains a view toggle between 動物列表 (existing
  sponsor `AnimalsTable`, unchanged) and 承諾審核 (new). Same route, same nav
  entry.
- `src/components/admin/sponsorship/PledgeReviewLane.tsx` (new, mirrors the
  adoption `CaseList` shape): `DataTable` with status filter chips for the 5
  statuses, search by supporter name/email/reference, pagination.
- `src/components/admin/sponsorship/PledgeDetailDrawer.tsx` (new,
  slide-over): pledge summary (tier, amount, contact, ranked animals), proof
  history, plus state-dependent content:
  - `pending_payment` / `needs_followup` (no pending proof) → 記錄付款 form →
    `POST .../proof`.
  - `provisional` (proof awaiting review) → proof preview (inline image or
    PDF link via the signed-URL endpoint; "no file" note for file-less
    staff-recorded payments) + 核實通過 / 拒絕 buttons → `POST .../review`.
  - `active` → read-only + 取消 button → `POST .../cancel`.
  - `cancelled` → fully read-only.
  - 近期活動 list of the pledge's recent `audit_log` entries + link to the
    full supporter page.
- `src/components/admin/sponsorship/pledgeReviewLogic.ts` — pure logic
  (filter/search param building, drawer state selection) with its own test
  file; no component-level tests, per the admin-panel precedent.
- `adminI18n.tsx` gains the new labels following the current (post-BP-3)
  structure — both languages, no orphan keys.

## Error Handling

- RPC `42501` (actor not active staff/admin) → 403; invalid state transition
  (e.g. reviewing a non-`provisional` pledge, recording proof on an
  `active`/`cancelled` pledge) → 409; malformed input → 400.
- Proof upload validation (MIME/size) → 400, same errors as the public
  submission route.
- Missing pledge/proof/file → 404.
- Email failure logged (`message` row `failed`), never fails the request,
  never rolls back the transition.
- Unexpected errors → logged, generic 500, no internal detail leaked.

## Testing Plan (bun test, TDD)

- **schemas/service:** input validation for record/review/cancel; state-guard
  logic; email triggered per event after commit.
- **repository:** RPC wrappers and list/detail query shaping against the
  fake-Supabase-client pattern from `submission.server.test.ts`.
- **email templates:** all 4 events render, bilingual, HTML-escaped;
  `needs_followup` includes the `mailto:` fallback.
- **notifications:** idempotency claim happens before send; duplicate claim
  (23505) short-circuits without sending; failure marks `failed`.
- **routes:** auth gating (anon and non-staff → 401/403), happy path per
  endpoint, 400/404/409 mapping, `no-store` header.
- **CRM repository:** pledge-entity `audit_log` rows appear in
  `getSupporterDetail`'s timeline output.
- **access [Adaptation]:** `sponsorshipReview` granted to staff+admin, denied
  to treasurer; area role set matches the API routes' `requireAdmin` list.
- **UI logic:** `pledgeReviewLogic.test.ts` for filter/search/drawer-state
  logic.
- **migration safety:** extend `src/lib/supabaseMigrations.test.ts` per its
  current rules — relaxed `pledge_id` constraint, nullable file columns, new
  columns, RPC revoke/grant, and anon-inaccessibility.

The full pre-PR gate (typecheck, `bun test --isolate`, lint, build,
`routeTree.gen.ts` parity) must be green; brand-verify is unaffected
(admin-only surface).

## Out of Scope

- CSV export and bulk actions on the review lane.
- Staff editing a pledge's tier/amount/preferences.
- Generic configurable-status machinery for pledges.
- Recurring/automatic billing and payment reminders.
- A resend-link flow for the magic-link status page.
- Applying the migration to the live database (separate, explicitly-confirmed
  operational step).
- Sponsorship go-live terms (eligibility, amounts, cadence, receipts/tax) —
  owner decision D-9; this builds the capability only.

## Design Defaults

- Mirror the adoption coordinator workbench's file layout, RPC-security
  template, and route conventions wherever the shape matches.
- Reuse existing helpers unchanged: `requireAdmin`, the proof-descriptor
  validators, the message-ledger email pattern, the signed-URL route pattern.
- Keep the pledge status model a plain 5-value enum.
- Where the July reference code and current `main` conventions disagree,
  current `main` wins (access areas, i18n structure, test helpers).
