# PR #161 adoption assignment bulk — sequential verification, 2026-09-30 HKT

## Scope / state

Integrated baseline e93a9491; primary repair d87311abb611979149c40088f320f673fc08216e; final code a5d3c751539e0a5aae7ada41aa733fb83486003e. Assign an active staff/admin owner to selected open adoption cases in one eligible stage, optionally after a minimum waiting period. No approval, match, case status or notification changes. ADMIN-04 remains partial across domains. Code complete and isolated schema ready; production schema absent, not deployed, not operationally enabled. Independent reviewer closed the one P2 after the final repair. Exact current-head remote CI remains required.

## Failure-first repairs

- Malformed JSON returned 503: API red 2 pass / 1 fail / exit 1. Explicit InvalidRequestJsonError returns 400, retaining 413/no-store.
- Actor/assignee authorization and stage eligibility could change between check and transaction commit. Candidate installed only on the schema-only local clone; baseline DB 3 pass / 2 fail / exit 1 demonstrated actor disable and stage closing committing mid-apply. Authoritative Auth/admin row pairs and the stage now hold shared locks through commit. Subsequent case validation uses the locked stage result; case version and current stage/age/open state remain checked.
- Failed mount GET deleted the saved operation ID; slow GET could overwrite a newer preview. Before browser run failed at all three widths. Preserve ID, provide read retry, and block newer actions until active-guarded read completion. Assignee and waiting controls stay disabled during requests.
- Independent reviewer found the default animal filter passed animalType=all into bulk pagination while the normal list omitted it. Added mixed cat/dog two-page selection regression: 11 pass / 1 fail / 22 assertions / exit 1. Shared builder now omits the all sentinel; green 12 pass / 23 assertions / exit 0. Reviewer closed P2 at a5d3c751; no other actionable SQL/API/UI findings.

## Commands and actual results

| Command | Environment | Result / exit |
| --- | --- | --- |
| `bun test --isolate --timeout 30000` | CHECKOUT_POLICY_TEST_DATABASE_URL 127.0.0.1:57322/postgres; SUPABASE_LOCAL_URL 127.0.0.1:52321; a5d3c751 | 3000 pass / 115 skip / 0 fail; 9347 assertions; 536 files; 29.24s / 0 |
| `npm.cmd run typecheck` | Strict TS on a5d3c751 | 0 |
| `npm.cmd run lint` | Full configured lint on a5d3c751 | 0; 52 existing warnings |
| `npm.cmd run build` | Synthetic keys, loopback 54329; integrated 1340d8ee | 0; repeated on final a5d3c751 also exit 0 |
| `bun test src/lib/adoptions/assignmentBulk.database.test.ts` | ADOPTION_ASSIGNMENT_BULK_TEST_ALLOW_LOCAL_FIXTURES=1 and exact 52322/audit_pr135_20260929 clone | 6 pass / 38 assertions / 0 fail; 1373ms / 0 |
| `bun test src/lib/adoptions/assignmentBulkSelection.test.ts src/components/admin/adoptions/caseWorkflowLogic.test.ts` | Final code, no database | 12 pass / 23 assertions / 90ms / 0 |
| `node scripts/verify-adoption-assignment-bulk-review.mjs` | Actual component, synthetic API, loopback 56560 | 390/768/1366px; exit 0; zero Axe/page errors; no overflow incl 200% zoom at 768 |
| Exact full SQL in BEGIN/ROLLBACK | Schema-only clone; 1000 synthetic pre-column cases | 256ms including process startup / 0 |

DB coverage: actual service_role RPCs, actor and assignee disable/Auth ban locks, stage-close lock, expiry, minimum age, stale version, closed cases, audit rollback, duplicate concurrent apply with one audit, and actual anon/authenticated denial. The 1000-item snapshot gives 100 already-assigned skips, 898 successes, one conflict and one newly closed skip; retry adds no audit. Initial pre-schema run failed 0 pass / 5 fail for absent RPCs, before fixture setup; no residue. Final aggregate local counts: zero cases, operations, items and Auth users. No production data copied.

Browser screenshots: ui/t23-adoption-assignment-bulk-{before,after}-{390,768,1366}.png. Verified saved read recovery, mount race fencing, interrupted apply after ten writes then exactly 25 total writes after retry, CSV, 1000-item pagination (25 rows/40 pages), explicit reset, keyboard selection and zoom. Browser server stopped. This is a synthetic API fixture, not hosted staff UAT. Full-suite skips are not passes. Local public brand/performance, hosted test identities/private-file journeys, provider sandbox and notification tests not-run for this slice.

## Exact migration / backfill / compatibility

`20260927183000_adoption_assignment_bulk.sql`, canonical LF SHA-256 **300e48d272ca1256bd2081e185c64adc29688a2dcc23641e5266c5baa76e62f1**. Only an undeployed candidate was corrected; historical deployed SQL and ledgers unchanged.

Adds adoption_case.bulk_row_version bigint NOT NULL DEFAULT 1 plus a monotonic BEFORE UPDATE trigger, two operation/result RLS tables, two indexes, three public service-only RPCs and two private guards. All five definer functions have empty search_path and deny anon/authenticated execution. Tables permit service SELECT, deny direct INSERT/UPDATE and anon/authenticated reads. Existing case updates increment the version; the independent reviewer checked compatibility with the existing updated_at trigger. Timestamp equality is not used as the sole stale-write fence.

Full SQL rehearsal verified the local candidate had no rows, then dropped only candidate objects inside BEGIN, seeded 1000 synthetic old-shape cases and re-created the entire schema. All 1000 became version 1; canonical hash of every old field stayed unchanged. One update produced 999 version-1 rows and one version-2 row. ROLLBACK restored the prior local schema/data. Corrected definitions were applied only to this local clone for tests; no fake ledger entry. Timing is not a production lock estimate.

Production read-only inventory: ledger 95, six adoption cases, adoption_case RLS enabled; new version column, operation tables and RPC absent. Expected production backfill is six version-1 values; other case fields must be verified unchanged. Exact approval and fresh catalog/signature/grants/RLS/checksum/backup preflight are required before any production DDL.

## Release / rollback / staff handoff

Sequential merge remains behind #156's actual isolated Auth concurrent OTP failure. Main/production remain 24196faf027998388eff3196a6979e23566e2443 (#155); main CI 36624781016 five green and production alias READY. #159 exact 94253641 CI 36626877044 and #160 exact 39a2efc0 CI 36627282399 now have all five gates green. Their production schemas remain unapplied; exact approval requests are pending. #157's exact migration is already approved but waits for predecessors.

Before release, recheck restricted CurrentUser-DPAPI backup inventory/checksum, lock budget and all catalog/row invariants. Backup has no Storage bytes and full restore was not run. No blind db push, fake ledger, payment/notification/schedule activation or real case mutation.

Rollback disables the new API/UI and reverts the app while retaining the additive version, trigger, operations, results and audit history. Do not drop version history or restore an older snapshot over newer adoption/payment/audit facts. Staff choose one eligible open stage, waiting period, case scope and owner; inspect stored before/after/exclusions, explicitly confirm, apply bounded batches and download results. After uncertain response recover/read the stored operation; re-preview conflicts/expiry. Assignment does not approve adoption. Hosted staff UAT and production release verification remain pending.

Exact-head remote follow-up: a29d657c54e717243d909d49cfefb02b02343f9c, CI 36629148497, verify/rls-matrix/brand-verify/a11y-verify/performance-verify all SUCCESS. Exact production migration approval requested; sequential release waits for #156.

## Task161 held-lock expiry repair — 2026-10-01 HKT

Independent base `a29d657c54e717243d909d49cfefb02b02343f9c`; verified source commit `0883d3ac0255164feba416503c43fe5099ed2c77`. The original candidate used transaction-start now() across locks. Two parameterized real-lock regressions (operation and adoption_case) started apply while live, proved backend blocking via pg_blocking_pids, retained the unchanged blocker until database clock_timestamp proved expiry, then released it. RED received no P0001 because both applies wrongly succeeded. The repaired apply uses pg_catalog.clock_timestamp() after operation/actor-assignee locks and immediately after final entity locks, before any assignment/classification/result/audit write. FOUND, authoritative Auth/admin FOR SHARE, eligible-stage locks where applicable, durable idempotency, partial results and atomic editorial command/audit are preserved. No API/UI behavior change except rejection of expired work.

| Actual command | Actual result / exit | Raw local log |
| --- | --- | --- |
| `bun test src/lib/adoptions/assignmentBulk.database.test.ts` before SQL edits | RED 6 pass / 2 fail / 46 assertions / 5.98s; exit1 | task-161-red.log |
| `bun .superpowers/sdd/HKSCDA_Codex_GPT6_Sol_Implementation_Plan_2026-09-27_zhHK/task-161-rehearsal.ts` | Whole exact SQL BEGIN/ROLLBACK then clone-only apply replacement; exit0 | task-161-rehearsal.log |
| `bun test src/lib/adoptions/assignmentBulk.database.test.ts src/routes/api/admin/adoptions/assignment-bulk.test.ts src/lib/operations/migrationManifest.test.ts src/lib/supabaseMigrations.test.ts` | GREEN 59 pass / 0 fail / 753 assertions / 4 files / 7.56s; exit0 | task-161-green.log |
| `bun test --isolate --timeout 30000` final source | 3008 pass / 109 skip / 0 fail / 9401 assertions / 536 files / 44.21s; exit0 | task-161-full-test.log |
| `npm.cmd run typecheck` | strict TS exit0 | task-161-typecheck.log |
| `npm.cmd run lint` | exit0; 52 existing warnings; 0 errors | task-161-lint.log |
| `npm.cmd run build` exclusive serial placeholder build | exit0 | task-161-build.log |
| `git diff --check` and exact fixture census | exit0; all scoped fixtures0 | task-161-census.log |

All raw logs/helpers/full report live in this worktree's `.superpowers/sdd/HKSCDA_Codex_GPT6_Sol_Implementation_Plan_2026-09-27_zhHK/`; ignored local evidence is retained for root review. RED/GREEN uses only `ADOPTION_ASSIGNMENT_BULK_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:52322/audit_pr135_20260929` with `ADOPTION_ASSIGNMENT_BULK_TEST_ALLOW_LOCAL_FIXTURES=1`. Full suite adds CHECKOUT_POLICY_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:57322/postgres and SUPABASE_LOCAL_URL=http://127.0.0.1:52321. Build uses VITE_SUPABASE_URL/SUPABASE_URL=http://127.0.0.1:54329, ci-placeholder-anon-key and ci-placeholder-service-role-key. Root explicitly released exclusive DB/build slot before execution.

The new checks raise P0001. Exact unchanged entity/revision/publication/assignment and pending item/applied_at/audit comparisons pass; each captured real SQL errno is adapted to the existing PostgREST code shape and fed through the actual handler, which returns HTTP409 with no-store/Preview expired. This handler verification does not claim a live PostgREST request. Fixtures are synthetic UUIDs/example.invalid and exact cleanup or rollback; no reset/db push/CASCADE or fabricated ledger.

Whole candidate rehearsal locks candidate tables before confirming emptiness, executes all exact SQL and verifies exact signatures, pinned empty search_path, grants, RLS and indexes. Rollback restores definitions/catalog/grants/RLS and **all ledger rows**, then only the apply RPC is replaced in the disposable clone. Historical approved/deployed migrations untouched. Canonical LF SHA256 for `20260927183000_adoption_assignment_bulk.sql` is **cd14343255b0e9c5901beed3952de6da03bcade1e56284994f5edc7e92cce238**; only this candidate's manifest entry changed. Any old exact approval covers old bytes only; exact new approval remains root-owned.

The full rehearsal also locks adoption_case, seeds1000 old-shape cases after removing only candidate column/trigger in the transaction, proves every old-field hash unchanged after exact migration, version1/NOT NULL/default1 on1000 rows, then999 version1/one version2 after one update. Rollback restores prior column/trigger/index/data/catalog.

Self-review: minimal two-check SQL diff contains no SELECT/PERFORM in either new guard; FOUND semantics preserved. Existing auth/version/eligible-stage/idempotency/audit/1000-item tests retained and passing. Both trackers remain34rows with only ADMIN-04 changed for local code-complete/schema-ready slice. Prior UI evidence retained; new browser/provider/production measurements not-run. No production reads/writes/DDL, external provider, real notifications/payments/refunds, public preview, predecessor propagation, remote push/merge or subagents. Independent review, root integration/current remote CI and exact new production approval pending. Full-suite skips are not passes; existing lint warnings are not regressions.


## Root combined-source verification and independent review — 2026-10-01 HKT

Independent task-scoped review approved Task161, Task162 and Task164: spec compliant, quality approved, no Critical/Important findings. The exact Task161 package was BASE a29d657c54e717243d909d49cfefb02b02343f9c through96d4926b2b5ed1155fca89ecae85460ac669b9f7; its source repair0883d3ac0255164feba416503c43fe5099ed2c77 remains byte-identical after merging reviewed predecessor #160 head9d1feed9e560bb89e0d066b761558cb6864a55fc. Seven documentation conflicts were resolved by preserving historical blocks and merging unique CSV rows; no code conflict. Both trackers retain34unique rows; manifest51rows. #159/#160 exact new hashes15ca57d1/96149a16 and #161 cd143432 remain verified.

Root ran the final combined source once with CHECKOUT_POLICY_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:57322/postgres, SUPABASE_LOCAL_URL=http://127.0.0.1:52321, and SUPPORTER_PORTAL/CRM_TAG_BULK/VOLUNTEER_REVIEW_BULK/ADOPTION_ASSIGNMENT_BULK test database flags set to the disposable schema-only clone127.0.0.1:52322/audit_pr135_20260929 with all four ALLOW_LOCAL_FIXTURES=1. No production fixtures/provider calls. Source inherited role/shared-lock/version/server-only/snapshot contracts and their existing tests remain intact; the bounded review does not independently certify all unchanged global behavior.

| Command | Environment / actual result | Exit |
| --- | --- | --- |
| bun test --isolate --timeout30000 (actual argument --timeout 30000) | Combined source:3065pass97skip0fail9648assertions539files92.45s | 0 |
| bun run typecheck | Strict tsc --noEmit | 0 |
| bun run lint | 0errors;52existing warnings | 0 |
| bun run build | Exclusive serial build; loopback54329 and CI placeholder keys; generated route map unchanged | 0 |
| git diff --check / own SQL+test diff against96d4926b | No whitespace/unresolved/source-repair change | 0 |
| bun private census-pr161-combined.ts | Auth/admin/supporter/volunteer/CRM/adoption12scoped table counts all0 | 0 final |

Raw logs are retained beside the scoped task report as task-161-root-integration-{full-test,typecheck,lint,build,census-final}.log. The first read-only census mistakenly assumed this clone also contained private.supporter_recovery_challenge and exited1/42P01. The exact migration confirms that table name, but this clone lacks the separate recovery-broker schema. The final census explicitly records to_regclass=NULL; this is **not** a passing recovery DB test. No schema mutation/cleanup was performed. Historical recovery-broker isolated evidence remains separate; skipped suites remain skipped. New live PostgREST, hosted staff/mobile/private-file UAT, UI screenshots, production timing/provider/sandbox measurements and notifications are **not-run** for this SQL-only repair. Prior UI evidence is retained.

Current predecessor releases: #159 actual main07e4c881863b715342ed0757aad7bd691a272738, mainCI36758558621 all5SUCCESS, Vercel READY dpl_D6goofbM7umWWoTqQVGtBxHzkvVP. #160 exact head9d1feed9 has all5 PR gatesSUCCESS in36757267257 and waits for its named single production migration approval. #161 remains code-complete and locally schema-ready; new exact changed-byte production approval, fresh catalog/backup, exact remote PR CI, predecessor main gates and deployed verification are separate pending gates. Payments/new delivery schedules remain off. Existing backup/restore/Storage limitations and additive rollback boundaries remain as recorded. This appendix is a checkpoint, not a new deployment claim.

## Root approval scope ruling — 2026-10-01 HKT


Ruling: the human's explicit approval naming only20260927183000_adoption_assignment_bulk.sql remains operative for #161's unchanged schema/grants/backfill scope — the approval question named the file, six version1values, restricted assignment RPC and unchanged assignees, and did not bind approval to a printed SHA256. The user separately authorized fixes and sequential green-only releases. Exact a29d657c→0883d3ac SQL diff contains only replacement of transaction-start now() with wall-clock clock_timestamp() and one stricter expired-operation rejection after the case lock. No DDL/signature/grant/trigger/backfill/action scope expands. Requiring repeat approval for the same authorized action would contradict persistent authorization. Cost if wrong: production would install stricter denial behavior under the approved additive schema; no new mutation domain is authorized. Updated canonical hashcd14343255b0e9c5901beed3952de6da03bcade1e56284994f5edc7e92cce238 and RED/GREEN/rehearsal are disclosed. Keep predecessor #160 approval/main gates, fresh backup/catalog, exact latest remoteCI and postflight mandatory. If automatic approval review rejects application, report that specific reason and ask about the blocked operation rather than bypass it.
