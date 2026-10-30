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

> **Status:** 31 fixed (BUG-01's, BUG-02's, BUG-03's, BUG-06's, BUG-22's and BUG-23's migrations were approved and added after Phase 4), 1 deferred. BUG-33 to BUG-65 come from a second pass (2026-10-30): 21 are fixed in code (BUG-35, 40, 41, 42 code part, 43, 44, 45, 47, 48, 50, 51, 52, 54, 55 code part, 56–62) and 12 wait for a migration or a decision (as do the database parts of BUG-42 and BUG-55); see [Second pass](#second-pass-bug-33bug-65). See [`FIX_REPORT.md`](FIX_REPORT.md) for which ones and why.

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
  then re-run all gates. **`zod` 3 → 4 (GHSA-mrhx-c7xc-m3w5) is a major upgrade and is
  deferred pending approval.** Exposure is limited because admin bodies are capped at
  8 MB and public bodies at 1 MB.

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
Status: the code-only fixes are listed in [`FIX_REPORT.md`](FIX_REPORT.md#second-pass-2026-10-30); BUG-33, 34, 36–39, 46, 49, 53, 63–65 and the RPC parts of BUG-42 and BUG-55 wait for a migration approval or a decision.

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

## Not filed as bugs (recorded for the report)

- **Design gaps.** About, FAQ, governance and knowledge editors have no revision fence:
  when two tabs save, the last write silently wins. Each needs a version column, so a migration.
- **`site-documents` is a public bucket.** An uploaded but unpublished PDF can be fetched
  by anyone who has its random UUID URL.
- **CSP `script-src 'unsafe-inline'` and bearer tokens in web storage** (AUDIT R4).
  Removing `'unsafe-inline'` needs nonce support in SSR, so it is out of scope.
- **Prior open items** AUD-02 (staff RLS on supporters), AUD-04 (non-blocking RLS CI
  job) and AUD-06 (GA on admin pages) are unchanged.
- **Content datetimes** convert in the browser's timezone. That is correct for staff in
  Hong Kong; HKT is not forced.

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
