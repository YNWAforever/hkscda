# Admin panel bug log — Phase 1

Date: 2026-10-29. Base: `0e59983`. Companion to `docs/AUDIT.md`.

**Status legend.** _Proven_: reproduced by running the real handler, service or
repository factory with fakes. _Traced_: followed through TypeScript and SQL to a
concrete wrong outcome, but not executed, because no database is available here.
_Plausible_: depends on documented third-party behaviour (PostgREST, GoTrue) that
could not be run locally.

**Fix type.** `code` = TypeScript only. `migration` = needs a new SQL migration.
The brief requires approval before any migration, so those wait for a go-ahead.

Proof scripts (throwaway, not committed) are under the session scratchpad
`agents/<domain>/` and `sweep/`. Phase 2 turns each into a committed failing test.

> **Status:** all Phase 1 findings are fixed. The 31 include BUG-01's, BUG-02's, BUG-03's, BUG-06's, BUG-22's and BUG-23's migrations, approved and added after Phase 4; the one originally deferred item (BUG-53's one-published-guide uniqueness) was closed on 2026-11-10 after a production data audit — see [Post-baseline parity and guide uniqueness](#post-baseline-parity-and-guide-uniqueness-2026-11-10). BUG-33 to BUG-65 come from a second pass (2026-10-30) and are all fixed: 21 in code (PR #228), the other 12 and the database parts of BUG-42 and BUG-55 with approved migrations; see [Second pass](#second-pass-bug-33bug-65). BUG-66 to BUG-73 come from a content-creation review (2026-11-05): all are fixed: BUG-66–70 and 73 in code, BUG-71 and BUG-72 with approved migrations; see [Content creation pass](#content-creation-pass-bug-66bug-73). See [`FIX_REPORT.md`](FIX_REPORT.md) for which ones and why.

## Summary

| ID     | Sev  | Area            | Title                                                                                                   | Status           | Fix                  |
| ------ | ---- | --------------- | ------------------------------------------------------------------------------------------------------- | ---------------- | -------------------- |
| BUG-01 | High | Animals         | Publishing an animal draft reverts a status set in the coordinator pipeline                             | Traced           | migration            |
| BUG-02 | Med  | Adoptions       | Same animal can be finalised as adopted in two cases; closed case silently reopened                     | Traced           | migration            |
| BUG-03 | Med  | CRM             | "New supporter" with an existing email overwrites it, un-deletes it and wipes its roles                 | Traced           | migration            |
| BUG-04 | Med  | Finance         | Receipt tax year and number use the UTC year, not HKT                                                   | Proven           | code                 |
| BUG-05 | Med  | Finance         | "Issue receipt" and "awaiting receipt" count ignore the HK$100 eligibility rule                         | Proven           | code                 |
| BUG-06 | Med  | Content         | Social-copy PATCH writes its audit row in a separate call (not atomic)                                  | Proven           | migration            |
| BUG-07 | Med  | FAQ             | FAQ entry can be deactivated without the required reason; `"false"` parses as `true`                    | Proven           | code                 |
| BUG-08 | Med  | Documents       | A published document's checksum/kind can be edited (changes sponsorship-terms version, can 503 pledges) | Proven           | code                 |
| BUG-09 | Med  | Coordinator     | Monthly report/export history uses UTC months; month `13` accepted                                      | Proven           | code                 |
| BUG-10 | Med  | Volunteers      | Waitlist policy refusals return 500 "try again" instead of 409 with the reason                          | Proven           | code                 |
| BUG-11 | Med  | Access          | Inviting an email that already has a confirmed Auth account returns 500                                 | Plausible        | code                 |
| BUG-12 | Med  | CRM             | Supporter phone and tags have no length or count limits                                                 | Proven           | code                 |
| BUG-13 | Low  | CRM / Access    | Not-found / bad-payload / non-UUID id return 500 instead of 404/400                                     | Proven           | code                 |
| BUG-14 | Low  | Finance         | Reconcile with non-UUID id → 500; voiding an already-void receipt → 500                                 | Proven           | code                 |
| BUG-15 | Low  | Adoptions       | Duplicate case number on finalise, unknown animal on internal profile, bad list section → 500           | Proven           | code                 |
| BUG-16 | Low  | Docs / FAQ      | Unknown id, missing upload, wrong asset kind → 500 instead of 404/409/422                               | Proven           | code                 |
| BUG-17 | Low  | Volunteers      | End before start, bad qualification dates, non-UUID / empty group-enquiry patch → 500                   | Proven           | code                 |
| BUG-18 | Low  | Lists           | Page numbers past the end or very large page numbers → 500                                              | Proven/Plausible | code                 |
| BUG-19 | Low  | Finance         | Payments CSV export: no audit row, no row cap, no `no-store`                                            | Traced           | code                 |
| BUG-20 | Low  | Coordinator     | Regenerating an export writes two audit rows and is counted twice                                       | Proven           | code                 |
| BUG-21 | Low  | Coordinator     | Coordinator CSV exports silently stop at 1,000 rows                                                     | Traced           | code                 |
| BUG-22 | Low  | Animals         | Draft save/restore write no audit row; restore has no revision fence                                    | Traced           | migration            |
| BUG-23 | Low  | Finance / CRM   | Manual gift with inline supporter overwrites an existing supporter (API only)                           | Traced           | migration            |
| BUG-24 | Low  | CRM UI          | Saving an edit on a soft-deleted supporter always restores it                                           | Traced           | code                 |
| BUG-25 | Low  | Access          | Invite links have no `redirectTo`; invitee has no set-password step                                     | Traced           | code + decision      |
| BUG-26 | Low  | AuthZ           | Two admin routes read and validate the body before `requireAdmin`                                       | Proven           | code                 |
| BUG-27 | Low  | Animals         | Photo-upload URL maps every auth failure (incl. DB errors) to 401                                       | Proven           | code                 |
| BUG-28 | Low  | Admin UI        | Staff see actions they cannot use; stale rows after a 409 on reconcile                                  | Traced           | code                 |
| BUG-29 | Low  | Volunteers      | Publishing an unbound legacy draft shows "data was updated" instead of the real reason                  | Traced           | code                 |
| BUG-30 | Med  | Dependencies    | seroval (SSR serialiser) and Vite have in-range security patches available                              | Verified         | lockfile             |
| BUG-31 | Med  | Auth / session  | A revoked or expired server session strands the admin on a generic error with no way out                | Proven (E2E)     | code                 |
| BUG-32 | Low  | Admin UI        | Offline navigation shows the previous list's empty state instead of an offline/failure notice           | Proven (E2E)     | code                 |
| BUG-33 | Med  | Adoptions       | BUG-02's finalise guard blocks re-adopting a returned animal forever (regression)                       | Traced           | migration + decision |
| BUG-34 | Med  | Adoptions       | A finalised or closed case can be reopened or rejected with no check or reason                          | Traced           | migration            |
| BUG-35 | Med  | Adoptions       | Cancelling a follow-up leaves it open and overdue; reopening a done task leaves it done                 | Proven           | code                 |
| BUG-36 | Med  | Adoptions       | Intake inbox items are never resolved, so the open inbox never empties                                  | Traced           | migration            |
| BUG-37 | Med  | Adoptions / CRM | Staff can list every supporter's email and phone through the intake identity search                     | Traced           | migration            |
| BUG-38 | Med  | Finance         | A treasurer can publish their own payment-method edit if someone else submitted it                      | Traced           | migration            |
| BUG-39 | Med  | Content         | Two content audit actions log `admin_user.id` instead of the auth user id                               | Traced           | migration            |
| BUG-40 | Low  | Adoptions       | Every unique-key violation is reported as "case number already in use"                                  | Proven           | code                 |
| BUG-41 | Low  | Adoptions       | Manual intake accepts a closing initial status, creating an open "rejected" case                        | Proven           | code                 |
| BUG-42 | Low  | Adoptions       | Matches accept an adopted animal or closed case; unknown ids return 500                                 | Traced           | migration + code     |
| BUG-43 | Low  | Sponsorships    | Domain errors raised in sponsorship RPCs always come back as 500                                        | Proven           | code                 |
| BUG-44 | Low  | Sponsorships UI | Manual animal assignment needs a typed animal UUID; the candidate search is unused                      | Traced           | code                 |
| BUG-45 | Low  | Sponsorships UI | Recording the same payment facts twice reuses the old idempotency key and is dropped                    | Traced           | code                 |
| BUG-46 | Low  | CRM             | Supporter list shows "receipt needed" forever once any receipt was requested                            | Traced           | migration            |
| BUG-47 | Low  | Sponsorships    | Finance POST returns raw Postgres text as 409; reconcile offers payments that cannot link               | Traced           | code                 |
| BUG-48 | Low  | CRM             | Consents: unknown supporter returns 500; a double click appends duplicate rows                          | Traced           | code                 |
| BUG-49 | Low  | Finance         | Issuing an already-issued receipt writes a second `receipt.issue` audit row                             | Traced           | migration            |
| BUG-50 | Low  | Finance         | "Record gift" on a deleted supporter always fails with a 500                                            | Traced           | code                 |
| BUG-51 | Low  | Finance         | Manual-gift bank reference has no length limit (reconcile allows 1–120)                                 | Traced           | code                 |
| BUG-52 | Low  | Finance         | Background CRM exports write 500 rows per 5-minute run, so large jobs take hours                        | Traced           | code                 |
| BUG-53 | Low  | Content         | Publishing a guide under a new topic replaces the live one but leaves it "published"                    | Traced           | migration            |
| BUG-54 | Low  | Animals UI      | Publish blocked by a missing content review tells staff to preview again, forever                       | Traced           | code                 |
| BUG-55 | Low  | Access          | A pending invitee becomes active via disable then reactivate, without accepting                         | Proven           | migration + code     |
| BUG-56 | Low  | Access UI       | Role change and disable have no confirmation; own-row role menu always fails                            | Traced           | code                 |
| BUG-57 | Low  | Auth / session  | A disabled admin who signs in lands on a dead-end error page                                            | Traced           | code                 |
| BUG-58 | Low  | CRM             | Supporter detail audit history silently stops at 1,000 rows                                             | Traced           | code                 |
| BUG-59 | Low  | Volunteers      | Saving a new draft after a lost response returns 500 instead of 409                                     | Proven           | code                 |
| BUG-60 | Low  | Internships     | A page past the end of the internship list returns 500 (BUG-18 missed it)                               | Proven           | code                 |
| BUG-61 | Low  | Internships UI  | A 409/404 on review or settings shows "API request failed" and keeps the stale form                     | Traced           | code                 |
| BUG-62 | Low  | Volunteers      | Overview "Today" list stops at 25 sessions, counting drafts, with no notice                             | Traced           | code                 |
| BUG-63 | Low  | Volunteers      | Notification-job retry is admin-only on one route but open to staff on another                          | Traced           | code + decision      |
| BUG-64 | Low  | Volunteers      | Bulk edit writes two audit rows for one change                                                          | Traced           | migration            |
| BUG-65 | Low  | Volunteers      | Qualifications page loads every volunteer profile (with birth date) on each visit                       | Traced           | migration            |
| BUG-66 | Med  | Content         | Social copy and adopter drafts link to the draft slug (404) and use unreviewed text                     | Proven           | code                 |
| BUG-67 | Med  | Content UI      | Saving one editor panel makes the other unsaved panels fail as a version conflict                       | Traced           | code                 |
| BUG-68 | Low  | Content         | Validation errors lose the field and show English text in both languages                                | Proven           | code                 |
| BUG-69 | Low  | Content UI      | Content error messages give the wrong cause for media and link failures                                 | Proven           | code                 |
| BUG-70 | Low  | Content         | Slugs of 161–180 characters publish but their public story page never loads                             | Proven           | code                 |
| BUG-71 | Low  | Content         | Republishing a story resets its publication date                                                        | Traced           | migration + decision |
| BUG-72 | Med  | Content         | Withdrawn or replaced story images stay in the public bucket                                            | Traced           | migration + code     |
| BUG-73 | Low  | Content         | Content text, SEO and OG fields have no length limit                                                    | Proven           | code                 |

Severity rubric: **Critical** = unauthenticated data access or money loss. **High** =
public data integrity or authorization defect with normal use. **Med** = wrong
business data, audit gap, or a common admin action failing. **Low** = wrong status
code or message, rare edge case, or UX mismatch.

**No Critical findings.** The runtime authorization sweep (below) found no route that
lets an anonymous, invalid-token, non-admin, disabled or pending caller through.

## Authorization sweep (resolves AUDIT R1 and R2)

`sweep/sweep.ts` imports every `src/routes/api/admin/**` route (162 files, 212
route × method pairs) and calls each handler against a fake Supabase that only
answers `auth/v1/user` and the `admin_user` lookup. Any other call made before auth
is recorded.

| Caller                            | Expected | Result                                                                                                                                      |
| --------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| No token                          | 401      | 210/212; two return 400 first (BUG-26)                                                                                                      |
| Invalid token                     | 401      | 210/212; same two                                                                                                                           |
| Signed-in, no `admin_user` row    | 403      | 208/212; BUG-26 pair + animal photo upload returns 401 (BUG-27)                                                                             |
| Disabled admin                    | 403      | same as above                                                                                                                               |
| Pending admin                     | 403      | same, plus `/me` (by design: activates the invite)                                                                                          |
| Database calls before auth        | none     | none                                                                                                                                        |
| Role allow-lists vs `ROLE_ACCESS` | match    | All match the page area. Governance, access and volunteer policy are admin-only; finance writes are treasurer/admin; CRM is treasurer/admin |

---

## Details

### BUG-01 — High — Publishing an animal draft reverts a status set in the coordinator pipeline

- **Where:** `supabase/migrations/20260914164558_editorial_verified_actor.sql:48`
  (`animal_publication_command`, `publish` branch: `status=b->>'status'` from the
  preview body). `update_animal_status_with_audit`
  (`20260913060000_verified_baseline_compatibility.sql:25`) updates only
  `public.animals` and never `animal_draft`. Callers:
  `src/routes/api/admin/adoptions/animals/$id/status.ts`, `src/components/admin/AnimalForm.tsx:178-190`.
- **Repro:** (1) In the coordinator Animals pipeline, set animal X to `adopted` (200,
  audited). (2) Later, staff fix a typo in X's description, then save, preview and publish.
- **Expected:** X stays `adopted`. **Actual:** `animals.status` returns to the draft's
  `available`. The animal reappears in the public adoptable listing, and no audit row
  records a status change (only `animal.publish`). `adoption_eligible` /
  `sponsorship_eligible` are reverted the same way.
- **Fix:** in `update_animal_status_with_audit`, also `jsonb_set` the draft body's
  `status` and bump the draft revision, so any open editor gets a 409 and reloads.
  (Alternative: stop publish from writing `status`. That changes the editor's meaning
  of the status field, so I've ruled it out.)
- **Test:** database test like `changeCaseStatus.database.test.ts`. Plus a
  migration-text test in `supabaseMigrations.test.ts` style, so the unit suite catches it.

### BUG-02 — Med — Same animal finalised as adopted in two cases

- **Where:** `finalize_successful_adoption` (`20260628160000_validate_rpc_actor.sql:86-265`).
  `successful_adoption.animal_id` is indexed but not unique.
- **Repro:** cases A and B each have an approved match for animal X. Finalise A, then B.
- **Expected:** 409 on B. **Actual:** both succeed, giving two `successful_adoption`
  rows for X, double-counted in reports and impact numbers. A rejected or closed case
  can also be finalised and is silently set back to `approved`. Finalise never sets
  `animals.status='adopted'`.
- **Fix:** in the RPC, refuse when another `successful_adoption` exists for the animal
  or when the case is closed (coded exception → 409). Set `animals.status='adopted'`
  in the same transaction.

### BUG-03 — Med — "New supporter" with an existing email overwrites that supporter

- **Where:** `supabase/migrations/20261001213914_r01_crm_atomic_forward.sql:182-196`
  (`mutate_crm_supporter_with_audit`, `create`: `on conflict (email) do update ...
deleted_at = null`, then the roles are replaced). Callers: `src/lib/crm/service.ts:105-120`,
  `src/components/admin/crm/SupporterFormDialog.tsx:138-149`.
- **Repro:** supporter `a@x.com` has donor+volunteer roles, tags and a phone, and may be
  soft-deleted. A treasurer creates a new supporter with `A@x.com` and a name only.
- **Expected:** 409 `supporter_exists` with the existing id. **Actual:** name, phone
  (→ null), language, tags (→ `[]`) and source are overwritten; a deleted supporter is
  restored; every role becomes `["donor"]`; the version check is skipped; the audit
  detail holds only `{email, source}`, so the old values are lost.
- **Fix:** `on conflict (email) do nothing returning *`. When no row comes back, raise
  `supporter_exists` and map it to 409 in `withCrmErrors`. The UI then offers "open
  existing record".

### BUG-04 — Med — Receipt tax year uses the UTC year

- **Where:** `src/lib/donations/reconcile.server.ts:256`
  (`new Date(issuedAt).getFullYear()`; Vercel runs in UTC).
- **Repro:** issue a receipt at 01:30 HKT on 1 Jan 2027 (`now = 2026-12-31T16:30Z`).
- **Expected:** `HKSCDA-2027-…`, `tax_year 2027`. **Actual:** `HKSCDA-2026-000001`,
  `p_tax_year 2026`, on a PDF dated 1/1/2027. The PDF also lands in the 2026 storage
  folder. This happens for anything issued 00:00–07:59 HKT on 1 January.
- **Fix:** compute the year with `Intl.DateTimeFormat(…, {timeZone:"Asia/Hong_Kong"})`.
- **Test:** `issueReceiptIfNeeded` with an injected `now`, asserting `p_tax_year`.

### BUG-05 — Med — Receipt actions ignore the HK$100 eligibility rule

- **Where:** `src/lib/donations/adminPayments.ts:156-167` (`canIssueReceipt`) and
  `:195-200` (`summarizePayments`). Neither uses `isReceiptEligible` (`domain.ts:77`).
  The server enforces the rule and returns 422.
- **Repro:** a HK$50 donation with a receipt requested, or a partial refund that
  takes the amount below HK$100.
- **Expected:** no "Issue receipt" button; not counted as awaiting receipt.
  **Actual:** the button always fails with 422, and the dashboard's "awaiting receipt"
  count stays inflated for good.
- **Fix:** apply `isReceiptEligible({amountCents: amount − refunded, receiptRequested})`
  in both, and add the amount fields to `PAYMENT_SUMMARY_SELECT`.

### BUG-06 — Med — Social-copy PATCH audit is not atomic

- **Where:** `src/lib/content/http.server.ts:432-443` routes PATCH
  `/api/admin/content/social-copy/:id` to `service.updateSocialCopy`
  (`service.ts:673-685`): a plain update, then a separate `audit_log` insert. The atomic
  `updateSocialCopyStatusWithAudit` is unreachable from any route.
- **Repro:** PATCH with `{status:"archived"}` while the audit insert fails → 500, but
  the change is applied and unaudited. This breaks the CLAUDE.md `*_with_audit` rule.
- **Fix:** `update_social_copy_with_audit` RPC covering status, text and hashtags,
  plus an `adminRouteAuditing` guard entry.

### BUG-07 — Med — FAQ deactivation bypasses the required reason

- **Where:** `src/lib/faq/schemas.ts:107-111` (`isActive: z.coerce.boolean()`);
  `upsert_faq_entry_with_audit` writes `is_active` and logs `faq_entry.update`;
  `FaqManagement.tsx:402-404` has an "active" checkbox.
  `requiredReasonActions.ts:83` requires a reason for `faq.deactivate`.
- **Repro:** POST `/api/admin/faq` `{id, …, isActive:false}` → 200, hidden publicly,
  no reason recorded. Separately, `z.coerce.boolean()` turns the string `"false"` into
  `true` (also for `sensitive`).
- **Fix:** use `z.boolean()`. In the service, refuse an active→inactive change through
  upsert for an existing entry (400 "use deactivate"). Hide the checkbox when editing.

### BUG-08 — Med — Published document metadata is mutable

- **Where:** `src/lib/documents/service.ts:93-97, 283-311`. The update schema allows
  `checksumSha256`, `kind` and `language` on a published asset. The only guard covers
  annual reports. The checksum is the sponsorship-terms version used as consent
  evidence (`sponsorship/terms.server.ts:28`).
- **Repro:** PATCH a published `sponsorship_terms` asset with a new checksum: the terms
  version changes with no new PDF. PATCH `kind:"wedding_form"`: no terms are found and
  every `/api/sponsorships/pledges` call returns 503. The admin UI never sends this
  PATCH; any staff token can.
- **Fix:** reject changes to `kind`, `language` and `checksumSha256` while the asset is
  published or referenced by a published slot (`DocumentConflictError` → 409).
  Server-side checksum verification is noted as a follow-up.

### BUG-09 — Med — Coordinator monthly bounds use UTC

- **Where:** `src/lib/adoptions/repository.server.ts:306` (`monthBounds`, `Date.UTC`),
  used at `:2223` and `:2271`. `src/lib/adoptions/schemas.ts:23` accepts `2026-13`.
- **Repro:** a case created at 03:00 HKT on 1 Oct is counted in September. `month=2026-13`
  is silently read as January 2027.
- **Fix:** shift the bounds by −8h (HKT has no DST). Tighten the regex to `0[1-9]|1[0-2]`.

### BUG-10 — Med — Volunteer waitlist refusals return 500

- **Where:** `src/lib/volunteers/http.server.ts:44-80` (`withVolunteerErrors`),
  `src/lib/volunteers/policy/errors.ts:36-45`. The trigger
  `volunteer_enforce_registration_policy` raises `waitlist_priority`,
  `waitlist_disabled`, `waitlist_full` (22023) and `immutable_booking_identity` (42501).
  These are not mapped, although `apiResult.ts` has messages for them.
- **Repro:** approve a waitlisted volunteer when an earlier one is ahead in the queue.
- **Expected:** 409 "an earlier waitlisted volunteer must be handled first".
  **Actual:** 500 "try again later", which invites pointless retries.
- **Fix:** map these codes to 409 (403 for 42501) with the existing messages.

### BUG-11 — Med (Plausible) — Inviting an existing confirmed Auth user returns 500

- **Where:** `src/lib/admin/accessManagement.repository.server.ts:249`
  (`generateLink({type:"invite"})`), `accessManagement.http.server.ts:69-70`.
- **Repro:** invite the email of a volunteer or supporter who has already signed in by
  OTP or magic link, or a disabled former admin. GoTrue rejects invite links for
  confirmed users (`email_exists`). Proven with a fake that throws that error;
  GoTrue's own behaviour was not run.
- **Expected:** the person becomes a pending admin, or at least a clear 409.
  **Actual:** a generic 500. The deliberate "re-invite a disabled admin" path is unreachable.
- **Fix (minimal):** map `email_exists` to 409 `auth_user_exists` with a clear message.
  Full support (magic link for an existing user) is a product decision, see BUG-25.

### BUG-12 — Med — Supporter phone and tags unbounded

- **Where:** `src/lib/crm/schemas.ts:15-20, 37-41, 131-133`. No DB check constraint.
- **Repro:** PATCH with a 100k-character phone and 20,000 tags is accepted, then copied
  into `audit_log.detail` and every export. Tag-bulk caps tags at 40 characters; this
  path does not.
- **Fix:** `phone max(40)`, tag `max(40)` each, `max(50)` tags.

### BUG-13 — Low — CRM/access: wrong status for not-found and bad ids

- `src/lib/crm/http.server.ts:54-76` maps only 42501/P4090: PATCH on an unknown UUID
  (`P4040`) → 500; `22023` → 500.
- `src/lib/admin/accessManagement.http.server.ts:52` `requiredId` doesn't check for a
  UUID: `PATCH /api/admin/access/users/abc` → 22P02 → 500.
- **Fix:** P4040 → 404, 22023 → 400, UUID check → 400.

### BUG-14 — Low — Finance: reconcile id and repeat void

- `src/routes/api/admin/payments/$id/reconcile.ts:37`: non-UUID id → 22P02 → 500.
- `reconcile.server.ts:991`: voiding an already-void receipt (two tabs) raises 22023
  `receipt_not_issued` → 500; the UI row stays stale.
- **Fix:** UUID check → 400; 22023 → 409 (`receipt_supporter_mismatch` → 422).

### BUG-15 — Low — Adoptions: unmapped DB errors

- `src/lib/adoptions/http/shared.server.ts:142`: duplicate `case_number` (23505) on
  finalise → 500 "Could not process coordinator request" (also on a retry after a lost response).
- Internal-profile PUT on an unknown animal (23503) → 500.
- `/api/admin/animals/list`: no error wrapper. `section=applications` throws → generic 500. A search over 200 characters is silently dropped instead of rejected.
- **Fix:** 23505 → 409 with a message, 23503 → 404, wrap the list route (400 for bad section).

### BUG-16 — Low — Documents / annual reports / FAQ: unmapped errors

- `src/lib/documents/service.ts:124-141` throws plain `Error`; `withDocumentErrors`
  (`http.server.ts:71-110`) maps only Zod and Conflict errors. Unknown asset, unuploaded
  PDF, wrong asset kind and unknown annual report → 500. The repository doesn't map
  P0002/23503; deleting an asset referenced by a knowledge post or guide release → 500
  (`countAssetReferences` ignores those tables).
- `src/lib/faq/http.ts:39-48`: unknown id (P0002) → 500. Knowledge and governance map it to 404.
- **Fix:** typed not-found → 404, preconditions → 409/422, include knowledge and guide
  references in the count, FAQ P0002 → 404.

### BUG-17 — Low — Volunteers: input mistakes → 500

- `src/lib/volunteers/schemas.ts:58-73`: no `endsAt ≥ startsAt` check; the DB check
  (23514) → 500.
- `src/lib/volunteers/policy/qualifications.server.ts:66-72`: future "joined on",
  `valid_until ≤ valid_from` (22023/23514) → 500 "refresh and retry".
- `src/routes/api/admin/volunteers/group-enquiries.ts:59-75`, `groupEnquiries/schemas.ts:96`:
  `?id=abc` → 22P02 → 500; a PATCH with no fields → 22023 → 500.
- **Fix:** zod refinements (time order, valid range, UUID, at least one patch field);
  map 22023/23514 → 422 and 22P02 → 400.

### BUG-18 — Low — Large or out-of-range page numbers → 500

- CRM (_Proven_): `src/lib/crm/schemas.ts:33` has no max; `page=50000000` overflows int4
  `p_offset` → 500.
- Payments, volunteers, group enquiries (_Plausible_: PostgREST answers PGRST103/416
  when the offset is past the total): `adminPayments.server.ts` `selectPaymentRows`,
  `volunteers/schemas.ts:31`, `groupEnquiries/schemas.ts:83`. Payments can hit this
  briefly after reconciling the last rows on the final page of a filtered list.
- **Fix:** cap page at 100,000; treat PGRST103 as an empty page with the real total.

### BUG-19 — Low — Payments CSV export unaudited and uncapped

- `src/routes/api/admin/exports/payments[.]csv.ts` streams every payment with supporter
  name and email: no `export.payments` audit row (donations and supporters exports
  write one), no 5,000-row cap, no `cache-control: no-store`.
- **Fix:** match the donations/supporters exports.

### BUG-20 — Low — Regenerated export double-audited

- `src/lib/adoptions/service.ts:463-495`: `regenerateCoordinatorExport` calls
  `exportCoordinatorCsv` (audits `coordinator_export.<kind>`) and then audits
  `coordinator_export.regenerate`. Both count in `exportsRun`.
- **Fix:** build the CSV through an internal helper that doesn't audit.

### BUG-21 — Low — Coordinator exports truncate at 1,000 rows

- `src/lib/adoptions/service.ts:184`, `repository.server.ts:1946` (`.range(0,999)`;
  PostgREST `max_rows=1000`). The CSV silently holds only the newest 1,000 rows and the
  audit says `rowCount: 1000`.
- **Fix:** page through all rows, as `readPledgeSearchIds` does.

### BUG-22 — Low — Animal draft save/restore audit and fence

- `20260914164558_editorial_verified_actor.sql:39-47`: `save` (which can create an
  `animals` row) and `copy` (restore a version) write no `audit_log`; service-role
  writes skip the trigger. `copy` has no `expected_revision` check, so it can overwrite
  another editor's newer draft. `AnimalForm.tsx:204`: the restore button isn't disabled
  while its request is pending.
- **Fix:** audit rows inside the RPC; require `expected_revision` for `copy`; disable the button.
- **Fixed** by `20261029190000_audit_and_fence_animal_draft_restore.sql` (approved): `save`
  writes `animal.draft.save` and `copy` writes `animal.draft.copy`, each in the same
  transaction; `copy` requires a non-negative integer `expected_revision` (422 otherwise)
  and answers a stale one with conflict (409). The route enforces the same revision rule
  before calling the RPC, and the form sends it and disables the restore buttons while
  one is pending. Verified on Postgres 16.

### BUG-23 — Low — Manual gift inline supporter overwrites an existing one

- `record_manual_gift_with_audit` (`20260905155357_crm_manual_gift_delivery_jobs.sql:67-69`)
  upserts the supporter by email: tags wiped, phone nulled, name replaced, with no
  `supporter.update` audit. API only; the dialog always sends `supporterId`.
- **Fix:** reuse the existing row unchanged on an email conflict.
- **Fixed** by `20261029200000_manual_gift_reuses_existing_supporter.sql` (approved, after
  PR #226 merged): on an email conflict the existing, non-deleted supporter is locked and
  used unchanged, and the donation's contact snapshot comes from that record. A
  soft-deleted supporter is still refused (`manual_gift_supporter_unavailable`). The
  `donation.manual_create` audit detail records the supporter id and whether it was
  reused. Verified on Postgres 16: the original function renamed the supporter, nulled
  its phone and emptied its tags; the new one leaves them as they were.

### BUG-24 — Low — Edit dialog always un-deletes

- `src/components/admin/crm/SupporterFormDialog.tsx:162` always sends `deleted:false`.
  Saving an edit on a soft-deleted supporter restores them, audited only as `supporter.update`.
- **Fix:** send `deleted` only when the user changes it.

### BUG-25 — Low — Invite link lands nowhere useful

- `accessManagement.repository.server.ts:249/269`: `generateLink` has no `redirectTo`.
  The admin login is password-only, and `reset-password.tsx:52` handles only
  `PASSWORD_RECOVERY`. Invitees land on the Supabase Site URL with no password and must
  use "forgot password".
- **Fix (needs decision):** `redirectTo` a set-password page that accepts the invite session.

### BUG-26 — Low — Body parsed before auth

- `src/routes/api/admin/animals/$id/archive.ts:22-36` and
  `src/routes/api/admin/sponsorships/pledges/$id/finance.ts:31-42` read and validate the
  JSON body (up to 8 MB) before `requireAdmin`. Anonymous callers get 400 instead of
  401, learn the expected shape, and make the server parse up to 8 MB. No data access.
- **Fix:** call `requireAdmin` first.

### BUG-27 — Low — Photo-upload URL maps every auth failure to 401

- `src/lib/animals/photoUpload.http.server.ts:43-50` catches _any_ error from
  `requireAnimalAdmin` and returns 401. A wrong role should be 403, and a database
  outage should be 500, not "sign in again".
- The runtime sweep shows `animals/draft-photo-upload-url` has the same mapping.
- **Fix:** rethrow `Response` as-is (keep 401/403 opaque); let other errors → 500.

### BUG-28 — Low — Admin UI shows unusable actions / stale rows

- `PaymentsReconcile.tsx:431`: staff see "Export CSV", which always 403s.
- `taskOverview.server.ts:50`: staff get a `sponsorship_proof_pending` card they cannot
  act on (review is treasurer/admin; the drawer hides the controls).
- `ReconcileDialog` / `issueReceipt` don't refresh after a 409/422, so a payment someone
  else already reconciled keeps its button until reload.
- **Fix:** gate on role; call the refresh callback on 409.

### BUG-29 — Low — Wrong message for an unbound legacy draft publish

- `src/lib/volunteers/repository.server.ts:249-268` (`requireUpdated`) turns
  `{kind:"invalid", reason:"target_date_preview_required"}` into 409 "data was
  updated". **Fix:** pass `reason` through to `volunteerCodeMessage`.

### BUG-30 — Med — In-range security patches available

- `seroval@1.6.8` (TanStack Router SSR serialiser; GHSA-f86p-h4j2-7qgj and
  GHSA-9wx9-5pv9-3349, script/code injection in serialised output, fixed in 1.6.11) and
  `vite@7.3.2` (fixed ≤7.3.6), plus build tooling (`postcss`, `nanoid`, `js-yaml`,
  `brace-expansion`, `esbuild`, `launch-editor`).
- **Fix:** lockfile-only bumps within existing ranges (`bun update` on those packages),
  then re-run all gates. **`zod` 3 → 4 (GHSA-mrhx-c7xc-m3w5)** was deferred pending
  approval; it is fixed by the dedicated upgrade on 2026-11-10 (direct dependency zod
  4.6.6; see the [dependency upgrade](FIX_REPORT.md#dependency-upgrade--zod-4-2026-11-10)).
  Exposure was limited because admin bodies are capped at 8 MB and public bodies at 1 MB.

### BUG-31 — Med — Revoked or expired server session strands the admin

- **Where:** `src/lib/admin/session.ts` `requireSignedInAdminIdentity` redirects to login
  only when the browser has _no_ session. When the browser still holds a token the server
  rejects (token revoked, password changed, signed out elsewhere, or a tampered token),
  `ensureQueryData(adminIdentityQueryOptions())` throws `AdminHttpError` 401 from
  `/api/admin/me`. Nothing handles it, so the route renders the generic "無法載入 / 重試" screen.
- **Repro (E2E `tests/e2e/admin/admin.e2e.ts`):** sign in, revoke the session on the
  auth server, reload `/admin`. **Expected:** the stored session is cleared and the user
  lands on `/admin/login?redirect=…`. **Actual:** a full-page error with only a retry
  button that fails again. There is no logout button, so the only way out is clearing
  site data.
- **Fix:** in `requireSignedInAdminIdentity`, on a 401 (`AdminHttpError`/`AdminSessionError`),
  sign out locally, clear the identity query and redirect to login.

### BUG-32 — Low — Offline navigation shows a misleading empty state

- **Where:** `src/queryClient.ts` (React Query's default `networkMode: "online"` pauses
  queries while offline) and the animal list, which keeps the previous result as placeholder data.
- **Repro (E2E):** sign in, go offline, open the "狗狗" tab. **Expected:** an
  offline/failed-load notice with retry. **Actual:** "此分類尚未有動物記錄。" (no records
  in this category). The request never runs, and staff are told the category is empty.
- **Fix:** when a list query's `fetchStatus` is `paused` with no data for the current
  key, render the shared `LoadFailure` (or an offline notice) instead of the placeholder.

## Second pass (BUG-33–BUG-65)

Found on 2026-10-30, after PR #226 and #227 merged, by reviewing each admin area again
(finance, CRM and sponsorships, adoptions and coordinator, animals and content,
volunteers and internships, access and cross-cutting). Each finding was traced from a
real route and input to the wrong result; the ones marked Proven were reproduced with
the real service or handler and a fake client. One reported finding was dropped after
checking: treasurers can claim sponsorship deliveries (`20260913080152` allows them).
Status: all fixed; see [`FIX_REPORT.md`](FIX_REPORT.md#second-pass-2026-10-30) for each fix, its migration and the deploy order.

### BUG-33 — Med — Returned animal can never be adopted again (regression from BUG-02)

- **Where:** `20261029160000_finalize_adoption_once_per_animal.sql` refuses when any
  `successful_adoption` row exists for the animal. No path ends or voids such a row, and
  `update_animal_status_with_audit` lets staff set an adopted animal back to available.
- **Repro:** finalise animal X on case A. X is returned and set to available, matched and
  approved on case B. Finalise B → 409 "Animal already has a successful adoption", for good.
- **Expected:** only a current adoption blocks finalising. **Actual:** any past one does.
- **Fix:** refuse only while the animal is `adopted` (checked under the existing lock), or
  record returns on `successful_adoption`. Needs a migration and a decision on how a
  return is recorded.

### BUG-34 — Med — Finalised or closed case can be reopened without a check

- **Where:** `change_adoption_case_status` (`20260926130000`): any active status is
  accepted, and a non-closing one sets `closed_at = null`. `CaseDetail.tsx` always shows
  the status control.
- **Repro:** finalise case A, then POST `/api/admin/adoptions/cases/A/status` with a
  screening status → 200, no reason. A is open again while its `successful_adoption`
  still counts; a later move to rejected leaves a "rejected" case with an adoption.
- **Fix:** refuse (409) when the case has a `successful_adoption`; require a reason to
  reopen a closed case. Needs a migration.

### BUG-35 — Med — Cancelled follow-ups stay open; reopened ones stay done

- **Where:** `src/lib/adoptions/tasks.ts` (`validateTaskCompletion` needs no date for
  cancelled), `taskPanelLogic.ts` (sends the form's `completedAt` as is), and every
  open-task read (`completed_at is null`: task list, overdue card, monthly report,
  adopter open tasks).
- **Repro (proven at service level):** set an overdue task to 已取消 with an outcome →
  200; `completed_at` stays null, so it stays on the overdue card and report for good.
  Moving a completed task back to 待處理 keeps its old `completedAt`, so it stays "done".
- **Fix:** derive `completed_at` from the status in the service: set it for a closing
  status, clear it for an open one. Code; existing cancelled rows need a data fix.

### BUG-36 — Med — Intake inbox never empties

- **Where:** `adoption_intake_item.resolved_at` is read by the inbox's default "open only"
  filter (`repository.server.ts`) but nothing in `src/` or any migration ever sets it.
- **Repro:** every submitted application stays in the open inbox after its case is
  closed or finalised, oldest first, so new ones sink below handled ones.
- **Fix:** set `resolved_at` when a case closes or is finalised (in those RPCs), or add an
  audited resolve action. Needs a migration (or code for the resolve action).

### BUG-37 — Med — Staff can read the whole supporter directory via intake search

- **Where:** `/api/admin/adoptions/intake/identity-search` → `search_manual_case_identity`
  (`20261002045253`): `q` is optional and an empty value matches every supporter.
- **Repro:** a staff token calls `GET …/identity-search?page=N` with no `q` → 25
  supporters a page with name, email and phone (donors and volunteers too). Staff have
  no `supporters` area in `ROLE_ACCESS`. Separate from AUD-02 (RLS).
- **Fix:** require a minimum query (or an exact email or phone), mask contact details of
  non-adopters, cap pages. Needs a migration.

### BUG-38 — Med — Payment-method publish allows the editor to publish

- **Where:** `publish_payment_public_config` (`20260831120000`) only refuses when the
  publisher is `submitted_by`; `canPublish` in `paymentMethodsLogic.ts` mirrors it.
- **Repro:** treasurer A edits the FPS details donors pay into; a staff user submits;
  A publishes → accepted. The plan (`docs/superpowers/plans/2026-08-31-payment-public-config.md`)
  says the treasurer who prepared a change cannot publish it.
- **Fix:** record who edited since the last publish and refuse publish by any of them;
  hide Publish to match. Needs a migration.

### BUG-39 — Med — Two content audit actions log the wrong actor id

- **Where:** `set_content_publication_metadata` (`20260927122000`) and
  `retry_failed_media_repair` (`20260927140500`) insert `actor.id` (the `admin_user` row
  id) as `audit_log.actor_user_id`; every other content audit uses the auth user id.
- **Effect:** changing content class (verified/demo, which controls public visibility),
  effective dates and media-repair retries are logged under an id that matches no user,
  so actor filters and joins miss them.
- **Fix:** write `p_actor_user_id`; repair existing rows by joining `admin_user`; add a
  migration test that no audit insert uses `actor.id`. Needs a migration.

### BUG-40 — Low — Every 23505 says "case number already in use"

- **Where:** `src/lib/adoptions/http/shared.server.ts` maps all 23505 to that message.
- **Repro:** a duplicate status key, or manual intake with an email that belongs to an
  existing supporter → 409 "This case number is already in use".
- **Fix:** branch on the constraint name. Code.

### BUG-41 — Low — Manual intake accepts a closing initial status

- **Where:** `createManualCase` (service) checks category and active only; the intake form
  offers every status; the RPC sets no `closed_at`.
- **Repro:** POST `/api/admin/adoptions/intake/cases` with `initialStatusId` = rejected →
  201; the case shows 已拒絕 but counts as open, with no reason recorded.
- **Fix:** refuse closing statuses at intake (400). Code.

### BUG-42 — Low — Match creation checks and unknown ids

- **Where:** `animal_match` create branch (`20261010130500`) does not check the animal's
  status, the case's state, or duplicates; `withErrors` does not map 23503 or 23514.
- **Repro:** a stale match-options list lets staff match an animal adopted elsewhere, or a
  finalised case → 201. A match or follow-up on an unknown case id → 500.
- **Fix:** refuse in the RPC (409) — migration; map 23503 → 404 and 23514 → 400 — code.

### BUG-43 — Low — Sponsorship RPC errors always become 500

- **Where:** `src/lib/sponsorshipAdmin/http.server.ts` `withErrors` maps domain messages only
  for `Error` instances; supabase-js returns RPC errors as plain objects.
- **Repro (proven with the real repository and a fake client):** assigning an ineligible or
  unknown animal, an animal with an open assignment (23505), a payment beyond 24 future
  months, or a racing cancel → 500 "Could not process sponsorship review request".
- **Fix:** apply the domain mapping to any object with a string `message`; map 23505 → 409. Code.

### BUG-44 — Low — Manual animal assignment needs a typed UUID

- **Where:** `PledgeDetailDrawer.tsx` free-text "Animal UUID" input; `/api/admin/sponsorships/animals`
  (candidate search) has no caller.
- **Effect:** every treasurer-approved pledge needs a pasted UUID; a wrong one hits BUG-43.
- **Fix:** a searchable picker backed by the candidates route. Code.

### BUG-45 — Low — A second identical payment is silently dropped

- **Where:** `PledgeDetailDrawer.tsx`: `paymentRetry` is not cleared after a successful submit.
- **Repro:** record FPS HK$300 on a date; the supporter pays the same again; staff enter the
  same facts → the old idempotency key is reused, the RPC replays the first proof, the UI
  shows success, and no second proof or ledger row exists.
- **Fix:** clear `paymentRetry` after success (as `ManualDonationDialog` does). Code.

### BUG-46 — Low — "Receipt needed" never clears in the supporter list

- **Where:** `private.crm_supporter_summary` (`20260913081521`): `receiptNeeded` is
  `bool_or(receipt_requested)` over all donations; the `receiptNeeded` filter matches.
- **Effect:** after a receipt is issued, or the donation fails or is refunded, the list and
  CSV still say 需要檢查 / needs review.
- **Fix:** count only succeeded, retained, receipt-requested donations with no issued
  receipt (the BUG-05 rule). Needs a migration.

### BUG-47 — Low — Sponsorship finance errors and reconcile candidates

- **Where:** `src/lib/sponsorshipAdmin/finance.server.ts` returns `{ error: error.message }`
  with 409 for every non-42501 error; its candidate list includes payments already linked
  to other proofs; GET for an unknown pledge uses `.single()` → 500.
- **Repro:** pick an already-linked payment in "Existing payment" → 409 'duplicate key
  value violates unique constraint "sponsorship_payment_source_payment_id_key"'.
- **Fix:** exclude linked payments, map known errors to copy, 500 for unknown, 404 for a
  missing pledge. Code.

### BUG-48 — Low — Consents: 500 for unknown supporter, duplicates on double click

- **Where:** `append_crm_consents_with_audit` (`20261001213914`) raises `supporter_not_found`
  with no errcode, which `withCrmErrors` does not map; `ConsentEditor.tsx` re-enables the
  button before the refetch lands.
- **Fix:** map the message to 404 in code (or add errcode P4040 in a migration); keep the
  button disabled until the refetch settles. Code.

### BUG-49 — Low — Duplicate `receipt.issue` audit row

- **Where:** `issue_receipt_with_audit` (`20261002170945`) checks only for an audit row by the
  same actor before inserting one.
- **Repro:** two treasurers issue the same receipt, or the delivery job issued it first →
  a second `receipt.issue` row under someone who did not issue it.
- **Fix:** write the audit row only when the receipt did not already exist. Needs a migration.

### BUG-50 — Low — "Record gift" on a deleted supporter returns 500

- **Where:** `SupporterDetail.tsx` shows the dialog for deleted supporters;
  `manualGiftDelivery.http.server.ts` maps only 42501, so `manual_gift_supporter_unavailable`
  (22023) becomes a generic 500 and is not logged.
- **Fix:** hide the action for deleted supporters; map the error to 409 and
  `invalid_manual_gift` to 400; log unmapped errors. Code.

### BUG-51 — Low — Manual-gift bank reference is unbounded

- **Where:** `src/lib/crm/schemas.ts` `bankReference: optionalTrimmed` (no max) vs 1–120 in
  reconcile and the bank-statement matcher.
- **Effect:** long references are stored and can never be matched; ~2.7 KB exceeds the
  unique index row size and returns 500.
- **Fix:** `.max(120)` and `maxLength` on the input. Code.

### BUG-52 — Low — Background CRM exports are very slow

- **Where:** `src/lib/crm/exportJobs.server.ts` writes one 500-row page per run; the cron runs
  every 5 minutes, one job at a time; jobs expire after 24 hours.
- **Effect:** a 20,000-row export takes about 200 minutes, and queued jobs can expire unfinished.
- **Fix:** loop pages and jobs within a time budget per run. Code.

### BUG-53 — Low — Guide publish under a new topic leaves the old release "published"

- **Where:** `publish_adoption_guide_release` (`20260731120000`) finds the previous release by
  `(topic, species)` but the public slot is per species.
- **Repro:** cat guide A is live; publish cat guide B with another topic → the cat slot and
  knowledge post switch to B, but A stays `published` with no way out.
- **Fix:** find the previous release by species, or allow one published release per species
  (409). Needs a migration.

### BUG-54 — Low — Missing content review looks like a stale draft

- **Where:** the animal publication route answers 422 `invalid_draft` when the revision has no
  approved review; `AnimalForm.tsx` shows "draft changed, preview again" for 422.
- **Repro:** after a pipeline status change (BUG-01 bumps the draft revision), publishing a
  live animal asks staff to preview again, which can never succeed until the new revision
  is reviewed.
- **Fix:** a distinct `review_required` code and message pointing to content review. Code.

### BUG-55 — Low — Pending invitee activated without accepting

- **Where:** `assertPatchStatusTransition` and `update_admin_user_with_audit`
  (`20261002111418`) block pending → active but allow pending → disabled → active.
- **Repro (proven at service level):** invite B; disable B; reactivate B → active with
  `invite_accepted_at` null and no acceptance audit row.
- **Fix:** refuse disabled → active when the invite was never accepted (point to re-invite);
  show Re-invite instead of Reactivate. Migration plus code.

### BUG-56 — Low — Access page actions lack confirmation

- **Where:** `AccessManagement.tsx`: role change and Disable fire at once (CLAUDE.md requires
  `ConfirmActionDialog` for destructive actions); the role menu on your own row is enabled
  but always returns 422 `self_demote`; an error banner is cleared only by a successful invite.
- **Fix:** confirm demote and disable, disable the own-row menu, clear errors on success. Code.

### BUG-57 — Low — Disabled admin sign-in dead end

- **Where:** `src/lib/admin/signInFlow.ts` (`completeSignIn` swallows the `/me` failure and
  navigates); `isLapsedSessionError` handles only 401 (BUG-31).
- **Repro:** a disabled admin signs in with the right password → `/me` 403 → `/admin` shows a
  LoadFailure whose retry always fails, with no sign-out button.
- **Fix:** on 403 from `/me`, sign out locally and show "no admin access" on the login form. Code.

### BUG-58 — Low — Supporter audit history stops at 1,000 rows

- **Where:** `src/lib/crm/repository.server.ts` reads `audit_log` (and donations, payments) for
  a supporter detail with no paging.
- **Effect:** for a long-running supporter the oldest history is dropped silently.
- **Fix:** page with `.range()` as `readCountedRange` does, or cap and return `truncated`. Code.

### BUG-59 — Low — Volunteer draft retry conflict returns 500

- **Where:** `src/lib/volunteers/repository.server.ts` throws a plain Error on
  `{kind:"conflict", reason:"idempotency_payload_changed"}`; `withVolunteerErrors` maps it to 500.
- **Repro (proven):** save a new draft, lose the response, edit and save again with the same
  key → 500 although the first draft exists.
- **Fix:** answer 409 with that code; the form rotates its key on 409. Code.

### BUG-60 — Low — Internship list past the end returns 500

- **Where:** `src/lib/internships/repository.server.ts` `range()` without the
  `isRangeNotSatisfiable` handling added for BUG-18.
- **Repro (proven against a fake client):** approve the only row on page 2 of a filter; the
  refetch of page 2 → 500, and retry repeats it.
- **Fix:** reuse `isRangeNotSatisfiable`. Code.

### BUG-61 — Low — Internship 409/404 shows "API request failed"

- **Where:** internship error bodies carry `kind`/`reason` but no `error`, so `fetchAdminJson`
  falls back to "API request failed"; the detail and settings queries are refetched only on
  success.
- **Effect:** after another reviewer's change every resubmit 409s with an English message.
- **Fix:** return an `error` message (or map `kind` on the client) and refetch on 409/404. Code.

### BUG-62 — Low — Overview "Today" list caps at 25 sessions

- **Where:** `src/lib/volunteers/policy/calendar.server.ts` lists any status, first 25, and
  never sets `truncated`; the page then keeps only published ones.
- **Effect:** on busy days published sessions are missing and the "partial list" notice never shows.
- **Fix:** filter to published and return `truncated` (or page). Code.

### BUG-63 — Low — Notification retry role differs by route

- **Where:** `/api/admin/volunteers/jobs/{id}/retry` is admin-only; the tasks route's `retry`
  allows staff, and staff see the button.
- **Fix:** decide the intended role, then align both routes and the button. Code (plus a
  decision).

### BUG-64 — Low — Bulk edit double audit

- **Where:** `volunteer_bulk_item` (`20260914160736`) edit branch calls
  `update_volunteer_activity_with_audit` (which writes `volunteer_activity.update`) and then
  writes `volunteer_bulk.edit` for the same change.
- **Fix:** use the un-audited path in the bulk branch, or skip one row. Needs a migration.

### BUG-65 — Low — Qualifications page loads all volunteer profiles

- **Where:** `volunteer_profile_command` `list` (`20260913075040`) returns every
  `volunteer_profile` (incl. birth date) and every credential with evidence, unbounded;
  `VolunteerQualifications.tsx` calls it on load.
- **Fix:** use the paginated directory search and load credentials for the selected profile.
  Needs a migration if `list` is narrowed.

## Content creation pass (BUG-66–BUG-73)

Found on 2026-11-05 by a focused review of content creation in the admin CMS: create,
edit, revisions, SEO/OG fields, media and links, review and publish, including the CMS
change in #230 (folded SEO/OG panel, lifecycle and version labels). Each finding was traced
from a real admin action or route to the wrong result; the ones marked Proven were
reproduced with the real code and fakes. All are fixed (see
[`FIX_REPORT.md`](FIX_REPORT.md#content-creation-pass-2026-11-05)): BUG-66–70 and BUG-73 in code,
BUG-71 and BUG-72 with approved migrations.

### BUG-66 — Med — Social copy and adopter drafts link to the draft slug and use unreviewed text

- **Where:** `src/lib/content/service.ts` `publicStoryUrl(…, content.slug)` in
  `draftAdopterNotifications` and `generateSocialCopy`. `content` is the live draft row;
  the public page matches `content_item.published_slug`, which nothing in `src` reads.
- **Repro (proven with a fake repository):** publish `lucky-rescue`, save the draft slug as
  `lucky-rescue-2026`, generate social copy → "詳情：…/stories/lucky-rescue-2026" (404), with
  the unreviewed draft title and summary. Same for a never-published draft, and for adopter
  notification drafts created with a story update.
- **Fix (code):** build links from `published_slug` and text from the published snapshot;
  refuse (409) while nothing is published.

### BUG-67 — Med — Saving one editor panel makes the other unsaved panels fail as a conflict

- **Where:** `src/components/admin/content/ContentEditor.tsx` (`dirtyVersions`,
  `expectedFor`, `reportDirty`): each dirty panel keeps the version it started from, and a
  successful save by another panel does not move it forward.
- **Repro:** at version 5, type in Basic content; save Publication eligibility (→ 6); save
  Basic content → it sends expectedVersion 5 → 409 "Stale content version". The conflict
  banner appears, Publish and Restore are disabled, and only "Reload latest version" (which
  discards the typed work) gets out. Any pair of panels behaves the same.
- **Fix (code):** after this editor's own successful save, move other dirty panels whose base
  equals the version just sent to the new version; a change by someone else still conflicts.

### BUG-68 — Low — Content validation errors lose the field and the language

- **Where:** `src/lib/content/http.server.ts` sends `{error: "<string>", details: {fields}}`;
  `structuredAdminApiError` (`src/lib/admin/session.ts`) reads fields only when `error` is an
  object, so `ContentCreateForm` and the editor show "Invalid content management request" in
  English in both languages, naming no field (proven with the real handler).
- **Repro:** create with CTA URL `www.hkscda.org`, or save a slug `Lucky Story` or a title over
  180 characters.
- **Fix (code):** send `{error: {code: "invalid", message, fields}}` for validation errors;
  add the slug pattern and title max length to the editor inputs.

### BUG-69 — Low — Content error messages give the wrong cause for media and link failures

- **Where:** `src/components/admin/content/contentErrors.ts` (from #230) maps every error to
  four generic texts; the server collapses SQL reasons into conflict/not_found/invalid.
- **Repro (proven for the text):** a cover photo on an internal update (refused at finalize),
  or an expired upload session, shows "check required fields and the URL slug"; adding a link
  that already exists (23505) shows the stale-version conflict banner and "reload, then save
  again", which repeats the 409. An expired session is also reused on retry until the file is
  picked again.
- **Fix (code):** pass safe reason codes (e.g. `media_cover_internal`, `session_expired`,
  `link_exists`) and map them; disable "Set as cover" for internal updates; do not treat a
  duplicate link as a version conflict.

### BUG-70 — Low — Slugs of 161–180 characters publish but their story page never loads

- **Where:** `src/lib/content/schemas.ts` and `suggestSlug` allow 180 characters;
  `src/lib/content/publicStory.functions.ts` (`getPublicStory`, `getRelatedStories`) reject
  over 160.
- **Repro:** a long English title auto-suggests a 175-character slug; create, review and
  publish succeed; `/stories/<slug>` shows "暫時未能載入故事詳情" with HTTP 200 for good, while the
  sitemap and story wall link to it.
- **Fix (code):** one shared slug length limit at every layer.

### BUG-71 — Low — Republishing a story resets its publication date

- **Where:** `publish_content_revision` (`20260905150012`) always sets `published_at = now()`
  (the older service path only set it when null).
- **Effect:** fixing a typo moves a March story to the top of /stories as November, and the
  public date and `article:published_time` change; the original date is lost.
- **Fix (migration):** keep the first publication date (`coalesce(item.published_at, …)`);
  optionally add a separate "last updated" date. Needs confirmation of the intended behaviour.

### BUG-72 — Med — Withdrawn story images stay public

- **Where:** published images are copied to the public `content-media` bucket at
  `published/<revision>/<media>.<ext>` (`prepare_content_public_assets`, `20260926190000`);
  nothing removes them on archive or when a newer revision is published.
- **Effect:** a photo removed from a story (for example one showing an adopter's home), or a
  whole archived story's images, stay reachable at their old URLs.
- **Fix:** a cleanup step that deletes public copies no longer used by the current published
  revision of a published item, run on archive and after publish; recording it needs a
  migration.

### BUG-73 — Low — Content text, SEO and OG fields have no length limit

- **Where:** `src/lib/content/schemas.ts`: `subtitle`, `body`, `ctaLabel`, `seoTitle`,
  `seoDescription`, `ogTitle`, `ogDescription` have no `.max` (only the 8 MB body cap).
- **Effect:** every save copies the whole row into two revision snapshots; long SEO/OG titles
  go straight into the public `<title>` and `og:*` tags (escaped, so not XSS). Same class as
  BUG-12.
- **Fix (code):** add limits (e.g. seoTitle 120, seoDescription 320, ogTitle 180,
  ogDescription 320, subtitle 180, ctaLabel 60, body ~50,000) and matching `maxLength`.

## Admin auth & operations audit (2026-11-09)

A read-only audit of the admin auth/session and operations surfaces
([`audit-20261109/`](../audit-20261109/findings-auth.md)) found five new admin-panel defects.
Three of them change the database layer; their fixes are migrations. The IDs below keep the
audit's AUTH-/OPS- prefixes so the existing BUG-01…BUG-73 numbering is unchanged.

### AUTH-01 — Med — Staff and treasurers can read the whole audit trail over PostgREST

- **Where:** `staff can read audit log` (`20260623160506:351-354`) plus the blanket
  `grant select, insert, update, delete on all tables in schema public to authenticated`
  (`:262`). Every active staff, treasurer and admin JWT could therefore read every `audit_log`
  row directly from `/rest/v1/audit_log`, although the access API that owns the `admin_user.*`
  events (invited emails, role/status transitions) is admin-only.
- **Repro:** sign in as staff, copy the access token from the `sb-<ref>-auth-token` local-storage
  entry, `GET /rest/v1/audit_log?select=action,detail` with that JWT → admin-invite emails, role
  and status transitions, and treasurer/admin finance events come back.
- **Fix (migration):** `20261109100000_revoke_audit_log_browser_read.sql` revokes `select` on
  `public.audit_log` from `anon, authenticated` and drops the three-role policy, so a direct
  select fails with permission denied instead of returning rows. Audit history reaches the UI
  only through the service-role API handlers (access history, finance activity, supporter
  timeline, coordinator workspace); `service_role` keeps its grant and bypasses RLS. No admin
  browser module reads the table (`adminBrowserDataGuard.test.ts`).

### OPS-01 — Med — The legacy "Publish" toggle resurrects a cancelled or closed activity

- **Where:** `src/components/admin/volunteers/VolunteerManagement.tsx:377-388` toggles any
  activity to `published`; the wrapper `update_volunteer_activity_with_audit`
  (`20260914160736:240-247`) only refused an unbound legacy draft, and the base update
  (`20260913062837:501`) has no status machine at all.
- **Repro:** staff → `/admin/volunteers` → status filter "all" → a `cancelled` or `closed`
  activity with a future `starts_at` → **Publish** → 200 `{"ok":true}`; the session is listed
  publicly again while its registrations stay cancelled/closed, and no cancellation-specific
  audit or reason exists.
- **Fix (migration):** `20261109101000_volunteer_activity_publish_respects_terminal_state.sql`
  redefines the wrapper: publishing while the stored status is `cancelled` or `closed` returns
  `{"kind":"invalid","reason":"activity_closed"}` (the code the rebind command already uses)
  instead of delegating to the base update. The advisory lock, actor check, BUG-29
  unbound-draft refusal, delegation, pinned `search_path` and service-role-only grants are
  unchanged. The companion admin-code change stops offering the toggle on terminal rows.

### OPS-02 — Med — A system status's semantic flags can be edited, breaking the adoption lifecycle

- **Where:** `assertCanMutateStatus` (`src/lib/adoptions/status.ts:21-33`) and
  `mutate_adoption_coordinator_with_audit` (`20261030103000:96-113`) guard only delete, key and
  category of an `is_system` status; `is_active`, `is_closing` and `is_final` stay editable.
  `createMatch`/`finalizeAdoption` read the system `approved` match status, task completion
  reads `completed`, and case closing derives `closed_at`/reason from the target status's
  `is_closing`.
- **Repro:** admin → `/admin/coordinator/statuses` → edit the system status `approved` (match) →
  turn **Active** off → Save → 200; every coordinator's **Finalise** now fails with
  `Inactive match status`, and nothing points at the status catalogue.
- **Fix (migration):** `20261109102000_adoption_system_status_flags_immutable.sql` redefines
  the RPC (copying the latest body from `20261030103000`) with one guard after the identity
  guard: for a system status, changing any of the three flags raises `23514`
  `System status flags cannot be changed`. Labels, colour and sort order stay editable; every
  other branch, `search_path = ''` and the grants are unchanged. The companion admin-code change
  disables the switches for system rows.

## Admin auth backlog — second batch (2026-11-09)

The audit's accepted Lows (AUTH-02…AUTH-05) plus the inherited AUD-02 RLS gap. The IDs keep the
audit's prefixes so BUG-01…BUG-73 keep their numbers. Four fixes are code/test-only; AUD-02 is a
migration.

### AUTH-02 — Low — An admin disabled or demoted mid-session reloads into a dead-end load failure

- **Where:** `requireSignedInAdminIdentity` (`src/lib/admin/session.ts`) only treated a 401 as a
  lapsed session, so a 403 from the identity fetch (`/api/admin/me`) fell through as a generic
  load failure. `docs/BUGS.md` BUG-31 fixed the 401 case and BUG-57 the sign-in 403; neither
  covered an admin disabled while already signed in.
- **Effect:** after an admin is disabled, has its row removed, or is demoted mid-session, a reload
  of `/admin` renders the load-failure screen whose retry always fails — no message, no sign-out —
  and the identity cache keeps answering with the old role for up to 60 s.
- **Fix (code):** a 403 from the identity fetch now takes the lapsed-session path: cached identity
  removed, `supabase.auth.signOut({scope:"local"})`, and a redirect to
  `/admin/login?reason=no_admin_access`, where the sign-in page shows the existing bilingual
  `login.noAdminAccess` refusal copy. Ordinary mutation 403s keep their `forbidden` class in
  `failureClass`, so one forbidden-area call does not sign anyone out.
- **Tests:** `src/lib/admin/session.test.ts` (401 without the reason vs 403 with it, identity
  cleared, local sign-out), `src/components/admin/useSessionExpiryRedirect.test.ts` (a 403
  mutation is not a lapse), `src/routes/admin/login.test.tsx` and `-authPagesEnglish.test.tsx`
  (zh-HK and English notices).

### AUTH-03 — Low — Invite/resend commits the row before the email; a delivery failure is a 500 and a retry is a 409

- **Where:** `src/lib/admin/accessManagement.server.ts` (`inviteUser`, `resendInvite`) commits the
  pending `admin_user` row and its audit row before `sendInviteEmail`; the mail error escaped as a
  500 (`accessManagement.http.server.ts`), while the duplicate pre-check makes an immediate retry
  a 409 `duplicate_admin_user`.
- **Effect:** with Resend down or miskeyed, the invitation is recorded and audited as sent but
  nobody receives it, and the operator's natural retry is refused. The only recovery is knowing
  that "Resend" on the pending row is a different button.
- **Fix (code):** the safe commit ordering stays. A mail-provider failure is caught and reported
  instead of thrown: the service returns `{ user, emailDeliveryFailed }`, the invite/resend
  handlers answer 201/200 with that flag (no 500), and the access page shows a bilingual warning
  saying the invite was created but the email was not delivered and to use Resend.
- **Tests:** `src/lib/admin/accessManagement.test.ts` (provider throw → row committed once, flag
  set, handler 201 not 500; success unchanged), `accessManagement.http.test.ts`, and
  `src/components/admin/access/accessActions.test.ts` (bilingual warning).

### AUTH-04 — Low — A cross-tab account switch leaves the previous admin's cached data in the old tab

- **Where:** `src/lib/admin/useLiveAdminActor.ts` reset only the identity query on an auth-user
  change; `completeSignIn` clears the whole cache but only in the tab that signs in.
- **Effect (suspected):** admin A leaves tab 1 on `/admin/supporters`; admin B signs in from tab 2.
  Tab 1 receives the auth event but keeps rendering A's cached (possibly higher-privilege) rows;
  only the identity query was reset. Most admin query keys are not actor-scoped.
- **Fix (code):** on an actual auth-user change (including sign-out) the hook now removes every
  cached query except the identity entry, then resets and refetches the identity query, so the new
  account's role is loaded and no previous-account data stays on screen. The first read after
  mounting is not treated as a switch.
- **Tests:** `src/lib/admin/useLiveAdminActor.test.tsx` (a non-identity cached key is removed; the
  identity entry is refetched for the new account; the existing generation/unmount cases hold).

### AUTH-05 — Low — The authorization sweep's admin-only list omits `volunteers/jobs/`

- **Where:** `tests/integration/admin/authorization.test.ts` `ADMIN_ONLY_PREFIXES` listed the other
  admin-only volunteer endpoints but not `volunteers/jobs/`, although
  `src/routes/api/admin/volunteers/jobs/index.ts` calls `requireAdmin(request, ["admin"], c)`.
- **Effect:** the sweep derived the route's permitted roles from its staff-visible `volunteers/`
  area, so if the route ever admitted `staff` the sweep would not report it (the BUG-63 drift
  surface).
- **Fix (test):** add `volunteers/jobs/` to `ADMIN_ONLY_PREFIXES` and a focused case that fails if
  the route ever admits staff (verified by temporarily allowing staff: both the sweep and the new
  case fail). The sweep root now uses `fileURLToPath`, so the guard also runs on Windows, where
  `URL.pathname`'s `/C:/…` form made `Bun.Glob`/import fail before any assertion.

### AUD-02 — Med — Staff can still read/update supporters and consents over PostgREST

- **Where:** `20260623160506_phase_2_donations_mvp.sql:280-305` — `staff can read supporters`,
  `staff can update supporters`, `staff can read supporter roles`, `staff can read consents` and
  `staff can update consents` all use
  `private.has_admin_role(array['staff', 'treasurer', 'admin'])`. No later migration redefines
  them (checked through `20261109102000`). The CRM APIs are `requireAdmin(…, ["treasurer","admin"])`
  and `ROLE_ACCESS` gives `staff` no supporters area, so the database was wider than the app.
- **Effect:** a staff JWT can ignore the API and read or update supporter PII and consent rows
  directly (`/rest/v1/supporter`, `/rest/v1/consent`), defeating the "staff have no supporters
  area" boundary; this was AUDIT.md R3, carried as an open item.
- **Fix (migration):** `20261109103000_tighten_supporter_staff_rls.sql` drops each of the five
  policies by name and recreates it with the same name and
  `private.has_admin_role(array['treasurer', 'admin'])` (latest-definition-wins). Nothing else
  changes: no insert policy exists on either table, there is no public/own-row supporter policy for
  the supporter portal (its data is served by service-role repositories that bypass RLS), the
  `authenticated` grants stay, and service_role keeps its grant. No rows are read or rewritten.
- **Tests:** `src/lib/admin/supporterRlsAccess.migration.test.ts` pins the statements, the
  policy/table set, absence of grant/revoke/data changes, and the migration order; the behavioural
  half in `supabase/rls-tests/moneyPii.rls.test.ts` now asserts staff is denied and treasurer/admin
  are allowed for supporter select/update, supporter_role select and consent select/update (runs
  under `bun run test:rls` against a local stack).

## Admin operations backlog — second batch (2026-11-09)

### OPS-03 — Low — The supporter record offers "Issue receipt" for donations the API refuses

- **Where:** `src/components/admin/crm/SupporterDetail.tsx:47-53` decided the action from
  `status === "succeeded" && receiptRequested && !issuedReceipt`, without the IRD money rule the
  receipt API applies: `src/lib/donations/reconcile.server.ts:951-956` checks
  `isReceiptEligible` (`src/lib/donations/domain.ts:77-79`, HK$100 minimum) on the net amount and
  returns 422. The supporter record is the only place CRM staff see individual donations.
- **Repro:** treasurer/admin → `/admin/supporters/:id` → a succeeded HK$50 donation with
  "receipt requested", or a HK$150 gift refunded HK$80 (net HK$70) → **Issue receipt** is shown →
  click → 422 `Donation is not eligible for an IRD receipt`.
- **Fix (code):** the predicate moved to `src/components/admin/crm/receiptActions.ts`
  (`canIssueReceipt`) and now applies the shared `isReceiptEligible` rule to
  `amountCents - (refundedCents ?? 0)`, the same rule and threshold as the server, so the action
  is offered only when it can succeed. The server check stays the guard; no API or schema change.
  This is the UI half of BUG-05 that its fix (`cb4ae53c`) did not update.

### OPS-04 — Low — Coordinator manual intake dead-ends when the email belongs to a soft-deleted supporter

- **Where:** `private.create_manual_adoption_case` (`20260628143000:96-111`) inserts a
  `new_supporter` row, so the unconditional unique `supporter_email_key` rejects an email a
  soft-deleted supporter still holds: `supporter.email` is `citext not null unique` and the
  soft-delete only sets `deleted_at`. Both ways to attach the existing supporter hide deleted
  rows (`existing_supporter` refuses them, `20260628143000:71`; `search_manual_case_identity`
  filters `deleted_at is null`, `20260926110000:33`). The adoptions error mapper
  (`src/lib/adoptions/http/shared.server.ts`) answered with the generic "choose the existing
  supporter" 409, but staff have `manualIntake` and not `supporters`
  (`src/lib/admin/access.ts:45-61`), so they cannot see or restore the record the advice names.
- **Repro:** treasurer soft-deletes a supporter; staff → `/admin/coordinator/intake` → identity
  search for that email returns nothing → **New supporter** with the email → 409 "A supporter
  with this email already exists. Choose the existing supporter instead."; searching still
  returns nothing and choosing `existing_supporter` is refused.
- **Fix (code):** `withErrors` takes an optional manual-intake `lookupSupporterByEmail`,
  wired only for `POST /api/admin/adoptions/intake/cases`
  (`src/routes/api/admin/adoptions/-handlers.ts`). On a `supporter_email_key` violation the
  mapper extracts the email from the PostgREST detail (never echoed) and looks it up through
  the new service-role repository function `findSupporterByEmailIncludingDeleted`
  (`src/lib/adoptions/repository.server.ts`), which has no `deleted_at` filter. A soft-deleted
  row returns 409 code `supporter_archived` with a message naming the archived supporter and
  telling staff to ask a treasurer/admin to unarchive it or record the intake without the
  email. An active supporter keeps the existing "choose the existing supporter" 409 and an
  unknown email keeps the generic 409; a failed lookup falls back to the generic 409 rather
  than a 500. The database function is unchanged. The intake screen maps the code to bilingual
  copy (`manualIntake.serverErrors.supporter_archived` in `pageCopy/caseCopy.ts`).

## Content/CMS backlog (2026-11-09)

A read-only audit of the content CMS surfaces
([`audit-20261109/`](../audit-20261109/findings-cms.md)) found eight findings. CMS-01 (the stale
animal-draft save dead end) and CMS-04 (content-list summary cards counted only the current page)
were fixed with the admin P0 batch. CMS-07 (withdrawn images stay reachable until the daily
withdrawal job) is a recorded accepted product decision. The other five are fixed here, all in
code; no migration is needed. The IDs keep the audit's CMS- prefix so BUG-01–BUG-73 keep their
numbers. See [`FIX_REPORT.md`](FIX_REPORT.md#contentcms-backlog-2026-11-09).

### CMS-02 — Med — Social copy for a story update still quotes the unreviewed authoring text

- **Where:** `src/lib/content/service.ts` `generateSocialCopy` read the update with
  `repo.getStoryUpdate(storyUpdateId)` (the authoring `story_update` row) while the link and the
  story wording came from the published snapshot; `src/lib/content/socialCopy.ts:31-32` embeds
  that update's title and body verbatim.
- **Why wrong:** the authoring row can be a draft edit newer than the published revision, so the
  generated Facebook/WhatsApp copy announced text that is not on the page its link opens — the
  same class BUG-66 closed for the item itself.
- **Repro (fake repository):** publish a story; add a public update; don't publish again;
  `POST /api/admin/content/<id>/social-copy {"storyUpdateId":"<update>"}` → the copy contains the
  unpublished update text next to the published slug.
- **Fix (code):** the authoring read now only validates ownership and visibility; the update is
  resolved from the published snapshot's `updates` and its published title/body are quoted. An id
  the published revision does not contain is refused as a coded 409 `update_not_published`,
  explained in both admin languages.

### CMS-03 — Med — Publication-metadata errors still lose the field and the language

- **Where:** `src/lib/content/publicationMetadata.server.ts:49-59` answered every validation
  failure as `{error:"Invalid publication metadata"}`, while the main content routes use the
  structured shape BUG-68 introduced (`src/lib/content/http.server.ts:96-110`).
- **Why wrong:** `structuredAdminApiError` returns null for a string body, so the zh-HK editor
  printed the English string and named no field. Concrete triggers: marking content `verified`
  without provenance/owner, or an inverted effective-date range.
- **Repro:** editor → Publication metadata → choose "verified", clear source/owner, Save → banner
  shows `Invalid publication metadata` in English.
- **Fix (code):** the handler returns `{error:{code:"invalid",message,fields}}`; the superRefine
  issues now carry `sourceReference`/`contentOwner`/`effectiveUntil` paths (with the `Required`
  and inverted-range reasons), 40001 maps to `{code:"conflict"}`, known failures to
  `not_found`/`internal`. `editorFieldLabels` gained the five metadata keys and the inverted-range
  reason is written in both languages.

### CMS-05 — Low — BUG-67's version fence covered saves but not publish/archive/restore

- **Where:** `src/components/admin/content/ContentEditor.tsx` publish, archive and restore sent
  `content?.version` from the detail query cache; only panel saves went through `saveAgainst`.
- **Why wrong:** publication metadata, media and link saves only invalidate the detail query, so
  between a successful save and the refetch landing the cached version is one behind. Publishing
  in that window sent a stale `expectedVersion` and the editor raised its own conflict banner for
  a conflict it caused itself.
- **Repro (suspected timing):** throttle the network, save Publication metadata, immediately click
  Publish → 409 conflict banner until "Reload latest version".
- **Fix (code):** a `lifecycleExpectedVersion` helper returns the fence's latest version (the one
  this editor's own saves advanced synchronously) and falls back to the cached row only before
  the fence knows a version; publish, archive and restore use it. Tests cover
  save-then-immediate-publish sending the saved version.

### CMS-06 — Low — The "verified ready" collapsed review summary was unreachable

- **Where:** `src/components/admin/content/ContentReview.tsx:59-83` folds the panel when
  `savedClassification`/`savedEvidence` say the revision is approved, but no production caller
  passed them (`ContentEditor.tsx`, `AnimalForm.tsx` passed neither).
- **Why wrong:** on every load and every revision change the panel reopened as `needs_review` with
  empty evidence even for an already approved revision; re-submitting overwrote the recorded
  evidence, and an approver could not see which preset had been recorded.
- **Fix (code):** the content authoring read returns the current draft revision's saved review
  (`editorial_content_review`, queried in `repository.server.ts`; no migration) and the animal
  publication read returns the draft revision's review. `ContentEditor` and `AnimalForm` pass them
  to `ContentReviewPanel`, so an approved revision renders the collapsed verified summary and a
  needs-review revision opens the form with its saved evidence.

### CMS-08 — Low — BUG-73's length limits skipped story-update text and media caption

- **Where:** `src/lib/content/schemas.ts:133,159` (`body`, `caption` with no `.max`) and
  `storyProfileInputSchema.internalAddress`/`internalLocationNotes`; the only bound was the 8 MB
  admin JSON cap.
- **Why wrong:** every save copies all `story_update` rows and `content_media` rows into two
  revision snapshots, so one long update body or media caption was stored verbatim twice on every
  later save — exactly the unbounded-copy problem BUG-73 fixed for the item fields.
- **Fix (code):** `CONTENT_CHILD_TEXT_MAX` (update body 20,000; caption, internal address and
  location notes 500) applied to the three schemas, with matching `maxLength` on the editor
  inputs. No migration: the columns have no DB length constraint, so this is a validation rule.

## Editor revision fences (2026-11-09 design gap)

The 2026-11-09 audit recorded, under "Not filed as bugs", that the About, FAQ, Governance and
Knowledge editors had no revision fence: two tabs saving the same row kept the last write with no
notice ([`audit-20261109/`](../audit-20261109/findings-cms.md)). Fixed here end to end; one new
migration, `20261110100000_admin_editor_revision_fences.sql`. See
[`FIX_REPORT.md`](FIX_REPORT.md#editor-revision-fences-2026-11-09).

### About / FAQ / Governance / Knowledge — Low — two tabs saving the same row silently kept the last write

- **Where:** `src/lib/aboutPages/*`, `src/lib/faq/*`, `src/lib/governance/*`,
  `src/lib/knowledge/*` and their admin screens; the underlying tables `about_page_content`,
  `faq_entry`, `board_member` and `knowledge_posts` had no version column, and the update RPCs
  (`upsert_about_page_content_with_audit`, `upsert_faq_entry_with_audit`,
  `mutate_admin_content_with_audit`) wrote unconditionally.
- **Repro:** open the FAQ (or team, knowledge or about) screen in two tabs; save in tab A, then
  save in tab B with its stale copy of the row. Both return 200 and B's text replaces A's with no
  warning; A's change is lost.
- **Fix (migration + code):** each of the four tables gains `revision integer not null default 0`
  (existing rows start at 0), and their update RPCs take an optional `p_expected_revision`. An
  update whose expected revision is set and stale is refused with `40001` (the content CMS's
  stale-version convention) and every applied change bumps `revision`; callers that send no
  expected revision keep working, so the deployed app is not broken between deploy and migration.
  The admin API accepts `expectedRevision`, the list reads return `revision`, and each editor sends
  the revision it loaded; on the resulting coded 409 it shows a bilingual "another admin changed
  this — reload latest" notice with a reload action, keeping the unsaved local edits until the
  admin chooses to reload. FAQ hide and board step-down also bump the revision so a stale editor
  cannot undo them.

## Not filed as bugs (recorded for the report)

- **Design gaps — closed 2026-11-09.** About, FAQ, governance and knowledge editors had no
  revision fence: when two tabs saved, the last write silently won. Each table now has a revision
  and its update RPC refuses a stale one; see
  [Editor revision fences](#editor-revision-fences-2026-11-09-design-gap).
- **`site-documents` was a public bucket — closed 2026-11-10.** Migration
  `20261109104000_private_site_documents_bucket.sql` makes the bucket private and adds
  `public.read_public_document_asset(uuid)`. Every page now links `/api/documents/<asset id>`; that
  route returns the asset only when it is published and referenced by a published annual report,
  document slot or knowledge post, then redirects to a 60-second signed URL. No reader mints a
  public Storage URL any more; admin signed uploads and previews are unchanged.
- **CSP `script-src 'unsafe-inline'` (AUDIT R4) — fixed 2026-11-10.** `script-src` is now
  `'self' 'nonce-<per-request nonce>' 'strict-dynamic' <host sources>`; the nonce is generated in
  `src/server.ts`, travels through an `AsyncLocalStorage` request store into the router's
  `ssr.nonce` getter, and is stamped on hydration/`ScriptOnce`/head JSON-LD scripts plus a
  server-side HTML stamping pass. JSON-LD data blocks moved into route `head.scripts` and the
  static 500 page's inline `onclick` became a plain link; `style-src 'unsafe-inline'` stays
  deliberately for React style attributes. Live production check: a fresh nonce per response and
  zero un-nonced inline scripts on `/`, `/report/audit`, `/admin/login`. See
  [`docs/csp-token-decision.md`](csp-token-decision.md).
- **Trusted Types (DOM-XSS sinks) — measured 2026-11-10.** A separate, static
  `Content-Security-Policy-Report-Only` policy (`require-trusted-types-for 'script';
trusted-types 'none'`) now reports plain-string assignments to DOM sinks to the same
  `/api/csp-report` collector. It blocks nothing and is Chromium-only; enforcing
  `require-trusted-types-for` remains a later decision after the report stream is reviewed. See
  [`docs/csp-token-decision.md`](csp-token-decision.md).
- **Admin bearer token in web storage (AUDIT R4) — fixed 2026-11-10.** The admin session moved
  behind an `HttpOnly`/`Secure`/`SameSite=Strict` cookie session BFF; the browser keeps only a
  memory-only access token, legacy `sb-*-auth-token` entries are purged, and a guard test forbids
  reintroducing web-storage persistence. Data endpoints keep their Bearer/`requireAdmin` contract;
  the residual risk is session-riding XSS during the tab lifetime (no replayable token). See the
  "Admin session BFF" section of [`docs/FIX_REPORT.md`](FIX_REPORT.md).
- **zod 3 (BUG-30) — fixed 2026-11-10.** The direct dependency is zod 4.6.6 (the first line with
  the GHSA-mrhx-c7xc-m3w5 fix); the compat migration is recorded in
  [`docs/csp-token-decision.md`](csp-token-decision.md) and the FIX_REPORT upgrade section. Bun is
  pinned to 1.4.4 because Bun 1.3.14's bundler broke the zod 4 browser-fixture bundles.
- **Prior open items.** AUD-04 (non-blocking RLS CI job) is now fixed: `rls-matrix` is a required
  branch-protection check. AUD-06 (GA on admin pages) is unchanged. AUD-02 (staff RLS on
  supporters) is fixed by `20261109103000_tighten_supporter_staff_rls.sql` in the second batch
  above.
- **Content datetimes** convert in the browser's timezone. That is correct for staff in
  Hong Kong; HKT is not forced.

## Deferred backlog follow-up (2026-11-10)

The deliberately deferred halves of BUG-19, BUG-25, BUG-28, BUG-46 and BUG-53, closed or
re-decided in one batch. No production data is touched and no existing behaviour is narrowed.
BUG-53 was subsequently closed too, after the read-only production audit described in
[Post-baseline parity and guide uniqueness](#post-baseline-parity-and-guide-uniqueness-2026-11-10).

### BUG-19 — Payments CSV export row cap

- **Where:** `src/routes/api/admin/exports/payments[.]csv.ts` and
  `src/lib/donations/adminPayments.server.ts`. The audit row and `cache-control: no-store`
  shipped with the first BUG-19 fix; the row cap was deferred as a product call.
- **Fix:** `PAYMENT_EXPORT_ROW_CAP = 20_000` (named constant). The synchronous export reads at
  most one row past the cap and answers **413** with
  `{error, total, limit}`, no `no-store`-less body, and **no audit row** (nothing was exported),
  telling the treasurer to narrow the status/provider/search filters. Exactly 20,000 rows still
  export. The async CRM export jobs cover supporters/donations only, so the message does not
  point at them for payments; see the FIX_REPORT note.

### BUG-25 — Admin invite/resend land on the set-password page

- **Where:** `src/lib/admin/accessManagement.{repository.server,server,http.server}.ts`,
  `src/lib/admin/passwordRecovery.ts`, `src/routes/admin/reset-password.tsx`.
- **Fix:** `generateLink({type:"invite"})` now sends
  `options.redirectTo = <request origin>/admin/reset-password?intent=invite` for both a first
  invite and a resend. The existing reset-password page recognises `intent=invite`, treats the
  invite's `SIGNED_IN` session (or the restored session) as ready, and shows its own bilingual
  wording (setting a password, invite-link failure); recovery keeps the reset wording. After
  setting a password the invitee signs in at `/admin/login`, where the first `/me` call
  activates the pending admin (`activate_admin_invite_with_audit`, unchanged).
- **Deploy note:** the Supabase Auth redirect allow-list was empty in this project, so every
  invite/resend fell back to the Site URL; it was applied on 2026-11-10 through the Management API
  (`/admin/reset-password` for `hkscda.vercel.app`, `hkscda.com` and `www.hkscda.com`, plus `*`
  query variants). Values, the app-side landing fallback and the verification are in
  [`docs/admin-invite-links-2026-11-10.md`](admin-invite-links-2026-11-10.md).

### BUG-28 — Refresh the payment row after a 409

- **Where:** `src/components/admin/donations/{PaymentsReconcile,ReconcileDialog}.tsx`.
- **Fix:** `paymentActionNeedsRefresh` (a 409 means the row is stale; a 422 does not) is applied
  to the reconcile, issue-receipt and void-receipt failures, which now invalidate the payment
  list/summary/activity queries on conflict instead of leaving the old action button until a
  manual reload.

### BUG-46 — "Receipt not needed" export filter was per supporter

- **Where:** `20261110110000_crm_donation_export_receipt_needed_per_donation.sql` redefines
  `public.crm_export_donations` and `public.enqueue_crm_export_job`.
- **Fix:** both donation-export paths call `private.crm_matching_supporters(p_filters -
'receiptNeeded')`, so a supporter who is still owed a receipt on one donation no longer
  disappears whole; the existing per-donation predicate then selects each donation on its own
  merits. The supporter list and its filter are unchanged (there the column is per supporter).
  No data rewrite. Behaviour change: with `receiptNeeded=false`, already-receipted, failed,
  refunded and below-threshold donations are now exported (they genuinely need no receipt).

### BUG-53 — One published guide per species (closed 2026-11-10: index added)

**Original decision (superseded later the same day):** **no** unique index or trigger is added in
this batch. `publish_adoption_guide_release` (`20261030121000`) already serialises publishes per
species and archives every published release of that species, so the only application write path
cannot create a duplicate. A partial unique index `unique (species) where state = 'published'`
cannot be created safely from here: the bug itself may have left duplicate published rows in
production, the migration is forbidden to rewrite data, and creating the index would then fail the
deploy. A conditional `DO` block would make the schema differ between environments; a trigger guard
is possible but is a new invariant that needs a data audit first.

- **Outcome:** the read-only production audit found **0** `adoption_guide_releases` rows, so no
  duplicate existed. The partial unique index `adoption_guide_releases_one_published_per_species`
  was added in `20261110140000_function_parity_and_guide_uniqueness.sql`; see
  [Post-baseline parity and guide uniqueness](#post-baseline-parity-and-guide-uniqueness-2026-11-10).
  Archiving duplicate rows remains the only manual step if a future data import reintroduces them.

## Verified correct (coverage)

- **Auth and sessions.** `safeAdminRedirect` (no open redirect). `requireAdmin` re-reads
  `admin_user` on every call, so demotion or disable applies immediately.
  Self-demotion and last-admin lockout are blocked. Sign-out, expiry and account switch
  clear the query cache.
- **IDOR.** The application-photo route checks both ids. The sponsorship proof URL is
  scoped and short-lived. Export-job downloads are scoped to the actor.
- **Bulk endpoints.** All capped (≤1,000–5,000 ids, 25 per apply). Search inputs are
  escaped for PostgREST `.or()` and LIKE, or use `strpos`.
- **CSV formula injection.** Neutralised in every CSV builder.
- **Money.** Reconcile, receipt, void, manual gift and delivery retry are idempotent and
  atomic with their audit rows. Amounts are bounded in zod and SQL.
- **Uploads.** Content media: private bucket, 8 MB, jpeg/png/webp, server-chosen path,
  signature check at finalise. Documents: 50 MB PDF only, path traversal rejected,
  no upsert. Internship attachments are signature-checked.
- **XSS.** No `dangerouslySetInnerHTML` renders user content; CTA and knowledge links
  reject `javascript:` and `//host`.
- **HKT.** The volunteer calendar and date helpers are correct, and the receipt PDF date
  is formatted in HKT.
- **Errors.** No raw Postgres message, detail or stack reaches any admin response; the
  global middleware returns a generic 500 page. (Second pass: the sponsorship finance POST does return raw Postgres text, BUG-47.)
- **Double submit.** Finalise, intake, case status, animal save and volunteer drafts
  disable their buttons and/or use idempotency keys.

## Post-baseline parity and guide uniqueness (2026-11-10)

The stale-schema catch-up restored the missing objects, but four functions still ran an older body
than the repository's latest definition, and BUG-53's "one published guide per species" invariant
was not enforced at the database level.

- **Function parity** — `record_sponsorship_payment_proof`, `read_content_admin_summaries`,
  `claim_volunteer_operation_outbox` and `volunteer_roster_attendance_result` are replaced with
  their latest repository bodies (`20261110140000_function_parity_and_guide_uniqueness.sql`,
  `create or replace`, privileges restated). Verified in production by comparing normalized
  `prosrc` with the repository definitions: all four match.
- **BUG-53 closed** — production data audit before the change: `public.adoption_guide_releases`
  contained **0 rows**, so no duplicate published releases can exist. The migration adds
  `adoption_guide_releases_one_published_per_species` (partial unique index on `species` where
  `state = 'published'`). The publish path already serialises per species and archives older
  releases; the index makes the invariant explicit. A future environment with duplicate published
  rows would refuse the migration and must archive through the publish path first.

## Invite/recovery landing fallback and branch archive (2026-11-10)

- **Invite links no longer depend on the Supabase Auth redirect allow-list.** Supabase falls back to
  the project Site URL when `redirectTo` is not allow-listed, dropping invitees on `/` with the
  token in the fragment. `src/lib/admin/authLanding.ts` now recognises typed invite/recovery
  payloads (and Supabase error payloads) on any page load and forwards them to
  `/admin/reset-password` with the fragment intact, so the existing BUG-25 set-password screen
  completes the flow. The dashboard allow-list was also applied on 2026-11-10 (values in
  `docs/admin-invite-links-2026-11-10.md`), so Supabase now lands directly on the reset route and
  the fallback stays as defence in depth.
- **Branch archive:** the 15 remaining long-lived branches (13 heads of squash-merged PRs + 2
  superseded integrations) were preserved as `archive/2026-11-10/*` tags and deleted; see
  `docs/branch-archive-2026-11-10.md` to recover any of them.
