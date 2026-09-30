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
