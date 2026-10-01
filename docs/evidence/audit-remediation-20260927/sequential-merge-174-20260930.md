# PR174 sequential release preparation — 2026-09-30

## Scope, source and state

Application `ea7541079ca3cd3c0390f9f3bef1a8665b4746f2`, baseline b3907319, predecessor#173 ec1a71318918727026413012937a8ffacbbd9d28. Historical `t23-role-guidance.md` retained. Ordered task overview guidance; no SQL, permission expansion, workflow mutation or provider activation. Codecomplete:this slice; schema:58inheritedinventory,no newfile; deployed:no; operationally-enabled:no. ADMIN-04partial pendinglaterT23/hostedUAT.

Independent review found the treasury-only sponsorship-followup card instructed assignment although assignment controls/API allow staff/admin. Changed to「核對付款及待跟進承諾，交由職員／管理員安排跟進。」. Existing destinations, authorization and aggregate semantics preserved. Unit red5pass/1fail/30assertions→green6pass/32assertions/219ms. Independent reviewer closed finding and ran7tests/37assertions,exit0.

## Executed verification

| Command | Environment / source | Result / exit |
| --- | --- | --- |
| `bun test --isolate` taskOverview server/component files | repairedapp |6pass/32assertions/219ms /0 |
| `bun test --isolate --timeout 30000` | finalapplication;CHECKOUT_POLICY_TEST_DATABASE_URL=loopback57322/postgres;SUPABASE_LOCAL_URL=http://127.0.0.1:52321 |3113pass/143skip/0fail/9802assertions/572files/32.20s /0 |
| `npm.cmd run typecheck` | finalsource |0 |
| `npm.cmd run lint` | finalsource |0;52warnings |
| `npm.cmd run build` | finalsource;synthetic VITE_SUPABASE_URL/ANON_KEY/PUBLISHABLE_KEY,SUPABASE_URL/SERVICE_ROLE_KEY,loopback54329 |0 |
| `bun scripts/verify-task-overview-local.mjs` | actual isolated Auth/PostgREST57321;one syntheticidentity |staff5/treasurer4/admin5cards,allmetricsready;401invalid/missingtoken,403nonstaff/pending/disabled,405wrongmethod;same-tokencurrentrolerecheck;queryroleignored /0 |
| `node scripts/verify-task-guidance-review.mjs --before` | same actualUI with original treasurycopy fromb3907319;56572;syntheticroles |3widths reproduce inappropriateassignmentinstruction /1 |
| `node scripts/verify-task-guidance-review.mjs` | actualTaskOverview/currentserverdefinitions,390/768/1366×3roles |9cases;correctguidance/destinations,zero/unavailabledistinct,suspensionhidesalllinksandmakesnonewrequest;keyboard/Axe0/errors0/nooverflow,768at200%zoom /0 |

Skipped tests are not passes. Exacthead remoteCI awaits push. Existing Auth fixture generates a local link without sending, verifies it locally, changes only its syntheticadmin role/status, then deletes exactadmin/AuthIDs. No real email/provider/payment. SQL schema untouched; actual role/API evidence is local, not hosted staff UAT. Source discovery used local reads after prior graph-export denial.

Before/after screenshots: `ui/t23-guidance-before-treasurer-{390,768,1366}.png` and `ui/t23-guidance-after-{staff,treasurer,admin}-{390,768,1366}.png`. Actual React Query/component receives real current server definitions through intercepted synthetic API. Original-copy baseline changes only the treasury guidance, matching this fix. Links' exact hrefs compared to role definitions; keyboard focus verified. Browser does not claim full destination/private-file journeys. Temporary fixture stopped. Standalone image viewer unavailable; browser/Axe verified generated artifacts. Same-environment performance comparison and hosted regional performance:not-run for this wording slice; no performance improvement claimed.

## Release and staff handoff

58inherited SQL checksums unchanged; no migration required specifically for guidance. Revert the wording/UI using an app compatible with inheritedschema; do not undo retainedversions,operations,audit,financialfacts or prior retryguards. No database rollback applies to this slice. Earlier exactschema approvals/checksum/backup/catalog/rollback requirements remain in each predecessor report.

Treasurer: inspect pendingpayments,failedreceiptjobs,proofs,andneeds-followup commitments; coordinate assignment with staff/admin. Proofupload is not proof of receipt. Staff handle adoption/volunteer/animal/proof follow-up; admin handle content/media and selected operationalqueues. Unavailable counts must be reloaded/investigated, never interpreted as zero. Existing confirmation/provider/operational approval boundaries still apply when following a card.

Fetchedmain and lastverifiedproductionalias24196faf027998388eff3196a6979e23566e2443,READY dpl_DJpjHkmVayPsXZqwiA2CMJG43Ygk;mainCI36624781016fivegreen.22/46merged#134–#155,no newmerge. #156actualisolatedOTPconcurrencyfailure remains releaseblock;requesteddisabled-featureexception unanswered. #172b9a0c889 allfivegreen36649278875;exactSQLapprovalrequested. #173ec1a7131 CI36650269702 lastverify/RLS/a11ygreen,brand/performancepending. #157approvedwaitspredecessors;#159–#162/#164–#166/#169/#170/#172exactapprovalspending;#173notyetrequested atreporttime. Payments/new schedulesdisabled;existingwebhook/reconciliationpreserved. Hostedidentity/privatefile/export journeys, formalterms/content/provider credentials and operationalactivation remain external gates.


## Root combined review checkpoint 174 — 2026-10-01 HKT

Reviewed candidate 0e7e4e75f134c40a99b8842d962ce39b0a9d5ff5 integrated predecessor da2d9b85a239ba41f3590f653a9df490aedfc8a7. There were no source conflicts. Documentation histories and both trackers with 34 unique issues were preserved. All 59 canonical LF SQL entries match. The stronger #160 blocker proof is inherited through #166. Earlier source, role, DB, migration rehearsal, UI and performance evidence remains under its recorded SHA and environment.

Actual local commands: `bun test --isolate src/lib/operations/migrationManifest.test.ts src/lib/operations/releaseManifest.test.ts`: 2 pass / 60 assertions / 0 fail / exit 0; `bun run typecheck`: strict TypeScript / exit 0; `git diff --check`: exit 0. Combined local full tests, lint, build, DB, UI and performance at this new head: not-run. Earlier isolated DB/build runs remain bound to their recorded source and environment. Fresh CI for the exact head must run full tests, typecheck, lint, build, RLS, brand, accessibility and performance gates before release. Skips and warnings remain visible; hosted/provider evidence remains separately not-run. Raw receipts and logs remain ignored in this task workspace.

Last observed main and production alias: 07e4c881, main CI 36758558621 all five SUCCESS, deployment READY; 26 of 46 releases through #159. No production action occurred in this preparation. The owned source is code-complete; production schema, deployment and operational enablement have not advanced. #160 named migration approval remains pending. Prior #161 approval for its unchanged schema remains operative. Later migrations need named approval, fresh catalog/signature/grants/RLS/backup checks and postflight in predecessor order. The manifest lists source files and does not authorize applying all files. Payments and new sending/media schedules remain disabled. Existing webhooks/reconciliation, committed financial success, durable jobs, audit, additive rollback and private-file boundaries are retained. Full restore, Storage bytes and hosted staff/provider UAT remain separately not-run.
