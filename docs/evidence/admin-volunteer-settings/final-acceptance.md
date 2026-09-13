# Final isolated acceptance

Date: 2026-09-13. Candidate branch: `codex/admin-volunteer-settings-20260913`, base `3fcf8cec235e0fa252b7d134f74948f2a682ebac`. This is code and isolated acceptance evidence, not production activation.

## Production parity follow-up (2026-09-13)

Read-only production inspection identified concrete baseline gaps. The new guarded prerequisite `20260913060000_verified_baseline_compatibility.sql` precedes the original 36 unchanged migrations; the manifest now contains 37 candidates (100 source files including baseline). Full source-chain and production-shaped rollback rehearsals pass, as does post-prerequisite full acceptance: 2343 passed, one intentional skip, zero failures. The earlier 99-entry CLI/browser/recovery evidence below remains historical, not a claim of a new 100-entry CLI or browser run. See [production-baseline-parity.md](production-baseline-parity.md) for exact repairs, preservation checks and limits. No production writes or ledger repair occurred.

## Results

| Gate                                       | Result                                                                                                                             |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Clean ordered migration replay             | PASS: 63 baseline + 36 candidate = 99 migrations, disposable `hkscda-policy-20260913`, API56321/DB56322, no seed                   |
| Repeated migration up                      | PASS: `applied: []`; no baseline or candidate replay                                                                               |
| Complete test suite, first run             | PASS: 2343 passed, 1 skipped, 0 failed; 7619 assertions across391 files                                                            |
| Complete test suite, retained-state repeat | PASS: same2343 passed, 1 skipped, 0 failed;7619 assertions                                                                         |
| TypeScript                                 | PASS: `bun run typecheck`                                                                                                          |
| Lint                                       | PASS: 0 errors;44 existing React refresh warnings retained                                                                         |
| Production build                           | PASS with the repository's public Supabase URL/ANON_KEY variables pointing only at the disposable stack                            |
| Versioned policy generators                | PASS: SQL validation grammar and nine initial policy drafts match their source                                                     |
| Public layout                              | PASS:26 routes across375/390/768/1024/1440 widths                                                                                  |
| Accessibility                              | PASS blocking threshold:26 routes; two moderate `landmark-one-main` findings on missing dog/sponsor detail pages remain            |
| Performance                                | PASS:24 Lighthouse samples, four routes, mobile and desktop, scores96–100 (required floor50)                                       |
| Recovery                                   | PASS: snapshot-consistent local backup restored to a separate database;157 tables/2312 rows match canonical-ID and full-row hashes |

The one skipped test is the separate destructive content-media orphan cleanup rehearsal (`scripts/content-media-reconciliation-local.integration.test.ts`). It targets the unrelated shared55321/55322 stack and was deliberately not enabled. The private-media integration tests needed by this candidate ran in the isolated acceptance suite.

The public run-context files truthfully record the base commit and dirty working tree. They used synthetic local data, not the CI fixture or a production dataset. Subsequent changes were confined to the administrator assessment dry-run control and the server assessment corrections. The final build includes that control; the final clean database suite covers draft-independent execution, shared counting, scope validation, continuous tier history and monthly reconciliation. No public layout source changed after the public verification runs.

Dedicated final RLS gate also passed:45 tests,82 assertions,0 failures against the99-entry schema; see final-rls-verification.json.

## Role and workflow evidence

Following docs/evidence/.gitignore,42 raw screenshots remain on disk and are hashed in raw-artifact-manifest.json; compact reports and executable verification scripts are committed.

Reports/screenshots are under `browser/`, `finance-browser/`, and `public-verification/` beside this file. Browser assertions exercise real HTTP/auth/database workflows, not mocked responses:

- Administrator capacity5→6 publication, preserved old5, six accepted/seventh rejected; staff/treasurer/inactive policy denial; all four calendar views agree.
- Shared source publication and inherited snapshots, explicit simulation, verified group inquiry, staff B→A confirmation, same-booking reschedule;390/768/1440 layouts.
- Published new terms replace displayed text, clear the checked box, disable booking and create neither consent nor booking implicitly.
- Staff operational task completion and failed-notification retry; treasurer/anonymous denial; completion is separate from delivery or approval.
- Staff payment300, treasurer exact proof approval and refund100, retained amount200; permission denials and responsive finance UI.
- Independent student intake publication, verified application/private upload, staff evidence approval, other applicant/anonymous/treasurer denial.
- Animal draft save/reopen/preview/publish/copy, internal-note and direct-write denial, approved gallery alt/source/focal point, original hero retained.
- Fresh99-migration assessment journey: administrator selects once/day, combined scope and monthly trigger, resolves observation/time, enables explicit dry-run email, saves/previews/publishes; persisted configuration verified and staff receives403. No provider sends.

Database acceptance also exercises last-seat concurrency, current-policy approval/waitlist enforcement, dynamic and once-only release, daily scopes, credential expiry, duplicate/overlap prevention, immutable booking shape, attendance/cancellation races, intentional audit rollback, exact proof idempotency, refunds/receipts, allocation retries, fenced notification claims and configured tier triggers. See the requirement traceability in `implementation-status.md` and the exact tests referenced there.

## Migration and recovery limits

`migration-release-manifest.json` now records all37 LF-normalized SQL hashes. `fresh-schema-verification.json` records the final effective signatures, RLS and permissions. The final grant fix closes four inherited browser-executable commands; the effective public SECURITY DEFINER command scan is browser-restricted. Actual anonymous/authenticated invocation-denial tests run in the complete suite.

The recovery drill restored a consistent synthetic snapshot into `hkscda_restore_20260913` in the same dedicated container, leaving its source untouched. It verifies database schema/data and factual continuity, not external storage objects, provider state, production RTO/RPO or owner/ACL restoration. Grants are independently verified against the clean migration result. Intentional audit-failure and stale-preview tests additionally prove transaction rollback without partial capacity, attendance, money or content mutation. Policy recovery copies an immutable prior version into a new prospective publication; factual correction appends linked evidence.

Production's33 remapped migration-ledger entries are not evidence that31 baseline files are unapplied. Do not replay the63 baseline files, blanket-repair the ledger, or run an unreviewed push. Follow `migration-release-runbook.md` for exact object mapping, backup, coordinated application/schema cutover, future-session policy binding and forward recovery.

## Remaining activation and evidence boundaries

- Production was read only; no production migration, payment, supporter message, record mutation, push, merge or deployment occurred. The original checkout's24 unrelated changes remain preserved.
- Administrators can resolve ordinary policy choices and publish through this workflow without a developer or second approver. Unresolved choices block only their affected activation.
  -249 requested original photo references have no exact local source file;234 map to canonical records and15 remain unmatched. Existing real photos/IDs remain intact. Missing assets and identity matching require the original evidence.
- The original internship form was not supplied; the independent implemented workflow cannot establish faithful field-for-field conversion without it.
- The exact seven sample content records have a guarded, rollback-tested archive candidate, not a production archive. See the exact-ID manifest and SQL.
- Live notification channels require configured transport. WhatsApp has no dispatcher and is unavailable for live publication. No live delivery was tested or implied.
- Production migration, environment/provider activation and deployment require the existing release authority. The concrete candidate and this evidence are prepared before that gate.
