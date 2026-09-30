# PR166 sequential verification - 2026-09-30 HKT

Final integration 4f3f2f7e22afc2d8d2bbdf4cb05044a6701df7ee; reviewed implementation e229f46d. The merge with updated #165 only differed in a selection-error message; the quality-aware wording was retained. git diff --exit-code e229f46d HEAD -- src supabase package.json bun.lock returned0: runtime/source/SQL are identical to the tested implementation. Read-only quality queue slice is code-complete; schema ready locally, not applied in production; not deployed/operationally enabled.

## Defects and review

Independent review reproduced a delayed select-all restoring discarded IDs after all to demo to all. Browser baseline at390/768/1366 retained25 visible checked rows after clear, exit1. A monotonic selection generation increments on every kind/quality change; an older collector cannot restore selection. All widths now retain0, exit0. The same earlier animal kind-cycle defect was backported and reviewed in #162, then propagated through #163-#165. Shared HTTP handler also mislabeled malformed JSON as500 and a DB42501 permission recheck as500; focused red2pass1fail/7assertions, fixed3pass9assertions/exit0 now returns400/403 and leaves unexpected failures500. Independent review closed all scoped findings. Quality SQL unchanged from the original PR.

## Executed commands and evidence

| Command | Environment / source | Actual result / exit |
| --- | --- | --- |
| bun test --isolate --timeout 30000 | e229f46d; checkout loopback57322/postgres; Auth52321 |3022pass /133skip /0fail;9462assertions;546files;40.72s /0 |
| npm.cmd run typecheck | Strict TS, e229f46d |0 |
| npm.cmd run lint | Full configured tree |0;52 warnings |
| npm.cmd run build | Synthetic keys/loopback54329, e229f46d |0 |
| bun test src/lib/contentReview/qualityQueue.database.test.ts | CMS_QUALITY_ALLOW_LOCAL_FIXTURES=1; exact52322/audit_pr135_20260929 schema-only clone |2pass /122assertions /0fail;255ms /0 |
| bun test src/lib/contentReview/qualityQueue.test.ts | Synthetic service/repository/HTTP |3pass /9assertions /0 |
| node scripts/verify-cms-quality-review.mjs | Actual ContentReviewQueue/real router; synthetic API; loopback56564 |3 widths, keyboard, filter clearing, read-only controls, error to all-items recovery; Axe0/pageerrors0/overflowfalse;0 |
| python scripts/rehearse-cms-quality-local.py | Exact SQL,7 synthetic old content rows, named local clone |Full BEGIN/ROLLBACK,253ms /0 |
| git diff --exit-code e229f46d HEAD -- src supabase package.json bun.lock | Final parent integration |0; runtime identical |

DB checks execute as actual service_role and deny anon/authenticated. Confirmed active admin/staff accepted; treasurer, disabled/unconfirmed/banned actors and invalid page/filter rejected. Thousand synthetic rows include overlapping classifications/expiry/source filters and125 archived rows. Ordered pagination covers every matching ID exactly once: demo218,expired437,missing_source437,25 per page plus empty final page. All content-field hashes and audit count unchanged. First expanded fixture run failed two legitimate constraints because synthetic data used nonexistent coordinator/volunteer_manager roles and verified content without provenance; corrected to the actual staff/treasurer/admin catalog and unreviewed missing-source data, without bypassing constraints. All fixture rows rolled back.

Same-environment current-query timings (single synthetic run, not an improvement claim): demo10pages p50/p95=1.42/2.51ms; expired19pages1.35/1.86ms; missing_source19pages1.33/2.67ms. No before-performance baseline/hosted regional performance certified. Existing T20 before/after evidence remains in #155.

Before/after ui/t23-cms-quality-{before,after}-{390,768,1366}.png. Direct expired initial queue, demo/missing-source filtering, hidden bulk controls in quality mode, temporary quality-RPC outage and working all-items recovery verified. Synthetic APIs received zero writes. Browser and hidden server stopped. Hosted actual staff/private files/complete journeys, provider sandbox and real email/payments not-run; skipped tests are not passes.

## Exact migration and production read-only inventory

20260927211801_editorial_quality_queue.sql LF SHA2568c1b4550d4361f348246654bab356f3cd2366de48afb0eb384b90efb38526642. Adds one stable, service-only definer RPC with empty search_path and two nonunique partial indexes. No new table, backfill, content mutation or policy change. Existing RLS remains. Full-file drill removes only local candidate objects within BEGIN, seeds7 legacy-shaped synthetic draft rows, applies exact SQL and verifies all fields/grants; ROLLBACK leaves content/Auth0 and restores prior clone schema. Signature, stable/definer/search_path, exact indexes and grants checked.253ms is not a production lock estimate. No fabricated migration ledger.

Production aggregate-only read: ledger95;7 content;0 metadata-demo,0 expired,7 missing-source; candidate RPC and both indexes absent. These counts are not a mandate to classify/unpublish any real content. Before DDL: fresh checksum/catalog/signature/grants/RLS/index/row inventory, approved lock window and restricted backup verification. Regular index creation may block writes; no blind db push. Existing CurrentUser-DPAPI backup retained; full restore not-run and Storage bytes absent. Exact migration approval remains required after final CI.

## Release and handoff

#134-#155 merged22/46, main/alias24196faf READY. #156 real isolated OTP concurrency gate still blocks next sequential release. A new explicit question offers only a disabled-feature release exception; no approval has been received or inferred. #157 migration approved; #159-#162/#164 requests pending; #165/#166 exact schema requests wait for current CI. Later independent work continues.

Staff use the quality filters to inspect sources one item at a time; filter totals overlap. Open each source record for an authorized decision. The read queue never publishes, classifies or sends notifications. If the new RPC fails, return to all-items; rollback can disable new reads and retain additive RPC/indexes. Never automatically clear source warnings or restore old content over newer revisions. Payments and new schedules remain disabled; existing webhook/reconciliation intact. Fresh final CI pending.
