# Admin panel fix report

Date: 2026-10-29. Branch: `claude/sharp-thompson-th7bcl` (base `0e59983`, `main` #225).
Companion documents: [`AUDIT.md`](AUDIT.md) (stack, feature map, baseline) and
[`BUGS.md`](BUGS.md) (every finding with reproduction and proposed fix).

**Outcome.**

- **Findings:** 32 in total. 31 are fixed with one commit each, including BUG-01 (the
  only High), BUG-02, BUG-03, BUG-06, BUG-22 and BUG-23, whose migrations were approved
  after Phase 4 (BUG-23 after PR #226 merged). 1 is deferred: it needs a product decision.
- **Tests:** about 105 new tests in the unit suite, plus a 17-test admin E2E suite.
- **Gates:** every gate is green on the repository's pinned Bun 1.3.14. No production
  data, credential or deployment was touched.
- **Second pass (2026-10-30):** 33 more findings, BUG-33 to BUG-65 (7 Medium, 26 Low).
  21 code-only ones are fixed, one commit each; 12 wait for a migration approval or a
  decision, as do the database parts of BUG-42 and BUG-55. See [Second pass](#second-pass-2026-10-30).

## How this was run

| Phase | What happened                                                                                                                                                                                                                                                                          |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | Mapped the stack, the 51 admin pages and the 162 admin API route files, and recorded the baseline.                                                                                                                                                                                     |
| 1     | Ran a runtime authorization sweep over all 212 admin route × method pairs, plus a per-domain review (finance, access/CRM, content/uploads, adoptions/animals/sponsorship, volunteers). Each claimed bug was traced or reproduced; agent-reported claims were re-checked before filing. |
| 2     | Wrote a failing test for each bug before its fix, plus cross-cutting suites (authorization sweep, public API smoke, admin E2E).                                                                                                                                                        |
| 3     | Fixed bugs by severity, one commit per bug (`fix(admin): … (BUG-xx)`).                                                                                                                                                                                                                 |
| 4     | Added scripts, the CI job, the bundle secret scan and `.env.test.example`; final verification.                                                                                                                                                                                         |

**Assumptions** (also recorded in `AUDIT.md`):

- **Branch:** the session's branch is used instead of `fix/admin-audit`; nothing is on `main`.
- **Test runner:** the repo already has `bun:test` and Playwright browser tests, so Vitest
  was not added. Bug regressions sit beside their source as CLAUDE.md requires;
  cross-cutting suites are under `tests/`.
- **Defaults chosen:** migrations deferred (BUG-01's, BUG-02's, BUG-03's, BUG-06's, BUG-22's and BUG-23's were later approved and added), dependency changes within existing ranges
  only, and the minimal fix for invites.

## Bugs fixed

| ID     | Sev      | Fix (commit subject)                                                                                                                                                            |
| ------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BUG-01 | **High** | Sync the draft when the pipeline changes an animal's status (migration `20261029150000`; verified on Postgres 16)                                                               |
| BUG-02 | Med      | Finalise an adoption once per animal and never over a closed case; set the animal adopted (migration `20261029160000`; verified on Postgres 16, incl. a concurrent race)        |
| BUG-03 | Med      | New supporter on an existing email returns 409 instead of overwriting it; an exact retry still returns the same supporter (migration `20261029170000`; verified on Postgres 16) |
| BUG-06 | Med      | Social-copy edits and their audit row are written in one transaction (migration `20261029180000`; verified on Postgres 16 with a forced audit failure)                          |
| BUG-31 | Med      | Send a server-rejected session back to sign-in                                                                                                                                  |
| BUG-04 | Med      | Compute the receipt tax year in Hong Kong time                                                                                                                                  |
| BUG-05 | Med      | Apply the HK$100 receipt rule to the receipt action and count                                                                                                                   |
| BUG-07 | Med      | Require the reasoned action to hide a FAQ entry                                                                                                                                 |
| BUG-08 | Med      | Lock a served document's kind, language and checksum                                                                                                                            |
| BUG-09 | Med      | Count coordinator reports by Hong Kong month                                                                                                                                    |
| BUG-10 | Med      | Explain volunteer waitlist refusals instead of a 500                                                                                                                            |
| BUG-11 | Med      | Answer an invite for an existing account with 409                                                                                                                               |
| BUG-12 | Med      | Bound supporter phone and tags                                                                                                                                                  |
| BUG-30 | Med      | In-range security patches for seroval and Vite (`bun audit` 41 → 32)                                                                                                            |
| BUG-13 | Low      | 404/400 for unknown supporters and bad admin ids                                                                                                                                |
| BUG-14 | Low      | 409 for a repeat receipt void, 400 for a bad payment id                                                                                                                         |
| BUG-15 | Low      | Map duplicate case numbers, unknown animals and bad list input                                                                                                                  |
| BUG-16 | Low      | 404/409/422 instead of 500 for documents and FAQ                                                                                                                                |
| BUG-17 | Low      | Reject bad volunteer input with 4xx instead of 500                                                                                                                              |
| BUG-18 | Low      | Treat a page past the end as empty; refuse huge CRM pages                                                                                                                       |
| BUG-19 | Low      | Audit the payments CSV export and mark it no-store                                                                                                                              |
| BUG-20 | Low      | Record a regenerated coordinator export once                                                                                                                                    |
| BUG-21 | Low      | Export every coordinator row, not the newest 1,000                                                                                                                              |
| BUG-22 | Low      | Audit animal draft saves and version restores in the same transaction; fence restores on the draft revision (migration `20261029190000`; verified on Postgres 16)               |
| BUG-23 | Low      | A manual gift with an inline supporter reuses an existing supporter unchanged instead of overwriting it (migration `20261029200000`; verified on Postgres 16)                   |
| BUG-24 | Low      | Stop the supporter edit form restoring deleted supporters                                                                                                                       |
| BUG-26 | Low      | Authenticate before reading admin request bodies                                                                                                                                |
| BUG-27 | Low      | Keep 403 and 500 distinct from 401 on photo upload URLs                                                                                                                         |
| BUG-28 | Low      | Stop offering staff actions they cannot take (export button, proof task card)                                                                                                   |
| BUG-29 | Low      | Report why a volunteer activity update was refused                                                                                                                              |
| BUG-32 | Low      | Show a network failure, not an empty list, when offline                                                                                                                         |

**Existing tests that changed, and why.** No test was deleted or weakened. Five existing
tests encoded the old behaviour or used ids no real record can have; each change is
explained in its commit and in a code comment.

- **Placeholder ids replaced with UUIDs**, since the handlers now reject non-UUID ids;
  the assertions are unchanged:
  - `"target-row"` in the access-management handler test (BUG-13).
  - `"enquiry-1"` in two group-enquiry tests (BUG-17).
- **More realistic test double (BUG-27):** the photo-upload unauthenticated test now
  throws the 401 `Response` that `requireAdmin` really throws, instead of a plain
  `Error`. It still asserts 401 and that no URL is issued.
- **Task-overview tests (BUG-28):** the href check reads the treasurer's card (same
  href), and the staff ready-card count with one failed source is 3, not 4.

## Bugs deferred

| ID     | Sev | Why deferred     | What closes it                                                                                                                                                     |
| ------ | --- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| BUG-25 | Low | Product decision | Invite links have no `redirectTo` or set-password page. BUG-11 now returns a clear 409 instead of a 500; letting existing accounts be invited is a choice for you. |

Every migration bug's regression test was written with `test.failing`, asserting on the
latest migration's SQL, and had `.failing` removed in the same commit as its migration.
None remain.

**Partially fixed, by choice:**

- **BUG-07 and BUG-08:** the guard is application-level. The RPCs still accept the flag
  or fields, so closing it fully needs the same migration round.
- **BUG-19:** no 5,000-row cap was added to the payments export. A cap would stop
  treasurers exporting large payment sets, and the async export jobs cover large sets.
  It is a product call.
- **BUG-28:** refreshing the payment row after a 409 from reconcile or issue-receipt is
  not done, because no failing test was written for it first.
- **BUG-30:** `zod` 3 → 4 (GHSA-mrhx-c7xc-m3w5) is a major upgrade and was not approved.
  The remaining 31 advisories are build or dev tooling, plus zod. Exposure is bounded by
  the 8 MB admin and 1 MB public body caps.

## Test coverage summary

| Suite                     | Where                                                                | Tests                                                       | Runs in                             |
| ------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------- |
| Bug regressions           | beside the code (`*.test.ts`), named `BUG-xx: …`                     | 55+ (no `test.failing` left)                                | `bun run test` / CI `verify`        |
| Admin authorization sweep | `tests/integration/admin/authorization.test.ts`                      | 4 (212 endpoints × 8 callers, role matrix vs `ROLE_ACCESS`) | `bun run test` / CI `verify`        |
| Public API smoke          | `tests/integration/public/smoke.test.ts`                             | 33                                                          | `bun run test` / CI `verify`        |
| Client bundle scanner     | `scripts/verify-client-bundle.test.ts` (+ CI step on the real build) | 5                                                           | `bun run test` / CI `verify`        |
| Admin E2E (browser)       | `tests/e2e/admin/admin.e2e.ts`                                       | 17                                                          | `bun run test:e2e` / CI `admin-e2e` |

Scenario matrix from the brief, and where each scenario is covered:

| Area          | Covered by                                                                                                                                                                                                                                                          |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth          | E2E: valid login, wrong password, unknown user (same message), repeated failures hitting the auth rate limit, logout clears the stored session, revoked/tampered session → login. Sweep: invalid token → 401.                                                       |
| Authorization | Sweep: anonymous 401, non-admin, disabled and pending 403 on all 212 endpoints; each role allowed only within its page area; admin never refused. E2E: treasurer → access-denied on Access, staff → access-denied on CRM, non-admin account kept off the dashboard. |
| Create        | BUG-07, 12, 17 (required fields, over-length, end before start); existing idempotency tests for double submit; E2E Unicode/emoji and XSS rendering.                                                                                                                 |
| Read/List     | E2E empty list and populated list; BUG-18 page past the end and huge page; BUG-21 more than 1,000 rows.                                                                                                                                                             |
| Update        | BUG-08, 13, 14, 17, 29; existing revision-fence tests cover concurrent edits; editing an unknown or invalid id → 404/400.                                                                                                                                           |
| Delete        | BUG-14 (void twice), BUG-16 (delete a referenced asset → 409). Existing `ConfirmActionDialog` guard tests cover confirm/cancel.                                                                                                                                     |
| Upload        | BUG-27; existing tests for MIME/size/signature (content media, documents, internships). **Not covered:** a browser-level upload flow and network failure mid-upload.                                                                                                |
| Errors        | E2E: API 500 → friendly retry with no server text shown, malformed JSON → friendly failure, slow response → loading state, offline → retryable failure (BUG-32).                                                                                                    |
| Security      | Sweep (IDOR is a role boundary here: no per-record scopes exist); search inputs are escaped (verified in Phase 1); client bundle secret scan in CI. CSRF does not apply (bearer tokens, no cookies).                                                                |
| Data/Locale   | BUG-04, BUG-09 (HKT boundaries); E2E Traditional Chinese text.                                                                                                                                                                                                      |
| UI            | E2E: phone viewport has no horizontal scroll, keyboard-only login, no console errors on the happy paths.                                                                                                                                                            |

## Final verification (Bun 1.3.14, the pinned version)

| Gate                         | Command                         | Result                                                              |
| ---------------------------- | ------------------------------- | ------------------------------------------------------------------- |
| Install                      | `bun install --frozen-lockfile` | ✅ no changes                                                       |
| Typecheck                    | `bun run typecheck`             | ✅ 0 errors                                                         |
| Lint (now includes `tests/`) | `bun run lint`                  | ✅ 0 errors, 53 warnings (same as baseline)                         |
| Full suite                   | `bun run test`                  | ✅ 7,559 pass, 728 skip, **0 fail** (8,287 tests, 866 files)        |
| Unit                         | `bun run test:unit`             | ✅ 6,322 pass, 0 fail                                               |
| Integration                  | `bun run test:integration`      | ✅ 37 pass, 0 fail                                                  |
| E2E                          | `bun run test:e2e`              | ✅ 17 pass, 0 fail (3 consecutive runs)                             |
| CI aggregate                 | `bun run test:ci`               | ✅                                                                  |
| Build                        | `bun run build` (CI env)        | ✅; `routeTree.gen.ts` unchanged                                    |
| Client bundle                | `bun run verify:client-bundle`  | ✅ 146 files clean                                                  |
| Dependencies                 | `bun audit`                     | ⚠️ 32 advisories (was 41); remaining are tooling and zod (deferred) |

**Baseline comparison:** 8,182 tests with 28 failures (all a missing Chrome binary in this
container) → 8,287 tests with 0 failures. The 728 skips are database/RLS suites that need
a local Supabase stack and opt-in variables (AUD-03); none ran here, so they establish
nothing about database behaviour.

**Environment notes:**

- **Chrome:** this container has Playwright's Chromium but not Google Chrome. The repo's
  browser tests launch the `chrome` channel, so locally Chromium was linked at
  `/opt/google/chrome/chrome`. GitHub's `ubuntu-latest` image ships Chrome.
  `E2E_CHROMIUM_PATH` overrides the browser for the new E2E suite.
- **Bun:** final gates used the pinned Bun 1.3.14. Earlier exploration used Bun 1.4.4,
  and one E2E timing issue showed up only on 1.3.14 (fixed in the test, commit
  `6ae8b91`).
- **Database:** no Supabase stack ran, so the migration-level bugs are verified by SQL
  text and fakes, not against Postgres.

## Tooling added

- **Scripts:** `test:unit`, `test:integration`, `test:e2e`, `test:ci`,
  `verify:client-bundle`. `test` is unchanged, as `testRunnerContract.test.ts` requires.
- **CI:** the `verify` job gains a client-bundle secret scan after the build. A new
  `admin-e2e` job is `continue-on-error` until it is proven green; then promote it via
  branch protection, as was done for `brand-verify`. The brief's "lint + typecheck +
  tests on PRs" was already met by `verify`, so no second workflow was added.
- **Config:** `.env.test.example` holds safe dummy values, and `.gitignore` now tracks it.
- **Typecheck scope:** `tsconfig.json` now includes `tests/`.

## Remaining risks

1. **Five migrations must be applied with the release** (BUG-01, BUG-02, BUG-03,
   BUG-06, BUG-22). Until `20261029150000_sync_animal_draft_status.sql`,
   `20261029160000_finalize_adoption_once_per_animal.sql`,
   `20261029170000_crm_create_refuses_existing_email.sql`,
   `20261029180000_update_social_copy_with_audit.sql` and
   `20261029190000_audit_and_fence_animal_draft_restore.sql` run on the production
   database the old behaviour remains. Apply them together with the code deploy: BUG-06's
   text edits fail with a missing-function error until its migration runs, and BUG-22's
   migration refuses a version restore from an old admin page that does not send the
   draft revision (a reload fixes it). BUG-23's
   `20261029200000_manual_gift_reuses_existing_supporter.sql` came after the merge and
   ships separately; it redefines an existing function and needs no code change, so it
   can run at any time. After they run: a preview made before a pipeline status
   change answers publish with a conflict, and staff preview again; finalising an
   adoption now also sets the animal to adopted (it leaves the public listing at once);
   and a second finalisation for the same animal or case, or one on a rejected,
   withdrawn or closed case, is refused with 409. The migration blocks new duplicates
   only; it does not touch any duplicate adoption records that may already exist.
   Creating a supporter on an email that already exists (including a soft-deleted one)
   is now refused with 409 and a message to open the existing record, instead of
   overwriting it.
2. **AUD-02 (prior audit).** RLS still lets staff read and update supporter rows the
   API reserves for treasurer/admin. This needs a product decision and a migration.
3. **No revision fence on the simple editors.** About, FAQ, governance and knowledge
   use last-write-wins: when two tabs save, one silently overwrites the other.
4. **Token storage.** The admin JWT lives in browser storage and the CSP allows
   `script-src 'unsafe-inline'`, so any XSS could steal a session. No XSS was found;
   removing `unsafe-inline` needs nonce support in SSR.
5. **Same offline pattern elsewhere.** BUG-32 was fixed for the dashboard animal list.
   Other admin lists that read through React Query may show an empty state while
   offline in the same way; they share the cause and the fix.
6. **Database suites never run here.** They need a local stack (AUD-03), and the CI
   `rls-matrix` job is still non-blocking (AUD-04).
7. **zod 3.** It has a high advisory, fixed only in zod 4.

## Second pass (2026-10-30)

A second review of every admin area after PR #226 and #227 merged. Findings are in
[`BUGS.md`](BUGS.md#second-pass-bug-33bug-65). Each fix below has a `BUG-xx` test that failed
before the fix; the fixes were made test-first in five parallel groups and then combined.

### Fixed (code only)

| ID     | Sev | Fix                                                                                                      |
| ------ | --- | -------------------------------------------------------------------------------------------------------- |
| BUG-35 | Med | A follow-up's `completed_at` follows its status: closing stamps it, reopening clears it                  |
| BUG-40 | Low | Each unique violation in the coordinator API gets the message for its constraint                         |
| BUG-41 | Low | Manual intake refuses a closing initial status (400) and no longer offers it                             |
| BUG-42 | Low | Code part: unknown linked ids are 404 and check violations 400, not 500 (RPC part deferred)              |
| BUG-43 | Low | Sponsorship RPC errors (plain objects) keep their domain status (404/409/400)                            |
| BUG-44 | Low | Sponsorship animal assignment uses a searchable picker; changing the search clears the old selection    |
| BUG-45 | Low | A new idempotency key for each successfully recorded sponsorship payment                                 |
| BUG-47 | Low | Sponsorship finance: linked payments left out of candidates, coded errors, 404 for an unknown pledge     |
| BUG-48 | Low | Consents: unknown supporter is 404; Save stays disabled until the refetch settles                        |
| BUG-50 | Low | No "Record gift" for deleted supporters; manual-gift refusals are 409/400 and unmapped errors are logged |
| BUG-51 | Low | Manual-gift bank reference capped at 120 characters                                                      |
| BUG-52 | Low | CRM exports claim more pages while a 45 s budget remains; an in-flight page can finish after it          |
| BUG-54 | Low | A publish blocked by a missing content review says so (`review_required`)                                |
| BUG-55 | Low | Code part: a never-accepted user is re-invited, not reactivated (RPC part deferred)                      |
| BUG-56 | Low | Access role changes and disables are confirmed; own-row role menu disabled; errors clear on success      |
| BUG-57 | Low | A refused account stays on the login form with a reason and is signed out locally                        |
| BUG-58 | Low | Supporter detail reads donations, payments and audit history past 1,000 rows                             |
| BUG-59 | Low | A changed volunteer draft retry is 409 and the form rotates its key                                      |
| BUG-60 | Low | An internship page past the end is an empty page with the real total                                     |
| BUG-61 | Low | Internship 409/404 show a real message and reload; settings discard the old body before a retry          |
| BUG-62 | Low | The overview "Today" list shows published sessions and flags a partial list                              |

### Waiting for approval or a decision

| ID     | Sev | Needs                                                                                      |
| ------ | --- | ------------------------------------------------------------------------------------------ |
| BUG-33 | Med | Migration, plus a decision on how a returned adoption is recorded (regression from BUG-02) |
| BUG-34 | Med | Migration: refuse reopening a finalised case; reason to reopen a closed one                |
| BUG-36 | Med | Migration (or an audited resolve action): resolve intake items                             |
| BUG-37 | Med | Migration: minimum query and masking in the intake identity search                         |
| BUG-38 | Med | Migration: refuse publish by anyone who edited the payment-method draft                    |
| BUG-39 | Med | Migration: audit the auth user id in two content functions, repair existing rows           |
| BUG-42 | Low | Migration (RPC part): refuse matches on adopted animals and closed cases                   |
| BUG-46 | Low | Migration: "receipt needed" only for eligible donations without a receipt                  |
| BUG-49 | Low | Migration: no second `receipt.issue` audit row                                             |
| BUG-53 | Low | Migration: one published guide per species                                                 |
| BUG-55 | Low | Migration (RPC part): refuse disabled → active for a never-accepted invite                 |
| BUG-63 | Low | Decision: may staff retry failed volunteer notifications, or admins only?                  |
| BUG-64 | Low | Migration: one audit row per bulk edit                                                     |
| BUG-65 | Low | Migration: narrow the qualifications `list` read                                           |

Follow-ups that were already cancelled with `completed_at` null stay open until saved again;
a one-off data fix would close them (not done; it changes production data).

### Existing tests changed (no check weakened)

- Sponsorship English copy test: the "Animal UUID" placeholder became the picker's strings (BUG-44).
- Animal publication route test: a missing review now expects `review_required` (BUG-54).
- Access English test: one disabled row now has an accepted invite so Reactivate stays covered (BUG-55).
- `signInFlow` tests pass the new `signOut` fake (BUG-57); supporter-repository and export-job fakes
  now behave like the database (1,000-row cap, no job on a second claim) (BUG-58, BUG-52).
- The volunteer server-message allowlist drops a string that no longer exists (BUG-59); the
  internship error-code list gains the two new codes (BUG-61).

### Verification

`bun run test` 7,643 pass, 0 fail (729 database tests skipped locally; CI runs them);
`bunx tsc --noEmit` clean; `bun run lint` 0 errors (the same 53 warnings); `bun run build` passes
with the route tree unchanged; `verify:client-bundle` clean. The BUG-57 E2E test was run in its
group: `bun run test:e2e` 18/18.

### PR #228 review follow-up (2026-10-31)

Review limited to `fa4f4915...0752e96a`. Two Important regressions were reproduced with
tests that failed before their fixes:

- Internship settings refetched a new revision after a 409 but retained the old local
  body. A retry could overwrite another admin's changes using that new revision. Recovery
  now clears local edits after the refetch, so the form shows the latest body; an uncertain
  network failure still preserves the body and revision for a retry.
- The sponsorship animal picker retained a selected id when a new search hid its radio.
  Add animal could therefore assign an animal no longer shown. Editing the search now
  clears the selection, requiring staff to choose an animal again.

Validation on pinned Bun 1.3.14: typecheck passed; lint passed with 0 errors and the same
53 warnings; focused tests 393 passed / 29 skipped; unit suite 6,408 passed / 646 skipped;
integration suite 38 passed; build passed; client bundle scan checked 146 files; public
brand verification passed for 26 routes across 5 viewports against the local fixture.
The first unit run had 9 environment failures because `python` was absent; a temporary
PATH alias to the installed Python 3 resolved them, and the full unit rerun passed.
Postgres did not answer on `127.0.0.1:55322`, so database-backed tests were skipped.

The deferred findings and database parts of BUG-42/BUG-55 above remain deferred. No migration
or production database change is part of this review.

## Manual QA checklist (staging or local, never production data)

- [ ] Sign in as each role (staff, treasurer, admin). Each lands on its first allowed
      section; the nav shows only allowed areas.
- [ ] Revoke a session (disable the admin in Access, or sign out in another browser),
      then reload. You land on the login page, not an error.
- [ ] Payments as staff: no Export CSV button. As treasurer: export works and an
      `export.payments` row appears in the access audit.
- [ ] Receipts: a HK$50 donation with a receipt requested shows no Issue receipt
      button and is not counted as awaiting. Void a receipt in two tabs: the second
      tab shows a conflict message, not a server error.
- [ ] FAQ: editing an existing entry shows no "active" checkbox; hiding it asks for
      a reason.
- [ ] Documents: try to change a published sponsorship-terms document's kind. It is
      refused with a clear message.
- [ ] Coordinator reports: a case created at 00:30 HKT on the 1st counts in that month.
- [ ] Volunteers: approve a waitlisted volunteer out of order and see the waitlist
      message. An activity with its end before its start is refused.
- [ ] Turn the network off on the dashboard and switch category. A network failure
      with retry appears; turning the network back on loads the list.
- [ ] Phone width (390px): dashboard, supporters, volunteers. No horizontal scroll;
      every action reachable.
- [ ] Keyboard only: sign in, move through the nav, open and cancel a confirm dialog.
- [ ] **BUG-01 (after the migration runs):** set an animal to adopted in the pipeline,
      then edit its description, preview and publish. It stays adopted and off the
      public adoptable list. A preview made _before_ the status change is refused on
      publish; previewing again works.
- [ ] **BUG-02 (after the migration runs):** with two cases matched to the same animal,
      finalise one. The animal shows as adopted and leaves the public listing; finalising
      the other case is refused with a clear message. Finalising a rejected case is
      refused; a case already moved to Approved still finalises.
- [ ] **BUG-03 (after the migration runs):** create a supporter with an existing
      supporter's email (try different letter case). The form says the email already
      exists and nothing about the existing supporter changes, including its roles and,
      if it was deleted, its deleted state.
- [ ] **BUG-06 (after the migration runs):** edit a social copy's text and hashtags,
      then change its status. Both save, and each change appears once in the audit
      log.
- [ ] **BUG-22 (after the migration runs):** open an animal in two tabs, save in one,
      then restore a published version in the other: it says someone else updated the
      draft. Reload and restore again: it works, and the save and the restore each appear
      once in the audit log.
- [ ] **BUG-23 (after the migration runs):** through the API, record a manual gift with an
      inline supporter whose email (in any letter case) belongs to an existing supporter.
      The gift is linked to that supporter, and its name, phone, language and tags are
      unchanged.
