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
