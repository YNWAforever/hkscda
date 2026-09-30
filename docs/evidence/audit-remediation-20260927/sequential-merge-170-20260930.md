# PR170 sequential release preparation — 2026-09-30

## Scope, source and state

Final integrated application `a50a09f581f7862ebf9ba2fdde53d58cdf65a307`, reviewed fixes `2c454fe27b52cb409ca61364c65be8c34169a106`; predecessor #169 `dd17c5fbf878f51754e7f844f659bc853269a907`. Historical `t23-sponsorship-bulk.md` preserved. This slice assigns sponsorship follow-up ownership with snapshot→preview→per-item permission/version check→apply→result. No payment/proof approval, refund, notification or identity merge. Code-complete: this slice; schema-ready: isolated only; production approval/application pending; deployed:no; operationally-enabled:no. ADMIN-04 remains partial for later T23 workflows and hosted UAT.

## Six reproduced fixes

- A transient recovery GET deleted the session's operation ID. Retain the ID, expose a read-only retry and show a safe error.
- Mount recovery ran while a new preview was enabled; a late old response could replace the newer preview. Recovery now holds busy state and disables the assignee/preview controls.
- Preview completion after unmount wrote stale recovery storage. Mounted guard prevents late persistence.
- Select-all checked only filter string equality. Filter needs_followup→all→needs_followup restored25 obsolete selections in actual browser (reviewer callback reproduction100). Monotonic generation rejects any intermediate scope change.
- Mobile checkbox click bubbled into card navigation, opening the detail drawer. Stop propagation as in desktop selection.
- Malformed JSON returned503; InvalidRequestJsonError now400/no-store before any mutation.

Unit red2pass/4fail/17assertions,exit1; green6pass/20assertions,exit0. Browser red390px drawer1 and both390/1366 selected25 after filter round trip; fixed drawer0 and selected0 at both widths. Browser first used incorrect translated option text and timed out; corrected to actual `需要跟進` label before the valid red reproduction. Independent reviewer closed all six findings, no remaining scoped P1/P2. Exact SQL unchanged.

## Executed gates

| Command | Environment / source | Actual result / exit |
| --- | --- | --- |
| four focused DB/selection/lane/API files | integrated baseline; explicitly enabled local clone |12pass/48assertions,537ms /0 |
| recovery+API focused regression | repaired source2c454fe2 |6pass/20assertions,243ms /0 |
| `bun test --isolate src/lib/sponsorshipAdmin/followupBulk.database.test.ts` | final service_role and two-connection concurrency tests;52322/audit_pr135_20260929 |4pass/22assertions,275ms /0 |
| `bun scripts/verify-sponsorship-bulk-migration.ts` | named empty local production-schema clone; synthetic data only |exact full SQL,2 existing synthetic rows unchanged,12.19ms;1000 preview51.41ms;900 pending apply948.87ms;897success/101skip/2conflict;897 assignment audits;retry no duplicate;rollback,0 rows /0 |
| `bun test --isolate --timeout 30000` | finalappa50a09f581f7862ebf9ba2fdde53d58cdf65a307;CHECKOUT_POLICY_TEST_DATABASE_URL=loopback57322/postgres;SUPABASE_LOCAL_URL=http://127.0.0.1:52321 |3074pass/141skip/0fail,9628assertions,556files,19.97s /0 |
| `npm.cmd run typecheck` | final integrated app |0 |
| `npm.cmd run lint` | reviewed source2c454fe2 before final manifest-only merge |0;52warnings; no full local rerun after catalog-only integration |
| `npm.cmd run build` | finalapp;synthetic VITE_SUPABASE_URL/ANON_KEY/PUBLISHABLE_KEY,SUPABASE_URL/SERVICE_ROLE_KEY,loopback54329 |0 |
| `node scripts/verify-sponsorship-bulk-selection.mjs` | actual PledgeReviewLane,synthetic reads,390/1366 |mobile click stays in list;filter roundtrip leaves0 stale selections /0 |
| `node scripts/verify-sponsorship-bulk-review.mjs` | actual bulk panel,loopback56568,synthetic interception,390/768/1366 |recovery retained/retry available;25writes after partial failure;1000preview40pages/25visible rows;keyboard,CSVdownload,Axe0/errors0/nooverflow /0 |
| same script `--before` with SPONSORSHIP_BULK_BEFORE=1 server | originalpanel03dd2c26,identical fixture |3width baseline reproduces savedID loss/no retry; baseline assertions /0 |

Full suite before catalog-only merge was3074pass/141skip/9627assertions/32.79s; final suite adds the picker requirement assertion. Skips are not passes. Test URL guard allows only PostgreSQL127.0.0.1:57322/postgres or52322/audit_pr135_20260929 with no query/hash and explicit SPONSORSHIP_FOLLOWUP_BULK_TEST_ALLOW_LOCAL_FIXTURES=1.

SQL roles tested with actual SET LOCAL ROLE service_role, including disabled actor, banned assignee, expired preview,1001 rejection, stale versions/status, competing snapshots, atomic audit failure and browser grants/RLS denial. Two concurrent requests for one item return the durable succeeded result twice but create only one assignment, one result audit, one preview audit, version2. Exact fixture IDs are cleaned in finally; transaction-only drills roll back.1000-row drill has100 initially ineligible,1 deleted,2 changed after preview;897 successful items retain original amount. No real row imported and no ledger fabricated.

UI before/after `ui/t23-sponsorship-bulk-{before,after}-{390,768,1366}.png`;mobile `ui/t23-bulk-checkbox-{before,after}-390.png`. Test provider responses intentionally interrupted after10 of25writes, then recovered15pending and completed25 total. New1000preview resets confirmation, paginates40pages, and renders25rows at once.768px also checked200%zoom. Browser exports a synthetic CSV; private production export/session journey remains not-run. All temporary servers stopped. Standalone image viewer helper unavailable; browser/Axe verified the generated UI artifacts. Timings above are one current local rehearsal, not a before/after performance improvement. Hosted staff/browser/full private-file UAT, provider transaction/sandbox and deployment: not-run for this slice.

## Exact migration and compatibility

`20260928080000_sponsorship_followup_bulk.sql` LF SHA256 `d70e5fc37a71a34a7513ee27b435e0f38585bf4ed314626212bb3f3032c2ffec` unchanged. Adds2 private-by-grants/RLS snapshot tables,2indexes,3 public service_role RPCs and one inaccessible private Auth/role helper. Preview valid15minutes; each API apply processes at most25 pending snapshot items. Caller/assignee Auth rows and roles locked; operation ownership, expiry, pledged status/version and previous owner rechecked per item. Assignment plus result audit share a transaction. Read/recovery never resubmits writes; resolved items return saved outcome.

Fresh production read-only catalog:both tables and all3RPCs absent;2 pledges;ledger95. Predecessor169 owner/version/assignment/picker schema is required and not yet applied. No production DDL/backup/ledger action performed. Before execution require exact per-file approval and preceding schema, verify checksum/current catalog/signatures/grants/RLS and backup suitability, apply only this candidate, then check tables remain inaccessible to browser roles and exact functions exist.56-file source inventory is not an instruction to blindly apply every file or change historic ledger.

Existing restricted CurrentUserDPAPI backup: `hkscda-before-pr135-20260929T003437Z.dpapi`,1772038bytes,SHA256 C9A32C9303C00AE080C28187B2AD2E0D081211187DE3E2360ED508443BFF79B2. Prior decryption roundtrip checked; fresh restore not-run,Storage bytes absent; providerbackupsnull/PITRfalse previously observed. Recheck immediately before approvedDDL. Rollback: stop affected bulk writes and revert to compatibility-tested app while retaining additive tables/operations/versions/audit. Never drop durable partial results or undo financial/history facts. No certified app rollback target is invented.

## Operator and release handoff

On temporary recovery failure use `重新讀取結果`; it is a GET and preserves the operation ID. Inspect per-item outcomes before resuming the same operation; only pending items apply. On expired preview, retain/export results and explicitly make a fresh snapshot for unresolved eligible IDs. Do not replay all successful items. Changing list filters clears selection; current staff role/Auth is checked again when applying. Follow-up ownership is independent from proof/finance approval.

Latest fetchedmain and productionalias24196faf027998388eff3196a6979e23566e2443,READY dpl_DJpjHkmVayPsXZqwiA2CMJG43Ygk;mainCI36624781016fivegreen from prior verification. #134–#155 merged22/46. No new merge this preparation. #156 actual concurrent OTP test still fails; no answer to disabled-feature release exception. #169 prior60a3b0f7fivegreen36644968703;latest catalogamendmentdd17c5fbCI36646284540pending. PR170 remoteCIawaitspush. #157 exact migration approved;#159–#162/#164–#166 exact approvals pending;#169/#170 exact approvals not yet requested at report creation. Payment/new schedules remain disabled; existing webhook/reconciliation preserved. No public preview, real payment/email/refund or content publication.


## Task170 held-lock expiry repair — 2026-10-01 HKT

Independent BASE `2cb148ab50cf8499f63ee5ab7d47c4e5a509d6a0`; verified source `bef911882a8d30c068ec6408d1f4253775acecdb`. No predecessor branch propagation. Real parameterized operation/sponsorship_pledge row tests start apply while live, prove pg_blocking_pids blocking, retain the unchanged blocker until DB clock proves expired-and-still-blocked, then release. Both original functions wrongly returned succeeded. Repair uses pg_catalog.clock_timestamp after operation/assignee locks plus immediately after pledge lock before any assignment/result/audit writes. Existing audited assign_sponsorship_followup remains in the same transaction; FOUND, Auth/admin FOR SHARE, permissions, versions, eligibility, partial results and terminal retries are preserved.

| Actual command | Result / exit | Local raw log |
| --- | --- | --- |
| `bun test --isolate src/lib/sponsorshipAdmin/followupBulk.database.test.ts --test-name-pattern 'rejects expiry while waiting'` original local function | RED 0 pass / 2 fail / 4 filtered / 10 assertions / 4.81s; 1 | task-170-red.log |
| `bun .superpowers/sdd/HKSCDA_Codex_GPT6_Sol_Implementation_Plan_2026-09-27_zhHK/task-170-rehearsal.ts` | exact whole migration BEGIN/ROLLBACK; clone-only apply replacement; 0 | task-170-rehearsal.log |
| `bun test --isolate src/lib/sponsorshipAdmin/followupBulk.database.test.ts` final SQL | GREEN 6 pass / 0 fail / 40 assertions / 4.75s; 0 | task-170-green.log |
| `bun test --isolate --timeout 30000` final source | 3080 pass / 137 skip / 0 fail / 9668 assertions / 556 files / 58.38s; 0 | task-170-full-test.log |
| `npm.cmd run typecheck` | strict TS 0 | task-170-typecheck.log |
| `npm.cmd run lint` | 0; 52 existing warnings / 0 errors | task-170-lint.log |
| `npm.cmd run build` exclusive serial placeholder build | 0 | task-170-build.log |
| `bun .superpowers/sdd/HKSCDA_Codex_GPT6_Sol_Implementation_Plan_2026-09-27_zhHK/task-170-census.ts` and `git diff --check` | scoped fixture counts all0; exact table grants; 0 | task-170-census.log |

Raw logs/helpers and full task-170-report.md are retained in this worktree's ignored `.superpowers/sdd/HKSCDA_Codex_GPT6_Sol_Implementation_Plan_2026-09-27_zhHK/`. Root explicitly released the local DB/shared serial-build slot. RED/GREEN env: SPONSORSHIP_FOLLOWUP_BULK_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:52322/audit_pr135_20260929 and SPONSORSHIP_FOLLOWUP_BULK_TEST_ALLOW_LOCAL_FIXTURES=1. Full adds CHECKOUT_POLICY_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:57322/postgres and SUPABASE_LOCAL_URL=http://127.0.0.1:52321. Build: VITE_SUPABASE_URL/SUPABASE_URL=http://127.0.0.1:54329; VITE_SUPABASE_ANON_KEY/VITE_SUPABASE_PUBLISHABLE_KEY=ci-placeholder-anon-key; SUPABASE_SERVICE_ROLE_KEY=ci-placeholder-service-role-key. No hosted/provider keys used.

Whole candidate rehearsal locks snapshot/item/pledge/supporter tables ACCESS EXCLUSIVE NOWAIT before asserting each empty; replacement is scoped to candidate-owned functions/tables and rolled back. Exact SQL13.63ms; two old synthetic pledge rows unchanged; preview1000 35.82ms; apply900 948.80ms; 897succeeded/101skipped/2conflict; 897assignment audits; durable retry no duplicate. Four exact signatures, SECURITY DEFINER/empty paths, service-only public EXECUTE/private helper revoked, RLS, five total indexes (PK/unique included), table grants and exact column ACL/default metadata checked. Rollback restores exact definitions/catalog/grants/RLS/indexes/columns, every migration-ledger row and every pre-existing audit row hash. Then only apply is replaced on the disposable clone; other functions/metadata/ledger/audit unchanged. No fake ledger, reset/db push/CASCADE, real rows or indiscriminate audit deletion. Census Auth/admin/supporter/pledge/snapshot/item all0 after full suite.

Held-lock GREEN verifies P0001 and exact unchanged assignee/version/item status/reason/applied_at plus all synthetic actor audit rows. Captured real SQL errno is adapted to existing PostgREST code shape and exercised through actual HTTP handler:409/no-store. Live PostgREST is not-run. Synthetic UUID/example.invalid fixtures use exact-ID cleanup or rollback. Full suite includes existing API/safety/manifest tests; expected synthetic error logging remains; zero failed tests. Skips are not passes.

Canonical LF SHA256 `20260928080000_sponsorship_followup_bulk.sql`: **c3819e013b6593b36d0257ad54d6920c75529596dda460f6d66011fe83857800**. Only this undeployed candidate's manifest entries changed. Earlier exact-byte statements above are historical and do not authorize the revised bytes. Root owns independent review/integration, current remote CI, pushes/merges/sequential main release and exact new production approval. No production/provider/remote operations, paid branches, real notification/payment/refund/adoption approval/identity merge, public preview, deployment or operational enablement. Existing UI captures retained; new UI/hosted/provider/production performance not-run because UI unchanged. ADMIN-04 remains partial, both34-row trackers update only that row; all unrelated historical evidence retained.

Self-review: two-clock-check SQL diff; no SELECT/PERFORM inserted between final entity SELECT and its FOUND-sensitive handling. Worktree bases remain independent. Default sandbox startup failed with apply deny-read ACLs; authorized escalated local fallback succeeded, no automatic-review rejection. Required debugging/TDD/Supabase/verification skills read; graph returned no bulk symbols, supplied files/current paths used. Remote documentation fetch omitted under the batch's explicit no-remote scope. Material concerns:137 skipped tests,52 existing lint warnings, root review/integration/live PostgREST/new production approval remain pending.


## Task170 fix round1 — exact blocker PID and full frozen item proof (2026-10-01 HKT)

Correction to preceding held-lock evidence: the earlier tests checked only a nonempty pg_blocking_pids array and item status/reason/applied_at, so they did not prove the specific held locker or full frozen item equality. Original logs remain historical; this round supplies the missing proof. Scope is only the two reviewer findings. Round BASE `37499b2ea8b0c77e4b9c3366727b49308a83805f`; new test source `ca6dec97daeff552bb43e42d287a0bc246ec086a`. Original SQL source `bef911882a8d30c068ec6408d1f4253775acecdb` and approved canonical hash `c3819e013b6593b36d0257ad54d6920c75529596dda460f6d66011fe83857800` retained unchanged, with no migration/manifest/source grant edits.

The held transaction captures its own pg_backend_pid after acquiring the operation/pledge row. Both live and post-DBclock-expiry observations require that exact PID in pg_blocking_pids(applier_pid), before the unchanged held lock is released. State now includes to_jsonb(i), so exact post-P0001 equality covers every real item column: operation_id, pledge_id, ordinal, expected_version, before_assignee, after_assignee, status, reason_code and applied_at. These item tables have no created_at column; whole-row capture will include any timestamp column if present. Existing entity assignee/version and actor-scoped audit equality remain. Actual handler409/no-store check retained; live PostgREST not-run.

| Fresh command | Actual result / exit | Raw local log |
| --- | --- | --- |
| `bun .superpowers/sdd/HKSCDA_Codex_GPT6_Sol_Implementation_Plan_2026-09-27_zhHK/task-170-fix-round-1-red.ts` | clone-only original BASE2cb148ab apply; tightened RED0pass/2fail/14assert/9.12s, tests exit1; safe helper exit0; finally repaired function/ACL/ledger/all historical audit hashes exactly restored | task-170-fix-round-1-restoration.log and task-170-fix-round-1-red.log |
| `bun test --isolate src/lib/sponsorshipAdmin/followupBulk.database.test.ts` | GREEN6pass/0fail/44assert/4.74s;0 | task-170-fix-round-1-green.log |
| `bun test --isolate --timeout 30000` once final corrected test source | 3080pass/137skip/0fail/9672assert/556files/72.78s;0 | task-170-fix-round-1-full-test.log |
| `npm.cmd run typecheck` | strict TS0 | task-170-fix-round-1-typecheck.log |
| `npm.cmd run lint` |0;52 existing warnings/0errors | task-170-fix-round-1-lint.log |
| `npm.cmd run build` repository-required exclusive serial placeholder gate |0 | task-170-fix-round-1-build.log |
| `bun .superpowers/sdd/HKSCDA_Codex_GPT6_Sol_Implementation_Plan_2026-09-27_zhHK/task-170-census.ts` and `git diff --check` | all own scoped synthetic fixtures0; snapshot table grants preserved;0 | task-170-fix-round-1-census.log |

Root held DB/build slot during test/helper-only preparation and explicitly released it before any DB/test/build access. Tightened RED helper validates the exact approved SQL hash and explicit dedicated URL/opt-in, locks candidate/item/entity tables NOWAIT and asserts emptiness before only apply RPC replacement. It uses git show original implementation BASE to supply original apply, runs RED, then finally restores repaired apply and compares exact function definition/ACL/definer/search_path, every ledger row and all historical audit hashes. Fixture cleanup is unchanged synthetic UUID/example.invalid and exact actor/entity/operation IDs. No ledger fabrication, reset/dbpush/CASCADE or unscoped audit deletion.

Environment unchanged: SPONSORSHIP_FOLLOWUP_BULK_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:52322/audit_pr135_20260929 plus SPONSORSHIP_FOLLOWUP_BULK_TEST_ALLOW_LOCAL_FIXTURES=1; full suite adds CHECKOUT_POLICY_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:57322/postgres and SUPABASE_LOCAL_URL=http://127.0.0.1:52321. Build only loopback54329, ci-placeholder-anon-key/ci-placeholder-service-role-key via prior exact variables. Existing full whole-candidate/1000-item/old-row/catalog/grants/RLS rehearsal is inherited, not rerun in this test-only round because SQL unchanged; its original verified equality remains recorded. No new performance/UI/provider/hosted/production claim. Skips are not passes;52 existing lint warnings remain. Root owns re-review/integration/current remote CI/releases/exact production approvals. No remote/provider/production/predecessor propagation/subagents/real notification/payment action. Final round range has only owned test and appended evidence/tracker paths; both trackers34rows only ADMIN-04 changed.


## Root combined review checkpoint 170 — 2026-10-01 HKT

Reviewed candidate 70182befc1b7d302c486ff20b28f9e4245d48364 integrated predecessor bb34bfc2c038527701f19bfc9147235f0c8a01b6. There were no source conflicts. Documentation histories and both trackers with 34 unique issues were preserved. All 57 canonical LF SQL entries match. The stronger #160 blocker proof is inherited through #166. Earlier source, role, DB, migration rehearsal, UI and performance evidence remains under its recorded SHA and environment.

Actual local commands: `bun test --isolate src/lib/operations/migrationManifest.test.ts src/lib/operations/releaseManifest.test.ts`: 2 pass / 60 assertions / 0 fail / exit 0; `bun run typecheck`: strict TypeScript / exit 0; `git diff --check`: exit 0. Combined local full tests, lint, build, DB, UI and performance at this new head: not-run. The DB/build slot belongs to isolated #175 work during early integration. Fresh CI for the exact head must run full tests, typecheck, lint, build, RLS, brand, accessibility and performance gates before release. Skips and warnings remain visible; hosted/provider evidence remains separately not-run. Raw receipts and logs remain ignored in this task workspace.

Last observed main and production alias: 07e4c881, main CI 36758558621 all five SUCCESS, deployment READY; 26 of 46 releases through #159. No production action occurred in this preparation. The owned source is code-complete; production schema, deployment and operational enablement have not advanced. #160 named migration approval remains pending. Prior #161 approval for its unchanged schema remains operative. Later migrations need named approval, fresh catalog/signature/grants/RLS/backup checks and postflight in predecessor order. The manifest lists source files and does not authorize applying all files. Payments and new sending/media schedules remain disabled. Existing webhooks/reconciliation, committed financial success, durable jobs, audit, additive rollback and private-file boundaries are retained. Full restore, Storage bytes and hosted staff/provider UAT remain separately not-run.
