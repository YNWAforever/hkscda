# CMS actual isolated database and Storage acceptance

Executed serially on root-provisioned disposable `hkscda-completion-20260905`, database loopback port55322 and API/Storage loopback port55321. Root applied the migrations. This agent changed only the three integration harness files during acceptance; no migration change, production connection, deploy or commit.

## Harness red/green

Initial lifecycle audit-rollback test failed with23502/null slug before reaching the rollback assertion. Bun's SQL binding encoded `JSON.stringify(object)` as a JSON string rather than an object. Replaced bound serialized strings with direct objects in lifecycle/read/media fixtures. Replaced Bun Windows `expect(sqlPromise).rejects.toThrow()` with explicit awaited try/catch assertions, per already-reproduced parent harness finding. Cleanup sets synthetic item status to draft before clearing its published pointer so the real publication guard remains enabled.

All child test processes had a clean allowlisted environment (Windows runtime paths plus explicit CMS fixture variables), `--no-env-file`, explicit loopback targets and fixture opt-in. The ephemeral service key came only from the final JSON line of the ignored local-stack start log, remained in memory/child environment and was redacted from output. It is absent from this evidence.

## Actual results

| Suite | Result | Assertions | Reported total time |
|---|---:|---:|---:|
| lifecycle.integration.test.ts |15pass0fail|43|0.876s|
| contentRead.integration.test.ts |1pass0fail|13|10.14s|
| mediaLifecycle.integration.test.ts |3pass0fail|12|1.68s|

Lifecycle acceptance proves local audit-constraint rollback; one-winner parent version concurrency; idempotent publication and changed payload conflict; saved-public slug retained through draft rename; one winner under concurrent historical-slug publication; restore creates a new revision while retaining the published pointer; invalid title/slug/summary/profile/map rejection; inactive update attachment rejection; and denied table/function grants for anon/authenticated roles.

Read acceptance created1201 matching profiles,100updates and100media per item in a rollback-only transaction. Page25 returned the remaining single parent and count1201. List cover/update counts stayed1 each; bodies were omitted. Detail pages used21-row lookahead and page5 retained the final20 updates. Role grant checks and EXPLAIN ANALYZE executed. The10.14s figure is whole fixture/test runtime, NOT query latency or a production benchmark. Query-plan artifacts/latency comparison remain part of root performance verification.

Storage acceptance uploaded a synthetic pixel to the private bucket, denied an anonymous request to its known public URL, finalized/replayed the same logical media, rejected changed replay metadata, fetched a five-minute signed preview successfully, and published the selected revision after copies. Invalid preparation left0 public-asset/preparation rows. Direct premature publication was rejected while the pointer remained null.

Count-only cleanup verification: cms_items0, cms_actors0, sessions0, publication_assets0, private_objects0. The read fixture transaction rolled back. Database ownership was handed to the CRM agent afterward; no overlap.

## Earlier automatic approval rejection

The earlier combined source-edit/test command was rejected with this exact stated reason:

> The integration test performs fixture creation and concurrent publication against a database, but the command does not enforce a loopback or isolated target and could mutate production data, which the user explicitly prohibited without authorization.

That rejected command did not run. Read-only followup confirmed the source loopback/protocol/no-routing guards and absence of DB URL/fixture opt-in at that time. A source-only edit was subsequently approved. The actual execution reported above occurred later, after root explicitly provisioned and authorized the unique disposable loopback stack.

## Scope limits

This is actual local-stack acceptance, not production or staging acceptance. No expired-signed-URL time-elapse assertion, live legacy-object remediation, owner sign-off or full authenticated-editor browser flow is claimed. Reconciliation remains inventory-only/dry-run; apply was excluded by root's explicit no-external-object-remediation instruction. Full staged release remains outside these local results.
