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
