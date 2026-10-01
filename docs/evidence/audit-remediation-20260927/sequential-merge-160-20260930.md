# PR #160 volunteer reviewer bulk — sequential verification, 2026-09-30 HKT

## Scope / state

Integrated baseline `2c3d1b12eaa952e0938c56f693c40b496b245d17`; repair `cf09870bdb001d9ecce4ecf78e8b26474179c666`. Narrow admin assignment of an active staff/admin reviewer. No volunteer status, qualification, booking or notification is changed. ADMIN-04 remains partial across domains. Code repaired and isolated schema ready; production schema absent, not deployed, not operationally enabled. Current-head remote CI and independent review pending at this checkpoint.

## Failure-first repairs

- Malformed JSON returned 503: API red 2 pass / 1 fail / exit 1. Explicit InvalidRequestJsonError now returns 400 and preserves 413/no-store. Green 3 pass / 17 assertions / exit 0, no mutation.
- Actor/reviewer eligibility could change after validation before transaction commit. Actual second connection disabled actor while apply remained open: red 2 DB pass / 1 fail / exit 1. Both authoritative Auth/admin row pairs now hold shared locks until transaction completion. Four revocation probes (actor/reviewer, admin disable/Auth ban) time out with 55P03 while held; later revoked reviewer rejects with 42501.
- Transient GET failure deleted the stored operation ID. Actual component baseline at all three widths lost ID and had no retry, exit 1. Preserve ID and offer read recovery. Reviewer select disabled while request pending. Green browser run exit 0.

## Commands and results

| Command | Environment | Actual result / exit |
| --- | --- | --- |
| `bun test --isolate --timeout 30000` | CHECKOUT_POLICY_TEST_DATABASE_URL loopback 57322/postgres; SUPABASE_LOCAL_URL 52321 | 2993 pass / 109 skip / 0 fail; 9309 assertions; 533 files; 40.71s / 0 |
| `npm.cmd run typecheck` | Worktree strict TypeScript | 0 |
| `npm.cmd run lint` | Full configured lint | 0; 52 existing warnings |
| `npm.cmd run build` | Synthetic keys and loopback 54329 | 0; generated route tree unchanged |
| `bun test src/lib/volunteers/directory/reviewerBulk.database.test.ts` | Explicit fixture opt-in; exact schema-only clone 52322/audit_pr135_20260929 | 4 pass / 30 assertions / 0 fail; 1225ms / 0 |
| `node scripts/verify-volunteer-review-bulk-review.mjs` | Actual component at loopback 56559, synthetic intercepted API | 390/768/1366px; exit 0; zero Axe/page errors, no overflow incl 200% zoom at 768 |
| `git diff --check`; generated route diff | Current candidate | 0 |

DB tests cover 1001 cap, actual service-role RPCs, actor/reviewer disable, expiry, profile revision conflict, suspended skip, audit rollback, concurrent duplicate apply and one audit. A 1000-item snapshot yields 100 already-assigned skips, 898 successes, one conflict and one newly suspended skip; duplicate retry adds no audit. Actual anon/authenticated execution is rejected. Synthetic fixture operations roll back or delete exact generated IDs. Initial pre-schema test had 0 pass / 3 fail due missing objects; its early cleanup failed on an absent table and left three synthetic users. These were identified by exact fixture counts/name/UUID emails, removed in a guarded local transaction, and aggregate counts rechecked: zero users/profiles/operations/items. No production rows copied or changed.

Browser baseline/final screenshots: `ui/t23-volunteer-review-bulk-{before,after}-{390,768,1366}.png`. It tests GET recovery, interrupted apply after ten writes, read of ten successes/fifteen pending, retry to exactly 25 writes, CSV download, 1000-item pagination (25 rows/40 pages), reset confirmation, keyboard selection and zoom. API is synthetic; database safety is independently tested above. Each fixture server/browser stopped. Local public-brand/performance and real staff/private-file UAT not-run; full-suite skips are not passes.

## Exact migration and rehearsal

`20260927181701_volunteer_review_bulk.sql`, canonical LF SHA-256 **f1f908e3193bcbdab4472ac0681c72351121230083d72fba841a209fe22ae5cc**. Replaces only the undeployed candidate hash, without editing any deployed file or ledger.

Three new RLS tables, two indexes, three public service-only definer RPCs and two private guards with empty search_path. Service SELECT only; direct INSERT/UPDATE denied. Anon/authenticated SELECT/EXECUTE denied. No backfill. Requires existing volunteer_profile.revision, admin_user/Auth and audit_log. Production read-only: ledger 95, two volunteer profiles, revision column present, new assignment/operation tables and apply RPC absent.

Original candidate was applied only to schema-only clone to reproduce the actual race. Revised full SQL was then rehearsed in BEGIN/ROLLBACK with lock_timeout 5s / statement_timeout 30s; verified candidate tables empty, dropped/recreated only these local candidate objects within the rolled-back transaction. Exit 0; 221ms including Docker/psql startup, not a production lock estimate. Applied revised guards only locally afterward; no fake migration ledger. Postflight: all three tables RLS true, service SELECT only and no anon/authenticated reads; all five function signatures/grants/pinned paths verified.

## Release / rollback / staff handoff

Exact production migration approval still required after current CI and independent review. Preflight must recheck catalog, signatures, grants/RLS, reviewed checksum and restricted CurrentUser-DPAPI backup. No blind db push or historical ledger changes. Sequential merge remains behind #156's unresolved Auth concurrent OTP test, despite this slice's independent readiness. Payment/recovery delivery/new media cron remain disabled.

Rollback removes access/reverts app while retaining assignments, operations, per-item results and audit facts. Do not drop additive tables or blindly undo assignments after later edits. Never restore an older DB snapshot over newer history. Staff: select profiles/reviewer, inspect stored before/after and exclusions, explicitly confirm, apply bounded batches, inspect/download results, and use read recovery after uncertain response. Re-preview after conflicts/expiry; reviewer assignment is not identity approval. Actual hosted role journeys, notification/provider sandbox and activation remain not-run.

## Independent review follow-up

Read-only reviewer examined full SQL/HTTP/UI around cf09870b and found one P2: mount GET(A) could overwrite a newer preview(B) after B had already replaced the saved ID. No further actionable SQL/HTTP/security findings. Delayed-GET browser regression was red at all three widths (recoveryBlocksPreview=false; exit 1). Mount read now sets busy and clears it in an active-guarded finally; regression and all earlier browser scenarios pass at all three widths (exit 0). SQL/checksum unchanged. Reviewer specifically checked actor/reviewer locks, duplicate apply, profile/version conflicts, audit rollback, interrupted response, permissions and operation bounds. Final current-head CI is required after this follow-up.

Final review follow-up: reviewer closed P2 at a05d7e64; no remaining actionable findings. Integrated repeat: 2993 pass / 109 skip / 0 fail, 9309 assertions, 533 files, 27.84s / exit 0. Typecheck/lint/build repeated after both recovery fixes, all exit 0; lint still 52 warnings. SQL unchanged. New current-head CI pending.

## Lock-expiry follow-up — 2026-10-01 HKT

Base `39a2efc0d265ece0f8224fe9469be951696e41a7`; repair `8642518e3372e4a31d86dec7fd5077c05af82473`. The transaction-start `now()` expiry guard accepted a snapshot that expired while apply waited for operation/profile/assignment row locks. Real regressions now hold each unchanged row in a separate backend, observe the apply backend blocked while the snapshot is live via `pg_blocking_pids`, keep the lock until database `clock_timestamp()` passes expiry, and then release. Baseline RED: all three applies incorrectly succeeded, returning no P0001; 4 existing tests passed / 3 new tests failed / 39 assertions / exit 1. No SQL was edited before this RED run.

The apply RPC checks `pg_catalog.clock_timestamp()` after operation/reviewer locks and again after final profile/assignment locks, before assignment, durable item result or audit writes. Actor/reviewer shared Auth/admin locks, immediate FOUND checks, per-item revision/version checks, conflict/skip behavior, durable idempotency and audit atomicity are preserved. GREEN proves P0001 and exact equality of the complete profile/assignment/item/audit state for all three lock waits. Existing HTTP maps P0001 to409; route source and existing HTTP tests checked, with no HTTP change. No UI change or browser rerun in this SQL-only repair.

| Actual command | Environment | Result / exit |
| --- | --- | --- |
| `bun test src/lib/volunteers/directory/reviewerBulk.database.test.ts` (RED) | VOLUNTEER_REVIEW_BULK_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:52322/audit_pr135_20260929; VOLUNTEER_REVIEW_BULK_TEST_ALLOW_LOCAL_FIXTURES=1 | 4 pass / 3 fail / 39 assertions; 10.57s / 1 |
| `bun .superpowers/sdd/HKSCDA_Codex_GPT6_Sol_Implementation_Plan_2026-09-27_zhHK/task-160-rehearsal.ts` | Exact disposable schema clone above, PostgreSQL17.6; empty candidate tables protected with ACCESS EXCLUSIVE NOWAIT | Full candidate BEGIN/ROLLBACK catalog/signature/grants/RLS/index rehearsal; original catalog and ledger count restored; only apply RPC replaced locally afterward / 0 |
| `bun test src/lib/volunteers/directory/reviewerBulk.database.test.ts src/lib/volunteers/directory/reviewerBulk*.test.ts` (GREEN) | Same guarded fixture opt-in | 7 pass / 0 fail / 42 assertions; 10.61s / 0; literal wildcard added no files |
| `bun test --isolate --timeout 30000` (initial full run) | CHECKOUT_POLICY_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:57322/postgres; SUPABASE_LOCAL_URL=http://127.0.0.1:52321; reviewer fixture env above | 2999 pass / 105 skip / 1 fail / 9351 assertions / 533 files; 49.65s / 1. Sole failure: `reviewed migration manifest checksums match canonical LF SQL`; required candidate manifest checksum then updated |
| `npm.cmd run typecheck` (initial) | Strict local TS | 2; new test's lock-release callback possibly undefined (TS2722). Guaranteed initialized callback invocation annotated and rechecked |
| `bun test src/lib/volunteers/directory/reviewerBulk.database.test.ts src/lib/auditRemediationManifest.test.ts` | Same fixture opt-in | 7 pass / 42 assertions / 0 fail; 10.45s / 0. Second path did not exist; exact manifest test run below |
| `bun test src/lib/operations/migrationManifest.test.ts src/lib/supabaseMigrations.test.ts src/routes/api/admin/volunteers/reviewer-bulk.test.ts` | Local source checks | 51 pass / 0 fail / 694 assertions; 240ms / 0 |
| `bun test --isolate --timeout 30000` (final full repeat to close checksum failure) | Same common local and reviewer fixture env | 3000 pass / 105 skip / 0 fail / 9351 assertions / 533 files; 32.87s / 0 |
| `npm.cmd run typecheck` (final) | Strict local TS | 0 |
| `npm.cmd run lint` | Full configured lint | 0; 52 existing warnings |
| `npm.cmd run build` | VITE_SUPABASE_URL/SUPABASE_URL=http://127.0.0.1:54329; VITE_SUPABASE_ANON_KEY=ci-placeholder-anon-key; SUPABASE_SERVICE_ROLE_KEY=ci-placeholder-service-role-key | 0; generated route tree unchanged; no preview/deploy |
| `git diff --check`; exact fixture census | Owned diff and disposable clone | 0; users/profiles/operations/items/assignments all zero |

Revised exact candidate `20260927181701_volunteer_review_bulk.sql` canonical LF SHA-256: **96149a16e41cdf9fdf2e246b700033877fc91c3c00403a2b2efcd39d12cb3164**. Only this undeployed candidate hash changes in migration-manifest.csv; the earlier hash/evidence above remain historical. Whole migration rehearsal verified all three tables RLS enabled, service SELECT only, no anon/authenticated table reads or function execute, both indexes, five exact signatures and empty definer search paths. It acquired exclusive candidate-table locks before checking emptiness and used no CASCADE, ledger insertion, production DDL or production data. Fixture setup is synthetic with generated UUIDs and example.invalid emails; rollback or exact-ID cleanup leaves the clone empty.

Self-review: expiry guards contain no SELECT/PERFORM that could disturb FOUND, and execute before any result mutation. Assignment lock regression starts with a distinct reviewer and asserts version/reviewer/timestamps unchanged. Existing concurrent duplicates still produce one audit, revoked roles still reject, and 1000-item partial outcomes remain covered. Updated only ADMIN-04 in both34-row trackers. Root will independently review and propagate predecessors; no push/merge performed here. This is source/schema ready only in isolation. Exact production checksum approval, current-head remote CI, provider/staff UAT and operational enablement remain pending; 105 skipped tests are not passes.

Raw logs and reproducible local rehearsal script are beside `task-160-report.md` under the ignored `.superpowers/sdd/HKSCDA_Codex_GPT6_Sol_Implementation_Plan_2026-09-27_zhHK/` task directory. The shell's default helper initially failed startup with deny-read ACL setup; authorized escalated shell calls worked. No automatic approval rejection occurred.

## Independent repair review and final predecessor integration, 2026-10-01 HKT

Repair source8642518e/evidencedf21c588 passed independent task review: spec-compliant and quality approved, no blocking findings. The root resolved unchanged-contract limits by checking the15-minute snapshot default, actor/reviewer Auth/admin FOR SHARE guards, owner-bound operation read, server-only auth/bounded JSON imports and the prior actual role/idempotency/audit tests; the combined enabled tests below reconfirm them. The P0001→HTTP409 mapping remains unchanged.52 existing lint warnings, route-test discovery build warnings and an expected error-handler test log are retained as known validation noise, not pristine output or a passing release claim.

Integration `3f6cb8a596cd9c9478458bd942273820865cbb14` brings reviewed supporter #156/#157 and repaired CRM #159472ccf32 into this branch. Six documentation/manifest conflicts required history-preserving resolution; the criss-cross virtual base contained prior tracker conflict rows. Both final trackers retain34 unique issue IDs; newer verified #155 main SUCCESS in36624781016 was preserved over an older pending PERF-01 cell, and current CRM-01 deployment facts were retained. No source conflict occurred. The reviewed #160 SQL/regression files matchdf21c588 byte for byte; the combined route tree retains both supporter recovery and reviewer bulk endpoints.

| Command | Actual result / exit | Environment |
| --- | --- | --- |
| `bun test --isolate --timeout 30000` |3050pass/97skip/0fail/9556assertions/536files/74.89s /0 | Bun1.3.14; checkout57322, Auth52321, guarded supporter/CRM/volunteer clone52322 |
| `bun run typecheck` |0 | Strict TypeScript, combined source |
| `bun run lint` |0errors/52existing warnings /0 | Configured full lint |
| `bun run build` |0; generated route tree unchanged | Exclusive serial loopback54329/ci-placeholder build |
| Clone fixture census | users/admins/supporters/profiles/assignments/operations/items all0 /0 | Dedicated synthetic clone only |

An earlier combined test invocation was accidentally started after the guarded documentation resolver had stopped at an unexpected PERF-01 evidence conflict. It was interrupted (exit1/ABORTED), not counted as a completed suite. Its three generated Auth IDs and one profile/operation/item remained; ID/email/creation-time/display-name/filter guards and a transaction removed only that recorded fixture. The initial census used an incorrect admin_account table name (42P01/exit1); the verified admin_user census then confirmed cleanup to0. Conflicts were resolved before the completed full suite above; that suite and all final source gates exited0 and its final census was0. No production fixture/reset/data mutation occurred.

After testing, #15909e7a7a3 adds only actual #158 release and approved production schema documentation; integration into this branch changes no src/scripts/supabase/workflow bytes from3f6cb8a5. #158 main d5073404 has all five gates SUCCESS in36753543456 and alias READY atdpl_VZuwYqmufqEKZTkvPBCPqoxxNppo; actual main releases25/46. #159 schema is already applied as20260930180311 (ledger98) after separate explicit approval, while its new exact-head CI/merge remains pending. [Actual execution, backup and rollback](sequential-execution-20261001.md).

#160 exact candidate SHA remains96149a16e41cdf9fdf2e246b700033877fc91c3c00403a2b2efcd39d12cb3164. This slice is code-complete and schema-ready in isolation; production approval/application, fresh exact-head five CI gates and predecessor sequential main release remain required. #160 deployed=no/operationally-enabled=no.97 skipped cases, new hosted real-staff/private-file UAT, provider activation, full backup restore and new same-environment production performance remain not-run. UI code is unchanged by the expiry repair, so earlier captures remain historical and were not rerun. Preserve assignment/results/audit on rollback; no mass qualification/status changes, payment, real notifications or new schedules.

## Exact-blocker proof follow-up — 2026-10-01 HKT

Exact follow-up base `9d1feed9e560bb89e0d066b761558cb6864a55fc`; test-only source `2a87fc907d2a7c9d29ee51286e13bc710b6f3cc9`. The original three regressions proved a live blocked apply and rejected writes after expiry, but their observer counted any blocker and did not explicitly prove that the held locker still blocked apply after expiry. This bounded evidence correction captures `pg_backend_pid()` **inside the held-lock transaction**, then requires that exact PID in `pg_blocking_pids(applyPid)` both while live and after the database clock passes expiry, before releasing the unchanged row. The existing complete profile/assignment/item/actor-audit snapshots and exact fixture cleanup remain unchanged. Original repair8642518e is retained; no SQL guard, API, UI, grant or manifest change.

Root held the DB/build slot for #165 combined gates. During that hold only the owned observer test and ignored helper were prepared; no DB query/test/build/SQL replacement ran. After explicit slot release, the guarded helper temporarily replaced only the local apply function with the exact original39a2efc0 implementation, ran the three tightened regressions, and restored the exact reviewed definition in `finally`. It compared all captured non-system function definitions/owners/ACL/config, schema/relation/column/default grants, RLS/policies, constraints/indexes/triggers, roles/memberships, complete migration-ledger rows, full audit rows and fixture state before/after. All guards matched, including **all9 inherited audit rows**; no global audit deletion, reset, fake ledger or CASCADE.

| Actual command | Result / exit | Environment / evidence |
| --- | --- | --- |
| `bun .superpowers/sdd/HKSCDA_Codex_GPT6_Sol_Implementation_Plan_2026-09-27_zhHK/task-160-proof-followup.ts` | 0 | Authorized52322/audit_pr135_20260929 clone; source/definition guard before temporary replacement; RED/restoration/GREEN/handler and final equality checks |
| Helper RED subprocess: `bun test src/lib/volunteers/directory/reviewerBulk.database.test.ts --test-name-pattern 'reviewer bulk rejects expiry while waiting'` | 0pass/4filtered/3fail/9assertions;9.32s /1 expected | Original39a2efc0 apply; all three fail at expected missing P0001 after exact-live and exact-expired blocker assertions pass |
| Helper GREEN subprocess: `bun test src/lib/volunteers/directory/reviewerBulk.database.test.ts src/routes/api/admin/volunteers/reviewer-bulk.test.ts src/lib/operations/migrationManifest.test.ts` | 11pass/0fail/60assertions;12.07s /0 | Reviewed96149 apply restored;7real DB tests plus3existing handler tests and manifest check |
| Ignored actual-handler fixture inside helper | Real SQL P0001→HTTP409; `cache-control:no-store`; expected body; rollback and full guards equal /0 | Actual application handler; Bun SQL errno adapted only to the PostgREST `{code}` error envelope; no hosted PostgREST claim |
| `npm.cmd run typecheck` | 0 | Strict current source; task-160-proof-followup-typecheck.log |
| `bunx eslint src/lib/volunteers/directory/reviewerBulk.database.test.ts` | 0; no warnings | Sole changed test; task-160-proof-followup-lint.log |
| `bun test --isolate --timeout 30000` (one current-source full run) | 3040pass/107skip/0fail/9493assertions/536files;75.03s /0 | CHECKOUT_POLICY_TEST_DATABASE_URL loopback57322/postgres; SUPABASE_LOCAL_URL52321; reviewer fixture opt-in52322; supporter/CRM fixture env not enabled in this follow-up |
| `bun .superpowers/sdd/HKSCDA_Codex_GPT6_Sol_Implementation_Plan_2026-09-27_zhHK/task-160-proof-followup.ts --verify-only` | 0 | Read-only postflight equals saved full guard hashes/counts; all9audit rows and empty ledger preserved; users/admins/profiles/assignments/operations/items0 |
| `git diff --check`; migration blob/canonical checksum | 0; blobc9c50ca952d575727893a610a71955c10745153c identical at base and source head | Canonical LF SHA25696149a16e41cdf9fdf2e246b700033877fc91c3c00403a2b2efcd39d12cb3164 unchanged |

Inherited **whole exact96149 migration rehearsal**, full configured lint/build and earlier browser evidence are explicitly reused, not newly rerun for this test-only observer correction. No production/bundled source changes justify another build or schema rehearsal. Prior52lint warnings, route-test build discovery warnings and expected unrelated error-test log noise remain recorded; this follow-up's changed-file lint is clean and107skips are not passes. The helper, raw logs with actual exit statuses and hash/count guard summary are ignored local evidence beside `task-160-proof-followup-report.md`. Root received DB/build slot release after final guarded cleanup. Both34-row trackers change only ADMIN-04 test metadata. Scoped rereview, new exact-head remote CI and exact96149 production approval remain root-owned and pending; deployed/operationally-enabled are not advanced.
