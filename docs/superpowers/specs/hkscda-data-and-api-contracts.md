# HKSCDA Data and API Contracts

Created: 2026-09-11 · Baseline commit: `c037cc1` (= `origin/main` = deployed production)
Source of requirements: `CLAUDE_HKSCDA_IMPLEMENTATION_MASTER_PLAN_v1_2026-09-11_EN.md` §3, §5–§8
Evidence for every "current state" claim: `docs/evidence/hkscda-revision/01-source-defect-inventory-2026-09-11.md`

## 0. How to read this document

Every object is labelled with one of:

| Label | Meaning |
|---|---|
| **RETAINED** | Exists today and is kept as-is |
| **EXTENDED** | Exists today; this work adds to it without breaking existing callers |
| **NEW** | Does not exist yet. A name appearing here is a *proposal*, not evidence of an existing API |
| **RETIRING** | Kept for a compatibility period, then removed |

A proposed route or table name in this file **is not** evidence that an API exists.
Locate real entry points with `rg` before implementing against them.

### Non-negotiable preservation rules

These derive from the master plan and govern every contract below.

- Animal UUIDs, original names and reference numbers, original-site photographs and
  copy, applications, supporters, sponsorships, payments, receipts, attendance,
  consent and history are **preserved**. Compare before migrating.
- Never reset the database, reseed existing data, merge animals by name, overwrite a
  supporter because an email matches, substitute demonstration data for a missing
  record, or replace a real animal with a generated image.
- Migrations are **forward and additive**. Each needs a dry run, ID-level mapping, a
  conflict list, before/after count and relationship reconciliation, and idempotent
  reruns.
- A new feature activates only when **every** write entry point obeys the new
  constraint. Legacy APIs must not bypass new rules, and two services must not
  independently write the same master record during a transition.

---

## 1. Layering and audit contract

**RETAINED.** All new server work follows the existing layering:

```
src/routes/api/**/route.ts     thin: rate limit -> Turnstile -> delegate
  \_ -handlers.ts              wires deps (auth fn, service) into a handler factory
      \_ lib/<domain>/http.server.ts   HTTP shape: parse, status codes, error mapping
          \_ lib/<domain>/service.ts   business rules - pure, no Supabase import
              \_ lib/<domain>/repository.server.ts   Supabase queries only
```

**Audit contract (RETAINED, and binding on all new work).** The legacy
`log_animal_mutation` trigger fires only when the write carries a real JWT
(`auth.uid()` set); service-role writes are skipped. A new API therefore **cannot**
rely on it to produce audit automatically. The mutation and its `audit_log` row are
written inside one `*_with_audit` RPC, in a single transaction — never as a second
PostgREST call, because the mutation commits first and a failed follow-up leaves the
change applied, unaudited, and reported to the caller as a 500.
`adminRouteAuditing.test.ts` enforces the pairing; new domains must satisfy it.

**Clock contract (RETAINED).** Time-dependent logic takes `now = () => new Date()`
as a parameter. No inline `Date.now()` in testable logic.

**Security invariants (RETAINED).** `*.server.ts` never reaches the client bundle;
every admin API route calls `requireAdmin`; every table has RLS; every
`security definer` function pins `search_path`; app-called RPCs live in `public` and
are granted to `service_role` (the `private` schema is not exposed to PostgREST).

---

## 2. Public identity and consent — the protected path

### 2.1 Current state

`public.resolve_public_supporter_identity(jsonb)` (**RETAINED**, migration
`20260905144848`) is the correct protected mechanism. It inserts with
`on conflict (email) do nothing` and therefore **never overwrites** an existing
supporter's `name`, `phone`, `language` or `source`. It returns
`{supporterId, kind: 'created' | 'existing'}`.

`public.supporter_consent_intent` (**RETAINED**) captures public opt-in *ticks*
without changing consent state, written by the `record_public_consent_intents`
trigger on `donation` and `volunteer_registration`.

Donation and volunteer submissions already write **only** `opt_out` rows from
unverified public forms (`donations/service.ts`, `volunteers/service.ts` both apply
`.filter((row) => row.status === "opt_out")`).

### 2.2 Verified gap

**Sponsorship is the outlier and is a live defect.**
`src/lib/sponsorship/submission.server.ts` bypasses the protected path entirely:

- it calls `.from("supporter").upsert({name, email, phone, language, source}, {onConflict:"email"})`,
  which **UPDATEs every listed column** on an existing supporter; and
- it inserts `buildConsentRows(...)` with **no** `opt_out` filter, so an unverified
  public form can flip a prior `opt_out` to `opt_in`.

### 2.3 Contract

| Object | Label | Contract |
|---|---|---|
| `resolve_public_supporter_identity(jsonb)` | **EXTENDED** | `source` accepts `'sponsorship_pledge_form'` in addition to `'donation_form'`, `'volunteer_registration_form'`. Conflict behaviour unchanged: never overwrite. |
| `supporter_consent_intent.source` | **EXTENDED** | accepts `'sponsorship_pledge_form'` |
| `supporter_consent_intent.submission_type` | **EXTENDED** | accepts `'sponsorship_pledge'` |
| `record_public_consent_intents()` | **EXTENDED** | handles `tg_table_name = 'sponsorship_pledge'` |
| `sponsorship_pledge.consent_email_requested`, `.consent_whatsapp_requested` | **NEW** columns | mirror `donation`; feed the intent trigger. Default `false`. |
| `PublicContact["source"]` (TS) | **EXTENDED** | union gains `"sponsorship_pledge_form"` |
| `sponsorship/submission.server.ts` | **EXTENDED** | resolves identity via `createPublicIdentityRepository`; writes consent rows filtered to `opt_out` only |

**Consent state model (RETAINED, three states).** `unknown`, `opt_in`, `opt_out`, per
channel, each with source and timestamp. Changing one channel must never alter
another channel's `unknown`. An unverified submission must never overwrite an
`opt_out`. Volunteer terms, service messages and marketing consent are **separate**;
sending eligibility is determined by the message's purpose and the channel's actual
policy, not by one blanket flag.

**Open gap recorded, not yet closed:** `supporter_consent_intent` rows are written
but never read or promoted — no code path turns an intent into consent. Promotion
requires staff verification and is Phase 3 work.

**Acceptance:** T04 — an unverified submission using an existing email does not
overwrite contact details, source or opt-out status. T16 — updating one consent
channel does not change another channel's `unknown`.

---

## 3. Animals

### 3.1 Current state

| Column | State |
|---|---|
| `id uuid` | **RETAINED** — canonical identity; never regenerated |
| `type text check (type in ('cat','dog','sponsor'))` | legacy: conflates species with programme |
| `adoption_eligible boolean not null` | **RETAINED** — added `20260906162436` |
| `sponsorship_eligible boolean not null` | **RETAINED** — added `20260906162436` |
| `retired_at timestamptz` | **RETAINED** — archival without breaking foreign keys |
| `public_profile jsonb not null default '{}'` | **RETAINED** — DB-enforced allowlist |
| `status text check (status in ('available','adopted','fostered'))` | conflates care state with public visibility |

`public_profile` is validated by `private.is_valid_animal_public_profile(jsonb)` as a
CHECK constraint. Allowed keys only: `code`, `birthday`, `neutered`, `suitability`,
`personality`, `health`, `story`, `recordDate`. It rejects URLs, `@`, phone-number
patterns and angle brackets, and bounds lengths. **This is the public projection
allowlist and it is enforced in the database, not merely in application code.**

### 3.2 Contracts

**Species vs programme (EXTENDED).** Species is `cat` or `dog` only. Adoption and
sponsorship eligibility are **independent booleans** and may both be true. The legacy
`type='sponsor'` value is **RETIRING**: each such animal is mapped to its real
species with `sponsorship_eligible = true`, by ID, with a reconciliation list. Counts
must not be added together — 208 adoption-eligible + 115 sponsorship-eligible with 75
overlapping is **248 animals, not 323**.

The existing trigger `set_animal_catalog_membership_defaults` rewrites **both**
eligibility booleans when `type` changes into or out of `'sponsor'`. Any editor that
exposes `type` as a control therefore silently changes catalogue membership. The
contract is that the CMS exposes **eligibility directly** and does not use species as
a membership proxy.

**Publication vs care vs archival (NEW, three separate axes).**

| Axis | Field | Values |
|---|---|---|
| Care / case state | `status` (**RETAINED**) | `available`, `adopted`, `fostered` |
| Publication | `publication_state` (**NEW**) | `draft`, `published`, `unpublished` |
| Archival | `retired_at` (**RETAINED**) | null = active |

Today the public RLS policy requires `status='available'`, which means a fostered
animal cannot be shown publicly and publication cannot be controlled independently of
care state. Archived records stay retrievable but are not public by default and are
excluded from admin lists by default.

**Admin list filter (EXTENDED).** `src/routes/admin/index.tsx` currently filters
`.eq("type", section)` while the public side filters on the eligibility booleans. The
admin list must filter on the **same** eligibility predicate as the public side, or
rows visible at `/sponsors` remain unreachable from `/admin?section=sponsor`.

**Legacy entry-point compatibility (RETAINED).**

| Existing entry point | Behaviour |
|---|---|
| `/admin?section=cat` | unified animal list, cat filter |
| `/admin?section=dog` | unified animal list, dog filter |
| `/admin?section=sponsor` | unified animal list, sponsorship-eligibility filter + a clear route into Sponsorship Management |
| animal/case UUID deep links | canonical IDs preserved; navigation changes never change identity |
| original numeric animal URLs | mapped from **source ID** to the same animal — never guessed from names |

**Search (EXTENDED).** Must cover names, aliases, reference numbers and source IDs;
`C3761` and `荃海棠` must resolve to the same record. Save/cancel preserves filters,
search, page number and scroll position.

### 3.3 Animal write path and versioning

**NEW.** There is no `/api/admin/animals` route today; `AnimalForm`/`AnimalsTable`
write to Supabase directly from the browser with the anon client (the documented
legacy exception). New mutations go through the API layer:

```
POST/PATCH /api/admin/animals/:id          -> animals http.server -> service -> repository
                                           -> update_animal_with_audit(...)   [NEW RPC]
POST       /api/admin/animals/:id/publish  -> publish_animal_with_audit(...)  [NEW RPC]
```

Both RPCs validate the actor and the expected version, and commit the mutation plus
its `audit_log` row in the same transaction. Animal revisions reuse the *concepts*
proven in `content_revision` / `content_publish_request` (migration `20260905150012`)
but those tables are keyed to `content_item` and cannot be pointed at `animals`
without a schema change.

### 3.4 Image storage contract (NEW — replaces the current behaviour)

Current behaviour is unsafe and must change: `AnimalForm.tsx` uploads to a **fixed
path** `${animalId}.jpg` with `{upsert:true}` **before** the database write, and the
write's failure path performs no rollback. A failed save therefore destroys the
animal's existing public photo permanently.

The contract:

1. Local preview after selection, with format/size guidance. The **server** validates
   real format and limits.
2. Upload to a **new immutable object path** per version. The original is preserved.
   Never overwrite a public file at a fixed path.
3. Record media metadata, crop focal point, alt text and source; generate a
   previewable derivative first.
4. Saving a **draft** updates only the draft's media references plus its audit row.
   Only an authorised **Publish** transaction switches the public snapshot / main
   photo, after validating the expected version, with the publication audit committed
   in the same transaction. **Drafts, failed saves and version conflicts all leave the
   existing public photo intact.**
5. Unreferenced uploads are cleaned up only after a delay **and** a reference check.
6. Public images are served from public derivatives; private media is access-checked.
   Hiding a frontend button is not protection.

**Acceptance:** T07 — a failed DB save after upload, a version conflict, or a retry
does not damage the existing public photo.

---

## 4. Volunteers

### 4.1 Current state — what actually exists

| Concern | Current implementation |
|---|---|
| Volunteer identity | a `supporter_role` row with `role='volunteer'`; no profile entity; the registration-to-supporter link is nullable |
| Tiers | **do not exist** — 新手義工 / 恆常義工 / 資深義工 appear nowhere in the repository |
| Training credential | **does not exist**; the required refusal string appears nowhere in `src/` |
| Terms + acceptance evidence | **do not exist**; the public form collects only two marketing checkboxes |
| Capacity | a single `capacity integer` on `volunteer_activity` |
| Daily limit of 20 | **does not exist** in either counting interpretation |
| Waitlist | a terminal status only — no position, hold, expiry, or promotion |
| Attendance | two mutable columns on the registration row; no ledger, no correction history |
| Concurrency | `pg_advisory_xact_lock(activity_id)` + `for update` + expected-`updated_at` in `20260905163900` |

`volunteer_activity_counts(uuid[])` is an **RPC function** (not a view) and already
sums `participant_count` rather than counting rows — the plan's stated requirement.
The repository calls it with `if (error) throw error` and no fallback, on a path that
includes the **anonymous public** activity list, so one missing DB function blanks the
entire volunteer subsystem for everyone.

### 4.2 Contracts

| Object | Label | Contract |
|---|---|---|
| `volunteer_profile` | **NEW** | links to `supporter`; actual joining date (never the website registration date), tier, service status |
| `volunteer_credential` | **NEW** | course, approver, date, status, revocation history. A CRM tag is **not** a credential |
| `volunteer_terms_version` / `volunteer_terms_acceptance` | **NEW** | immutable acceptance evidence: volunteer ID, version, content hash or snapshot, time, source |
| `volunteer_session_policy` | **NEW** | versioned `draft`/`approved`/`retired`, scope, approver, approval time |
| `volunteer_role_quota` | **NEW** | total seats, role caps, protected core seats, minimum staffing — four distinct quantities |
| `volunteer_daily_allocation` | **NEW** | per shelter + Hong Kong date; counting method governed by **D03** |
| `volunteer_attendance` | **NEW** | ledger: verifier, timestamp, session, status, revision reason, original record |
| `group_reservation` | **NEW** | a staff-confirmed reservation; an unprocessed enquiry is **not** a confirmed group |

Service status, tier, course completion, and the role held in a particular session are
**four independent** facts, validated independently.

### 4.3 Unified write transaction (NEW)

All registrations, approvals, waitlist promotions, cancellations, role changes,
rescheduling, group confirmations and attendance corrections go through **one**
capacity-and-eligibility service. No page updates tables directly.

1. Validate actor, input and **idempotency key**. Seat-adding operations require an
   **approved** policy version; cancellations and corrections may reference a
   historical or `legacy` policy and must not be blocked by a missing one.
2. Lock order: shared cat-shelter booking guard -> volunteer identity -> Hong Kong
   date -> activity -> role/registration. Never acquire an identity lock *after* a
   later-level lock. For rescheduling and batch operations, re-read the affected
   member set **inside** the guard.
3. After locking, re-read account, tier, credentials, terms, current time, version,
   duplicate registrations and overlapping sessions. **Never trust tier or training
   flags sent by the frontend.** Cancellation must not be blocked by lost eligibility,
   unaccepted new terms, or existing overcapacity.
4. Validate total seats, role caps, protected core seats and the daily limit of 20.
   Waitlist entries do not occupy confirmed seats; valid holds do, and they expire.
   Authorised backfilling of real past attendance is not rejected as a new
   registration because eligibility changed later.
5. One active booking per person per session.
6. Commit booking + daily allocation + audit + outbox in **one** transaction. Send
   notifications only **after** commit — never externally inside the transaction.
7. Return stable error categories: `ineligible`, `not_yet_open`, `full`,
   `version_conflict`, `policy_unresolved`; translated to Traditional Chinese at the
   frontend, which then refetches current availability.

Database unique constraints and server validation jointly prevent duplicates and
races. A disabled button is not a control. **No general "force approve" that can
bypass evening training requirements or total capacity.**

Policy values, including the daily-20 deduplication contract, live in
`hkscda-volunteer-policy-decisions.md`. Unresolved rules are fixtures, not defaults.

---

## 5. Sponsorship, payments and receipts

### 5.1 Verified gap

`sponsorship_pledge.status` is a **single enum** that simultaneously encodes the
supporter's commitment, the payment state and the reviewer's queue state:
`('pending_payment','provisional','active','needs_followup','cancelled')`. Recording
a payment is gated on `status in ('pending_payment','needs_followup')`, so once a
pledge is `active` **a second month's payment cannot be recorded at all**. There is no
period, cycle or instalment entity. Sponsorship payments never become donations, so a
sponsor cannot be issued a receipt and sponsorship money is invisible to
reconciliation and CRM totals.

### 5.2 Contract (NEW entities, existing ledger reused)

| Object | Meaning | Must not |
|---|---|---|
| **Pledge** | intention + preferences received | be treated as received payment or as debit authorisation |
| **Assignment** | confirmed supporter-to-animal relationship for a period | treat an animal as inventory allowing only one sponsor |
| **Period** | one month's commitment, allocations and follow-up | treat an intent as a legal debt |
| **Payment allocation** | allocation of **one existing payment** to one or more months | duplicate a payment and so duplicate revenue |
| **Proof** | evidence awaiting verification, with review history | be treated as confirmed receipt of payment |
| **Receipt** | issued from verified payment under the established workflow | be issued merely because a form was submitted |

Workflow: select animal/amount -> confirm pledge -> payment details/proof -> staff
verify -> confirmed relationship + monthly records -> receipt per settings -> next
month's payment/follow-up. Preferences, confirmed assignments and payment **must not**
share one status field.

Rules:

- Total allocated across months **must not exceed** the verified payment available.
- Store **integer cents**. `123.45` is preserved as `123.45`.
- Revisions and refunds are traceable adjustments, never overwrites of past receipts.
- While a pledge is active, add payments for new months directly — do not reopen or
  duplicate the pledge.
- A monthly ledger is **not** a provider recurring subscription. Show 「自動扣款」 only
  when a debit authorisation actually exists and has been verified; otherwise present
  the manual monthly method.
- A one-off payment is never labelled "/month".
- Webhook/API retries use a unique event or idempotency key; mutation + audit +
  outbox commit atomically.

Support second month, multiple months prepaid, partial payment, top-ups, duplicate
proof, refunds/reversals, termination, and animal change/adoption/death — preserving
change history and the record of how the supporter's wishes were handled. Payments are
never silently moved to another animal.

**Acceptance:** T13, T14, T15.

---

## 6. Roles and permissions

Define the **action matrix first**, then update UI, API and RLS together. Handoffs are
not solved by granting everyone admin.

Actions to define: animal content, adoption cases, sponsorship relationships, proof
verification, receipt voiding, supporter contact, volunteer credentials, content
publication. Each role gets only the data and operations its task requires.

**Verified drift to close:** RLS is materially **wider** than the application matrix
for supporter PII and consent. `src/lib/admin/access.ts` omits `supporters` from the
staff set and the supporter API routes gate on `["treasurer","admin"]`, but the RLS
policy admits staff. The app matrix and RLS must be mirrored, with
`supabase/rls-tests/` proving the behaviour rather than asserting the current state.

Separately, the consent ledger is append-only **only in application code** — RLS
permits in-place `UPDATE` of ledger rows. Append-only must be enforced in the
database.

**Acceptance:** T17 — staff, treasurer and admin complete their handoffs and
unauthorised direct API calls are rejected.

---

## 7. Error, empty and failure-state contract

This is the contract behind the audit's most visible symptom. The verified root cause
is a **repeated code pattern**: admin surfaces destructure `data` from a query and
never read `isError`/`error`, then apply `?? []` or `?? {…0}` defaults. A failed load
is therefore rendered as a legitimately empty list or a zero KPI.

The contract for every admin list and KPI:

| Situation | Required behaviour |
|---|---|
| Load failed | show 「無法載入」 and a **retry** action, plus an error reference ID |
| Load failed | KPIs show a failure state — **never `0`**, never `HK$0.00` |
| Load failed | pagination **Next** is disabled; it must not stay enabled |
| Genuinely empty | show zero items, and correctly disable Next |
| Extension section failed | that section fails **independently**; the master record still renders |
| Missing RPC / HTTP 500 / network failure | surfaced as an error, never as empty history |

A failing extension module must never make the whole record disappear, and a failure
must never masquerade as empty history.

**Acceptance:** T02 — missing RPCs, 500s and network failures display errors and KPIs
do not masquerade as zero.

---

## 8. Jobs, outbox and delivery status

### 8.1 Reuse, do not reinvent

`donation_delivery_job` (migration `20260905155357`) is already a correct outbox
primitive: status, `next_attempt_at`, lease owner and expiry, attempt counts, a
conditional-UPDATE claim that cannot double-claim, and
`retry_donation_delivery_job_with_audit`. There is a supporting partial index
`donation_delivery_due_idx`. Phase 5 reuses this shape rather than inventing another.

### 8.2 Verified gaps

- **There is no scheduler of any kind** — no Vercel cron (`vercel.json` has no
  `crons` key), no `pg_cron`, no worker, no job route. Queued work runs only when an
  admin clicks.
- `next_attempt_at` backoff is computed and persisted but **never read** — no query
  selects due jobs, so the index has no reader.
- `public.message` is an outbox with **no dispatcher**; rows left `queued` or `failed`
  are never drained.

### 8.3 Contract

Delivery status distinguishes at least: `pending`, `processing`,
`accepted_by_provider`, `delivered` (only where evidence exists), `failed`,
`manual_intervention_required`. Queued or provider-accepted is **never** reported as
delivered.

Notification identity is a stable unique key of volunteer + month/event + type.
Policy revisions and recalculations are recorded separately; a new version must not
resend the same reminder. Retries have backoff, attempt counts, leases and
dead-letter/manual handling. On an unknown result after a provider timeout, check the
outcome or use provider idempotency — never blindly resend.

Scheduled-job entry points are **authenticated**. Job triggering is never exposed
through a public button. Real-time registration rules are still evaluated **inside the
transaction** and never depend on cron running punctually.

Only actually-configured channels are used. An unconfigured SMS/WhatsApp channel must
not pretend it can send. Restoring the delivery model must **not** auto-create pending
receipt or message jobs for historical payments.

**Acceptance:** T31.

---

## 9. Demonstration and test data

The seven published demonstration items are addressed by a **per-ID checklist**, not
by removing the 「【示範】」 label. Verified: four of the seven names appear nowhere in
the repository, so the inventory must be built from the **database**, not from source.

Classification is explicit and data-driven. Legitimate history is preserved; records
are not bulk-deleted because their name contains "demo". Test payments are excluded
from official reporting by classification and per-ID checklist while their historical
relationships remain intact.

Every public surface is checked: homepage, content lists and details, maps, site
search, public APIs, hydration, sitemap, OG/share previews, and caches.

**Verified gap:** the production demo-seed guard covers only two write-capable
scripts. `scripts/import-hkscda-animals.js` (exposed as `import:hkscda`) builds a
service-role client with **no project-ref check and no confirmation flag**, so it can
write scraped animal rows and public storage objects straight into production. It must
carry the same guard.

**Acceptance:** T09.

---

## 10. Verification contract

A passing mock is never evidence of a real payment, delivery, or production database
transaction. Distinguish and record separately:

1. **Reviewable implementation complete** — code, tests, reviewable diff
2. **Isolated acceptance passed** — verified against isolated data with evidence
3. **Operationally activated** — approved and enabled in production

**Measured baseline fact that constrains claim-making:** `bun test` reports
1969 pass / 86 skip / 0 fail — and **every one of the 86 skips is a database-backed
test**. The green blocking gate therefore proves unit and boundary behaviour and
proves *nothing* about the database. `bun run test:rls` and the `*.database.test.ts` /
`*.integration.test.ts` suites require a real Postgres and specific env vars that **no
CI job sets**, and the only CI job that applies migrations to a real Postgres
(`rls-matrix`) is `continue-on-error: true`. Closing that is Phase 1/6 work, and until
it is closed no database claim may rest on "the test suite is green".

Required gate commands (`package.json`, CI): `bun run typecheck`, `bun test`,
`bun run lint`, `bun run build`, `bun run verify:brand`; `bun run test:rls` for RLS
changes; `verify:a11y` / `verify:performance` for public layout. Record actual
commands, commit, environment, results, and the reason for anything not run. A Vite
build is not a typecheck.
