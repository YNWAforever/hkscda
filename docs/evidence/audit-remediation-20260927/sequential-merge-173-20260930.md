# PR173 sequential release preparation — 2026-09-30

## Scope and state

Application `40a8765beaa04613fae1f9cc77e74a11d34810f1`, integrated baseline479d49b4; predecessor#172 b9a0c8895e955313ef2c34b747724299a6afc915. Historical `t23-finance-delivery-worklist.md` preserved. Bounded private failed-delivery list and one-existing-job retry through existing worker/lease/provider-idempotency path. No bulk retry, new scheduler, payment settlement/refund or new notification authorization. Codecomplete:this slice; schema-ready:isolated only; deployed:no; operationally-enabled:no. ADMIN-04partial.

## Reproduced repairs

- New SQL retry guard returnedfalse for refunded payment, but existing handler ignored it and called worker. Reviewer reproduced attempts0→1/statusattention_required despite refusal. Handler now rereads current job afterfalse, returns409 while still failed,404ifmissing,or200withconcurrentpending/processing/complete; it never invokes worker for refused retry.
- SQL actor revocation42501 became500; now403/no-store, no worker.
- Lost response after committed retry left stale failed job with no list refresh. onSettled awaits worklist and overview invalidations on either outcome. Disable retry while fresh read is pending or failed; copy describes unknown outcome honestly.
- API regex rejected page1000 despite SQL/schema/UI limit1000. Accept1000; reject1001,leadingzero,scientific/negative forms.
- Actual post-refresh browser found a keyboard-inaccessible scrollable table when no active retry control remained. Named tabIndex0 region fixes it.

Logic red9pass/4fail/37assertions,exit1→13pass/61assertions/344ms,exit0. Independent reviewer closed all findings and ran14tests/66assertions,exit0. Browser baseline at3widths retained1stale row/read1 after committed lost reply; fixed reads2/rows0 with exactly1POST. No production/provider call involved.

## Actual gates

| Command | Environment / source | Result / exit |
| --- | --- | --- |
| `bun test --isolate` seven focused handler/DB/read-model/UI/API files | finalapp;service_role on52322/audit_pr135_20260929 |17pass/88assertions/380ms /0 |
| `bun test --isolate --timeout 30000` | repaired logic before final focusability-only amendment; CHECKOUT_POLICY_TEST_DATABASE_URL=loopback57322/postgres; SUPABASE_LOCAL_URL=http://127.0.0.1:52321 |3110pass/143skip/0fail/9790assertions/572files/31.19s /0 |
| `npm.cmd run typecheck` | finalapp |0 |
| `npm.cmd run lint` | finalapp |0;52warnings |
| `npm.cmd run build` | finalapp;synthetic VITE_SUPABASE_URL/ANON_KEY/PUBLISHABLE_KEY,SUPABASE_URL/SERVICE_ROLE_KEY,loopback54329 |0 |
| `bun scripts/verify-delivery-worklist-migration.ts` | named empty production-schema clone;synthetic only |exact SQL3.09ms;6oldjobs/paymentfacts unchanged;1000jobs40pagesunique;page1read5.54ms;concurrent oneaccepted/onerefused/oneaudit,attempts2;cleanup0 /0 |
| `node scripts/verify-delivery-worklist-review.mjs --before` | original479d49b4;local56571;syntheticAPI |all3widths reproduce stale1/read1 after onecommittedPOST /1 |
| same browser script without --before | finalpanel390/768/1366;lost/read-failed scenarios |6cases;reads2/POST1;lostrow0;readfailure retrydisabled;keyboard/Axe0/errors0/nooverflow /0 |

Full local suite not repeated for the final focusability-only change; focused/type/lint/build/browser reran. Skips not passes. Finalhead remoteCI awaits push. DB explicit opt-in DELIVERY_RETRY_TEST_ALLOW_LOCAL_FIXTURES=1,URL guard exact loopback57322/postgres or52322/audit_pr135_20260929 with no query/hash. No identity, provider, email or financial mutation in production.

SQL tests execute actual SET LOCAL ROLE service_role; current confirmed Auth/ban/role, refunded payment, complete/pending retry rejection, browser execute denial and atomic audit failure are covered. Trigger-injected audit failure rolls job status/attempts back. Rehearsal first restores the exact prior#137 retry definition, then applies full candidate SQL within a transaction; preserves6syntheticjobs and payment facts.1000jobs read25/page over40pages with no duplicate;page1000empty accepted.2realconnections concurrently retry one committed syntheticjob:one true/one false,oneaudit,statuspending,attempts2. No worker is run in this DB concurrency drill. Exact fixture IDs cleaned in finally;0jobs remain. No migration ledger fabricated.

Before/after `ui/t23-delivery-{before,after}-{390,768,1366}.png`. Browser uses actual React Query/component and synthetic intercepted requests; per-item confirmation entered by keyboard. Refetchfailure preserves old data but disables retry. No actual provider sandbox/email sink run for this slice; worker/provider behavior is mocked regression evidence. Standalone image viewer unavailable; browser/Axe checked artifacts. Fixture servers stopped. Current local timings are not a before/after performance improvement. Hosted finance/private-file journeys and production deployment not-run.

## Exact migration and rollout boundary

`20260928100000_finance_delivery_retry_guard.sql`,unchanged LF SHA256 `27a5e87e3175bd545b6fe0a03429933bb617dc4c7f30f5dd3538de61539ddf0a`. Adds failed-work partial index and service-only list RPC; replaces existing retry RPC with current Auth/role and locked succeeded-payment/donation checks. Retry preserves cumulative attempts and audit is same transaction. List/retry pin emptysearch_path;no newtable/backfill/scheduler.

Fresh production read-only:0deliveryjobs,6payments,ledger95;retryRPCexists,listRPC/indexabsent. Candidate installed only in localclone. Beforeproduction obtain exactfileapproval, verify backup/checksum/catalog/signatures/grants/RLS and predecessor availability, apply only this SQL, recheck job/payment counts and browser denial.58-file source inventory is not an apply-all instruction. Older compatible callers retain boolean signature; repaired handler is required to honorfalse. Do not independently roll back app to an implementation that ignoresfalse while keeping guard active.

Existing restricted CurrentUserDPAPI backup `hkscda-before-pr135-20260929T003437Z.dpapi`,1772038bytes,SHA256 C9A32C9303C00AE080C28187B2AD2E0D081211187DE3E2360ED508443BFF79B2. Prior roundtrip verified; fullrestore not-run,Storagebytesabsent,providerbackupsnull/PITRfalse previouslyobserved. Recheck before approvedDDL. Rollback: disable affected manualretryentrypoint and retain additiveindex/listRPC/hardenedretry plus durablejobs/audits/attempts. Restoreonlycompatibility-verified app;never resetattempts/removeaudit/undo deliveredfacts or financial success. No certified rollbackSHA invented.

## Operator and pending gates

Inspect one job's payment and current recipient before any separately authorized manualretry. It can invoke the existing receipt/email worker; this preparation does not authorize real sending. UnknownPOSToutcome: wait for read-only refresh, inspect latestlist; do not infer failure or repeatall. Readfailure: use LoadFailure readretry; mutationbuttons remain disabled. Refunded/changedpayment cannot retry. Recovery does not mark succeededpayment pending. No new cron is enabled.

Latest fetchedmain24196faf027998388eff3196a6979e23566e2443 matches lastverifiedproductionalias READY dpl_DJpjHkmVayPsXZqwiA2CMJG43Ygk;mainCI36624781016fivegreen.22/46merged#134–#155;no newmerge. #156isolatedOTPconcurrencyfailure remains blocking;exception unanswered. #172CI36649278875 last4green/brandrunning. #157exactSQLapproved waits predecessors;#159–#162/#164–#166/#169/#170approvals pending. #172/#173exactapprovalnotyetrequested atreporttime. Payments/new schedulesdisabled;existingwebhook/reconciliationpreserved. Hostedidentity/formalcontent/provider credentials/operational approval remain external gates.


## Root combined review checkpoint 173 — 2026-10-01 HKT

Reviewed candidate ec1a71318918727026413012937a8ffacbbd9d28 integrated predecessor f0294436c0ecf417330bc4279ad7caf89dba707f. There were no source conflicts. Documentation histories and both trackers with 34 unique issues were preserved. All 59 canonical LF SQL entries match. The stronger #160 blocker proof is inherited through #166. Earlier source, role, DB, migration rehearsal, UI and performance evidence remains under its recorded SHA and environment.

Actual local commands: `bun test --isolate src/lib/operations/migrationManifest.test.ts src/lib/operations/releaseManifest.test.ts`: 2 pass / 60 assertions / 0 fail / exit 0; `bun run typecheck`: strict TypeScript / exit 0; `git diff --check`: exit 0. Combined local full tests, lint, build, DB, UI and performance at this new head: not-run. Earlier isolated DB/build runs remain bound to their recorded source and environment. Fresh CI for the exact head must run full tests, typecheck, lint, build, RLS, brand, accessibility and performance gates before release. Skips and warnings remain visible; hosted/provider evidence remains separately not-run. Raw receipts and logs remain ignored in this task workspace.

Last observed main and production alias: 07e4c881, main CI 36758558621 all five SUCCESS, deployment READY; 26 of 46 releases through #159. No production action occurred in this preparation. The owned source is code-complete; production schema, deployment and operational enablement have not advanced. #160 named migration approval remains pending. Prior #161 approval for its unchanged schema remains operative. Later migrations need named approval, fresh catalog/signature/grants/RLS/backup checks and postflight in predecessor order. The manifest lists source files and does not authorize applying all files. Payments and new sending/media schedules remain disabled. Existing webhooks/reconciliation, committed financial success, durable jobs, audit, additive rollback and private-file boundaries are retained. Full restore, Storage bytes and hosted staff/provider UAT remain separately not-run.
