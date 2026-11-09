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
  21 code-only ones were fixed in PR #228; the other 12, and the database parts of BUG-42
  and BUG-55, were fixed after their migrations were approved. All 33 are fixed. See [Second pass](#second-pass-2026-10-30).

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
| BUG-44 | Low | Sponsorship animal assignment uses a searchable picker; changing the search clears the old selection     |
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

### Fixed with approved migrations (follow-up, 2026-11-05)

Approved by the user after PR #228 merged; BUG-33 uses the "record the return" design and
BUG-63 the "admins only" decision. Each migration was reproduced and verified on a throwaway
Postgres 16 before and after.

Review fixes on PR #232 (r1 I1, M1, M2):

- I1: `20261030103500` replaces the blanket `unique (adoption_case_id, animal_id)` on `animal_match`
  with a partial unique index on active matches. A trigger maintains `is_active_match` with the
  same predicate as the `103000` duplicate guard, and status edits re-sync it. A declined or
  cancelled match no longer blocks a new one. This was verified on a local Postgres 17 with all
  225 migrations applied. The BUG-42 database test fails before the fix (23505) and passes after it.
- M2: the `104000` return check was edited in place, because the PR is unmerged and not applied
  anywhere. It now requires `coalesce(btrim(return_reason), '') <> ''`, so a NULL reason fails.
- M1: there is now a single deploy order (below).

| ID     | Sev | Fix                                                                                                                                                                                                                       | Migration                          |
| ------ | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| BUG-33 | Med | Adoption returns are recorded (`returned_at`, `returned_by`, `return_reason`) by an audited "Record return" action that sets the animal back to available; finalising is refused only while an unreturned adoption exists | `20261030104000`                   |
| BUG-34 | Med | A finalised case's status cannot change (409); reopening a closed case needs a reason                                                                                                                                     | `20261030100000`                   |
| BUG-36 | Med | Intake items resolve when their case closes or is finalised; existing ones are backfilled                                                                                                                                 | `20261030101000`                   |
| BUG-37 | Med | Intake identity search needs a 3+ character query (or an exact email/phone) and masks non-adopters' contacts                                                                                                              | `20261030102000`                   |
| BUG-38 | Med | Anyone who edited a payment-method draft cannot publish it (editors tracked by trigger)                                                                                                                                   | `20261030110000`                   |
| BUG-39 | Med | Content metadata and media-repair audits log the auth user id; a guard test covers every function                                                                                                                         | `20261030120000`                   |
| BUG-42 | Low | Matches refuse unavailable animals, closed or finalised cases and duplicate active matches; only an active match is unique per case and animal, so a declined one no longer blocks a new match                            | `20261030103000`, `20261030103500` |
| BUG-46 | Low | "Receipt needed" (supporter list, filter, donation exports, export jobs) only for eligible donations with no issued receipt                                                                                               | `20261030111000`, `20261030113000` |
| BUG-49 | Low | `receipt.issue` is audited only when the receipt is new                                                                                                                                                                   | `20261030112000`                   |
| BUG-53 | Low | Publishing a guide archives every live release of the same species, whatever its topic; publishes per species are serialised                                                                                              | `20261030121000`                   |
| BUG-55 | Low | The RPC also refuses disabled → active for a never-accepted invite                                                                                                                                                        | `20261030130000`                   |
| BUG-63 | Low | Notification retry is admin-only in the API, the button and the SQL function                                                                                                                                              | `20261030131000`                   |
| BUG-64 | Low | A bulk edit writes one `volunteer_bulk.edit` row with before and after facts                                                                                                                                              | `20261030132000`                   |
| BUG-65 | Low | The qualifications page loads only the chosen profile; `list` returns credential definitions only                                                                                                                         | `20261030133000`                   |

**Deploy order.** There are 16 migrations. Deploy in exactly three steps:

1. Apply `20261030100000` → `20261030130000` in filename order (13 migrations, including
   `20261030103500` for BUG-42).
2. Deploy the code.
3. Apply `20261030131000` → `20261030133000` in filename order (3 migrations).

Why this works:

- `20261030110000` (BUG-38) runs before the code, in step 1. The payment-methods list reads `edited_by`.
- `20261030131000` (BUG-63) runs after the code, in step 3. With the migration first, a staff click on
  the old button would get a 500.
- `20261030133000` (BUG-65) runs after the code, in step 3. The old page reads `profiles` from `list`.
- The adoptions migrations (`20261030100000`–`104000`, with `103500`) run before the code, in step 1.
  Their signatures are unchanged, so the old code keeps working against them. Until step 2, a new
  refusal (for example, reopening without a reason) may show as a generic error, and "Record
  return" is available only once step 2 is live.
- The others carry no code dependency. The BUG-36 backfill is one update over open intake items.

**Not done, by design or pending a decision.**

- BUG-39: rows already written with the wrong actor are not rewritten: `audit_log` is append-only
  (no runtime role may update it). `admin_user.auth_user_id` recovers the real user for those rows.
- BUG-53: no unique "one published guide per species" index, since existing data may hold duplicates;
  the next publish for that species archives them with an audit row.
- BUG-33: reports and impact counts still include returned adoptions (product decision);
  no unique index on unreturned adoptions, since pre-BUG-02 duplicates may exist.
- BUG-46: a donation export filtered to "receipt not needed" leaves out every donation of a supporter
  who is still owed a receipt.
- Several new database scenarios (in `changeCaseStatus`, `atomicForward`, `notificationClaims`,
  `bookingEnforcement` database tests) need a local stack that CI's `rls-matrix` job does not run;
  each of those migrations was verified on Postgres 16 instead.

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

## Content creation pass (2026-11-05)

A focused review of content creation in the admin CMS ([`BUGS.md`](BUGS.md#content-creation-pass-bug-66bug-73)).
Each fix has a `BUG-xx` test that failed before it.

| ID     | Sev | Fix                                                                                                                                                                                                                                                                                                               |
| ------ | --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BUG-66 | Med | Social copy and adopter drafts use the published slug and wording; refused (409 `not_published`) while nothing is published                                                                                                                                                                                       |
| BUG-67 | Med | After the editor's own save, other dirty panels that shared its base move to the new version; another person's change still conflicts                                                                                                                                                                             |
| BUG-68 | Low | Validation errors arrive as `{code: "invalid", fields}` and are shown per field, by label, in the admin's language; slug pattern and title length on the inputs                                                                                                                                                   |
| BUG-69 | Low | Lifecycle and media refusals carry a safe reason code (cover on an internal update, expired session, existing link or primary subject, slug taken, byte mismatch) with its own message; a duplicate link is not a conflict; "Set as cover" disabled for internal updates; an expired session is replaced on retry |
| BUG-70 | Low | One story slug limit (`CONTENT_SLUG_MAX` = 180) in the schema, `suggestSlug` and the public story validators                                                                                                                                                                                                      |
| BUG-73 | Low | Length limits for subtitle, body, CTA label and SEO/OG fields, with matching `maxLength`                                                                                                                                                                                                                          |

**Fixed with approved migrations (user decision for BUG-71: keep the first publication date):**

| ID     | Sev | Fix                                                                                                                                                                                                                                                                                                                                        | Migration        |
| ------ | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- |
| BUG-71 | Low | Republishing keeps the first `published_at`; the /stories order, public date and `article:published_time` follow it. No existing rows rewritten                                                                                                                                                                                            | `20261105100000` |
| BUG-72 | Med | A trigger marks public image copies not used by the current published revision as withdrawn on publish or archive; the daily `/api/jobs/public-media-repair` run deletes them from `content-media` (lease, idempotent, retried on storage failure, never a current copy); republishing a withdrawn or removed copy cancels or re-queues it | `20261105101000` |

**Deploy:** `20261105100000` any time; `20261105101000` before or with the code (if the code ships first,
the job's withdrawal step fails with 500 until the migration runs; repairs still run). No new cron or
environment variable.

**Decided not to do (user, 2026-11-05).** BUG-71: no backfill; stories already republished keep
their later date (the first date stays recoverable from the earliest `content.publish` audit row).
BUG-72: no one-off sweep; copies left behind before the migration are withdrawn when their story is
next published or archived, not all at once; removal runs daily, so a withdrawn image can stay public
up to about a day (plus CDN caching); images stored directly in the public bucket by older code have
no copy record and are not covered.

**Behaviour to know.** Content already longer than a new BUG-73 limit still shows publicly; its
next save is refused, naming the field, until it is shortened. A slug clash still shows the
conflict banner (now with its own message).

**Verification.** `bun run test` 7,782 pass, 0 fail; `bunx tsc --noEmit` clean; `bun run lint`
0 errors (the same 53 warnings); `bun run build` passes with the route tree unchanged;
`verify:client-bundle` clean.

## Admin auth & operations audit (2026-11-09)

A read-only audit of the admin auth/session and operations surfaces
([`audit-20261109/`](../audit-20261109/findings-ops.md)) found five new defects. Three need
database changes; this section records the SQL half of the branch series (the code half ships
with it). The IDs keep the audit's AUTH-/OPS- prefixes so BUG-01…BUG-73 keep their numbers.

| ID      | Sev | Fix                                                                                                                                                                                                                                                                                                                   | Migration        |
| ------- | --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| AUTH-01 | Med | Browser roles lose `select` on `public.audit_log` and the three-role read policy is dropped. A direct staff/treasurer/admin PostgREST select now fails with permission denied; service-role API reads are unchanged; no rows are touched                                                                              | `20261109100000` |
| OPS-01  | Med | Publishing a `cancelled` or `closed` volunteer activity through the legacy update RPC returns `invalid`/`activity_closed` instead of reviving it. Every other branch, the advisory lock, the privileges and the pinned `search_path` are unchanged                                                                    | `20261109101000` |
| OPS-02  | Med | Changing `is_active`/`is_closing`/`is_final` on an `is_system` coordinator status raises `23514`; labels, colour and sort order stay editable and every other RPC branch is unchanged                                                                                                                                 | `20261109102000` |
| OPS-03  | Low | The supporter record applies the API's HK$100-net receipt rule (`isReceiptEligible` on `amount_cents - refunded_cents`) before offering **Issue receipt**, so an ineligible donation no longer shows an action that always returns 422. No server, RPC or schema change; the API check stays the guard                | —                |
| OPS-04  | Low | Manual intake's `supporter_email_key` 409 distinguishes an archived supporter: a new service-role lookup including deleted rows returns 409 code `supporter_archived` with actionable staff copy; an active or unknown email keeps the existing 409 and a failed lookup falls back to it. The intake RPC is unchanged | —                |

**Deploy:** all three are `latest-definition-wins` migrations with no data rewrite, so any order
after `20261105101000` works; AUTH-01 can go first on its own because no admin browser read
exists. OPS-01/OPS-02 refuse edits that are possible today, so ship them with the code half that
removes the affected controls. OPS-03/OPS-04 change no SQL: they are code-only and add no
deploy step.

**Behaviour to know.** A staff/treasurer/admin JWT selecting `audit_log` over PostgREST now gets
a permission error instead of rows, so a report built on that direct access must move to the API.
The legacy volunteers page gets the `activity_closed` refusal on terminal rows instead of
reviving them. The status editor must disable the three semantic switches for system rows; if it
does not, saving them is refused with `System status flags cannot be changed`. The supporter
record no longer offers **Issue receipt** for a donation below HK$100 retained or for one an
issued receipt already covers — the same rule the payments screen has applied since BUG-05. A
manual intake whose email belongs to an archived supporter now says so and tells staff to ask a
treasurer/admin to unarchive the supporter or record the intake without the email, instead of
pointing at an identity the intake flow hides.

**Verification.** Focused migration/RLS tests: 15 pass, 0 fail, 7 RLS tests skipped (no local
Supabase stack; `SUPABASE_LOCAL_URL=http://127.0.0.1:1`). `src/lib/supabaseMigrations.test.ts`:
71 pass, 0 fail. `bunx tsc --noEmit` clean; `bun run lint` 0 errors (the same 56 warnings). No
database was available, so the SQL is traced, not executed; the behavioural RLS test runs under
`bun run test:rls` against a local stack.

## Admin auth backlog — second batch (2026-11-09)

The same audit's accepted Lows (AUTH-02…AUTH-05) plus the inherited AUD-02 RLS gap. Four fixes are
code or test only; AUD-02 is a migration.

| ID      | Sev | Fix                                                                                                                                                                                                                                                       | Where                                                                                    |
| ------- | --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| AUTH-02 | Low | A 403 from `/api/admin/me` now takes the lapsed-session path (clear identity, local sign-out) and lands on sign-in with the bilingual "no admin access" reason, instead of a dead-end load failure. Ordinary 403s keep their meaning and sign no one out. | `src/lib/admin/session.ts`, `src/routes/admin/login.tsx`                                 |
| AUTH-03 | Low | An invite/resend whose row committed but whose email failed returns the user plus `emailDeliveryFailed` (201/200, not a 500) and the access page says to use Resend. The safe commit ordering is unchanged.                                               | `src/lib/admin/accessManagement.{server,http.server}.ts`, `src/components/admin/access/` |
| AUTH-04 | Low | On a real auth-user change the tab removes every non-identity cached query, then resets and refetches identity, so a cross-tab account switch leaves no previous admin's rows on screen.                                                                  | `src/lib/admin/useLiveAdminActor.ts`                                                     |
| AUTH-05 | Low | `volunteers/jobs/` is in the role sweep's admin-only list, with a case that fails if it admits staff; the sweep root is resolved with `fileURLToPath` so the guard runs on Windows too.                                                                   | `tests/integration/admin/authorization.test.ts`                                          |
| AUD-02  | Med | The five staff-wide supporter/supporter_role/consent policies are redefined to `array['treasurer', 'admin']`; grants, service-role access and the supporter portal paths are unchanged and no rows are touched.                                           | `20261109103000_tighten_supporter_staff_rls.sql`                                         |

**Deploy:** AUD-02 is a `latest-definition-wins` policy migration with no data rewrite, so any
order after `20261109102000` works and it can ship on its own. AUTH-02/AUTH-03/AUTH-04 are
client/server code; AUTH-05 is test-only.

**Behaviour to know.** An admin disabled or demoted mid-session is signed out on the next page load
and told why; a forbidden-area 403 still shows as a normal failed action. If the mail provider is
down, the invite is created and the page warns to press Resend instead of showing a save error.
Staff can no longer read supporter/consent rows over PostgREST; every app read is a service-role
API handler, so the UI is unchanged.

**Verification.** Focused tests: 226 pass, 0 fail across 14 files. `moneyPii.rls.test.ts`: 45 tests
skipped (no local Supabase stack; `SUPABASE_LOCAL_URL=http://127.0.0.1:1`, they run under
`bun run test:rls`). `bunx tsc --noEmit` clean. `bun run lint` 0 errors (the same 56 warnings). No
database was available, so the migration is traced, not executed; the AUTH-05 case was
negative-checked by temporarily allowing staff and observing both the sweep and the new case fail.
No full test suite was run.

## Admin operations backlog — second batch (2026-11-09)

**Verification (OPS-03/OPS-04 code-only follow-up).** `bunx tsc --noEmit` clean; `bun run lint`
0 errors (the same 56 warnings); focused `bun test --isolate` over the changed files:
331 pass, 0 fail. No database was available
(`SUPABASE_LOCAL_URL=http://127.0.0.1:1`), so the new repository lookup is exercised through the
fake service-role client, the error mapping through injected fakes, and the receipt rule through
a logic/component test; the receipt API's 422 expectation still passes unchanged in
`reconcile.lifecycle.test.ts`.

## Content/CMS backlog (2026-11-09)

The content side of the same read-only audit
([`audit-20261109/`](../audit-20261109/findings-cms.md)) left five incomplete fixes of BUG-66/67/68/73
plus the quality gaps around them. CMS-01 (stale animal-draft save) and CMS-04 (content-list
summary cards counted the current page) were closed with the admin P0 batch; CMS-07 (withdrawn
images stay public until the daily withdrawal job) is a recorded accepted product decision. This
batch closes the other five in code — **no migration** — and keeps the audit's CMS- IDs.

| ID     | Sev | Fix                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------ | --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CMS-02 | Med | Social copy for a specific story update now quotes the update from the published snapshot (the same read that supplies the link), not the authoring `story_update` row; that read is kept only to validate ownership/visibility. An id the published revision does not contain is a coded 409 `update_not_published`, explained in both admin languages                                                  |
| CMS-03 | Med | The publication-metadata handler returns the structured `{error:{code,message,fields}}` shape: zod issue paths now name `sourceReference`/`contentOwner`/`effectiveUntil` (verified provenance, inverted range), 40001 maps to `conflict`, known failures to `not_found`/`internal`. `editorFieldLabels` and the copy modules cover the five metadata fields, and the inverted-range reason is bilingual |
| CMS-05 | Low | Publish, archive and restore send the version the editor's own saves advanced the `editorVersions` fence to (with the cached row only as the pre-fence fallback), so a click during the post-save refetch window no longer sends a stale `expectedVersion` and self-inflicts a 409                                                                                                                       |
| CMS-06 | Low | The content authoring read returns the current draft revision's saved editorial review (and the animal publication read returns the draft revision's review), so `ContentReviewPanel` shows the collapsed verified summary for an approved revision and the saved classification/evidence otherwise, instead of reopening as `needs_review` and overwriting the earlier review                           |
| CMS-08 | Low | `CONTENT_CHILD_TEXT_MAX` bounds the authoring rows every save copies into both revision snapshots: story-update body 20,000, media caption and story-profile internal address/location notes 500, mirrored as `maxLength` on the editor inputs. Server and input limits come from the same constants; no DB column constraint exists, so no migration                                                    |

**Deploy:** code-only on the existing lifecycle routes and reads; no migration, no new environment
variable, no cron change. The animal read response gains a nullable `review` field and the content
detail gains a nullable `savedReview`, both additive.

**Behaviour to know.** Generating copy for an update that has not been published yet (added or
edited since the last publish) is now refused with "publish the story update first" instead of
quoting text the public page does not show. Content already longer than the new CMS-08 limits
still displays; its next save is refused naming the field until it is shortened. Editing an update
body, media caption or internal address/notes in the editor is stopped at the same limit the
server enforces.

**Verification.** `bunx tsc --noEmit` clean. `bun run lint` 0 errors (the same 56 pre-existing
warnings). Focused suite (content schemas/service/http/publication-metadata/repository/social
copy/lifecycle/media mapping, editor copy + version fence + editor + review panels, animal
publication route): 337 pass, 0 fail across 20 files
(`SUPABASE_LOCAL_URL=http://127.0.0.1:1`; no local Supabase stack, so DB-gated RLS/integration
files were skipped and no database was touched).

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
- [ ] **AUTH-01 (after the migration runs):** with a staff JWT, a direct
      `GET /rest/v1/audit_log?select=id` returns permission denied; the Access page history and
      the Finance activity page still load through the API.
- [ ] **OPS-01 (after the migration runs):** a cancelled or closed activity cannot be published
      from `/admin/volunteers` (the action is gone or returns the closed-activity message), while a
      draft or published activity still saves.
- [ ] **OPS-02 (after the migration runs):** a system status's Active/Closing/Final switches are
      disabled (or saving them is refused with "flags cannot be changed"); its label, colour and
      sort order still save, and finalising, task completion and case closing still work.
- [ ] **OPS-03:** a supporter's donation with HK$99 net retained (a HK$99 gift, or HK$150
      refunded HK$51) and "receipt requested" shows no **Issue receipt** button; a HK$100 net
      one does, and issuing it succeeds.
- [ ] **OPS-04:** soft-delete a supporter in CRM, then create a manual intake with that email:
      the error says the email belongs to an archived supporter and to ask a treasurer/admin to
      unarchive it or record the intake without the email. An active supporter's email still
      shows the existing "choose the existing supporter" message.
- [ ] **CMS-02:** publish a story, then add a public update without publishing again. Through the
      API, generate social copy for that update: it is refused with "publish the story update
      first". Publish again, then generate: the copy quotes the update text the public page shows.
- [ ] **CMS-03:** in Publication metadata choose "verified" and clear the source/owner → the banner
      names those fields in zh-HK. Set an end time before the start time → the banner names the end
      time. Save while a second tab has published → the conflict banner, not an English string.
- [ ] **CMS-05:** throttle the network, save Publication metadata, then immediately click Publish:
      it publishes instead of showing a conflict banner. A change really made by someone else
      still shows the conflict banner.
- [ ] **CMS-06:** approve a content revision, reload its editor → the source review is collapsed as
      "已核實可發布 · <evidence>". A needs-review revision opens the form with its saved evidence.
      The same for an approved animal draft in the animal form.
- [ ] **CMS-08:** try to type more than 20,000 characters into a story-update body or more than
      500 into a media caption / the internal address or notes → the input stops at the limit, and
      the API refuses anything longer with the field named.

## Deferred backlog follow-up (2026-11-10)

The halves left deliberately open in the 2026-11-09 batch. BUG-19/25/28/46 are now closed;
BUG-53 stays open by decision, with the reason below.

| ID     | Sev | Fix                                                                                                                                                                                                                                                                                                                                                                                                                         | Migration        |
| ------ | --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| BUG-19 | Low | The payments CSV export reads at most `PAYMENT_EXPORT_ROW_CAP` (20,000) rows and refuses a larger set with a no-store **413** naming the limit, before the audit row and the CSV. The audit row and `cache-control: no-store` it already had are unchanged; exactly 20,000 rows still export                                                                                                                                | —                |
| BUG-25 | Low | `auth.admin.generateLink({type:"invite"})` sends `options.redirectTo` = `<request origin>/admin/reset-password?intent=invite` for invite and resend. The reset-password page handles the invite session (`SIGNED_IN` or restored session), shows bilingual set-password wording and its own invalid-link message, and the invitee then signs in at `/admin/login`, where first `/me` activates the pending admin            | —                |
| BUG-28 | Low | A 409 from reconcile, issue-receipt or void-receipt invalidates the payment list/summary/activity queries, so a row another admin already changed stops offering the stale action without a manual reload (422 refusals do not refetch)                                                                                                                                                                                     | —                |
| BUG-46 | Low | Donation exports (CSV and queued job) match supporters with the `receiptNeeded` key removed, then select donations on the per-donation rule. A supporter still owed a receipt on one donation no longer drops their receipt-not-needed donations from a `receiptNeeded=false` export. Supporter list/filter unchanged; no data rewrite                                                                                      | `20261110100000` |
| BUG-53 | Low | **Left open deliberately.** The publish path already serialises per species and archives every published release of the species, so the application cannot create a second live guide. A partial unique index cannot be added safely without a data audit (the bug may have left duplicates; the migration must not rewrite data), and a conditional index/trigger would be a new schema invariant needing its own decision | —                |

**Deploy.** Only `20261110100000` needs applying: it is a latest-definition-wins redefinition of
`crm_export_donations` and `enqueue_crm_export_job` with no data rewrite, so it can run before or
with the code. BUG-25 needs the Supabase Auth redirect allow-list to include the deployment
origin's `/admin/reset-password` path (Auth dashboard setting, not a repository change); without
it Supabase falls back to the Site URL. No new environment variable.

**Behaviour to know.** A payments export above 20,000 matching rows is refused instead of being
served; narrow the status/provider/search filters. A donation export filtered to
`receiptNeeded=false` now lists already-receipted, failed, refunded and below-threshold donations
(they genuinely need no receipt) while the supporter list still shows the supporter-level state.
BUG-19's 413 does not point at the async export jobs because they support supporters/donations
only — adding payments to the job queue is a separate feature.

**Verification.** Focused suites for this batch: 182 pass, 0 fail (11 files: payments export
reader and route, payment reconcile logic, password recovery, reset-password page, access
management service/repository/handlers, receipt-needed migration content, login copy, and
`supabaseMigrations.test.ts`). `bunx tsc --noEmit` clean; `bun run lint` 0 errors (the same 56
warnings). No database stack was available (`SUPABASE_LOCAL_URL=http://127.0.0.1:1`), so the two
database tests that exercise the new export SQL (`manualGift.database.test.ts`) are written but
skipped locally; the migration's SQL content is asserted by
`receiptNeeded.migration.test.ts`, which passed.

**Manual QA checklist.**

- [ ] **BUG-19:** as treasurer, export payments with no filters; the CSV downloads with
      `cache-control: no-store` and an `export.payments` audit row appears. With a filter set that
      matches more than 20,000 payments the export is refused with the 413 message naming the
      limit (no CSV, no audit row), and narrowing the filters exports again.
- [ ] **BUG-25:** invite an admin and open the emailed invitation link: it lands on
      `/admin/reset-password?intent=invite` with "Set your password" wording (zh: 設定密碼). Set a
      password, sign in, and the Access page shows the user active. Resend on a pending invite
      lands the same way.
- [ ] **BUG-28:** reconcile a pending payment in one tab, then in a second tab (stale row) press
      Reconcile / Issue receipt: the conflict notice appears and the row refreshes to its new
      state without a manual reload.
- [ ] **BUG-46:** with one supporter holding both a donation still owed a receipt and a
      failed/refunded/receipted one, export donations with "receipt not needed": the
      not-needed donations now appear; export with "receipt needed" still lists only the owed one.
