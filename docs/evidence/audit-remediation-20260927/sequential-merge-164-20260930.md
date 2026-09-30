# PR #164 CMS draft bulk review — sequential verification, 2026-09-30 HKT

## Scope / source

Integrated baseline e8d0c5aa; primary repair afca41908c40d7585d3968768259f85719465ad3; queue-race repair 04f8ad07caa43a56a620d48e60b4678081596b33. Admin-only batch classification of unclassified current CMS draft revisions as needs_review. Publication state/pointer, content body, media and immutable revisions remain unchanged. No sending or automatic publication. Code reviewed / isolated schema ready / production schema absent / deployed no / operationally enabled no. ADMIN-04 remains partial for later domains.

## Failure-first repairs / review

- API malformed JSON returned503:2pass1fail/13assertions/exit1. InvalidRequestJsonError now returns400, retaining413/no-store and zero mutation.
- Actor/Auth changes committed mid-apply: baseline4DBpass1fail/25assertions/exit1. Shared Auth/admin row locks hold eligibility through commit. Draft/content-item lock continues to serialize archive, revision and editorial changes. Corrected API+DB8pass46assertions/1017ms/exit0 before large fixture addition.
- Failed GET lost saved ID and delayed mount GET allowed replacement preview: three-width browser red exit1 with all recovery checks false. Preserve ID/retry, busy/active mount completion, disable evidence during request; final three-width checks true/exit0.
- Independent review found an additional queue-switch race: old preview A could persist after unmount and overwrite newer B's recovery ID. Actual ContentReviewQueue browser test reproduced for both CMS and animal panels (visible B, saved A; exit1). Mounted guard now returns before persistence after unmount; both branches pass/exit0/no page errors. Equivalent animal repair was backported to PR162 e9352e567de4ee87998dcc1915a1685d16fe821f. SQL unchanged. Reviewer closed P2 at04f8ad07; no remaining scoped findings.

## Commands / observed outcomes

| Command | Environment / source | Actual result / exit |
| --- | --- | --- |
| `bun test --isolate --timeout 30000` | afca4190; checkout DB57322/postgres and AuthAPI52321, both loopback |3012pass/127skip/0fail;9419assertions;543files;40.12s/0 |
| `npm.cmd run typecheck` | afca4190 strictTS |0; post-queue repeat also exit0 |
| `npm.cmd run lint` | afca4190 |first1:4prettier errors in new fixture; formatted exact file, repeat0/52warnings |
| `npm.cmd run build` | Synthetic keys/loopback54329 before queue repair |0; post-queue repeat also exit0 |
| `bun test src/lib/contentReview/cmsBulk.database.test.ts` | CMS_REVIEW_BULK_TEST_ALLOW_LOCAL_FIXTURES=1; exact52322/audit_pr135_20260929 schema-only clone |6pass/39assertions/0fail;1178ms/0 |
| `node scripts/verify-cms-review-bulk-review.mjs` |Actual component/syntheticAPI/loopback56562 |390/768/1366px, keyboard/200%zoom, recovery/partialapply/CSV/1000pagination;0Axe/pageerrors/nooverflow;0 |
| `node scripts/verify-editorial-queue-race.mjs` |Actual ContentReviewQueue/syntheticAPI/390px;04f8ad07 |CMS+animal stale response fence true/visible latest true/pageerrors0;0 |
| Full exact SQL in BEGIN/ROLLBACK |1000synthetic content/revision pairs, clone52322 |298ms including process startup/0 |

DB fixtures execute commands as service_role; denied anon/authenticated RPCs, actor downgrade/disable/Authban, expiry, stale revision, classified/not-draft/missing-draft cases, forced editorial audit rollback and simultaneous duplicate apply are exercised. One thousand items produce796success/202skip/2conflict. Duplicate retry adds no audit; hashes of all content-item and immutable-revision fields remain unchanged. Initial large-fixture run5pass1fail/exit1 correctly hit the existing editorial approval trigger when trying to publish an unapproved synthetic revision. The fixture was corrected to archive, preserving the trigger. No application bypass was added. Final fixture cleanup leaves zero content items/revisions/users/operations/items.

Before/after screenshots:ui/t23-cms-review-bulk-{before,after}-{390,768,1366}.png. Interrupted browser response after ten synthetic writes recovers and reaches exactly25 writes, with per-item CSV and1000-item/40-page table. Actual queue integration independently verifies the kind-switch race. Every hidden Vite fixture/browser stopped. Hosted staff/roles/private files, provider payment sandbox and real notifications not-run; local public performance not-run. Skips are not passes. Exact-head CI is required after push.

## Migration / rehearsal / production catalog

20260927190000_cms_review_bulk.sql canonical LF SHA-256 **79720b899eee34d673cef16f93e9ac1fba62ce7d21cb73039feb3851ee3499e5**. Corrects only the undeployed actor guard. Two new RLS operation/result tables, two indexes, three public service-only definer RPCs and one private guard, all four empty search_path. Table service SELECT true/direct INSERT+UPDATE false; anon/auth SELECT/EXECUTE false. Existing editorial_review_command performs classification and audit atomically. No backfill or draft creation.

Exact full-file rehearsal verifies local candidate tables/content/Auth empty, drops only candidate objects in BEGIN, seeds1000old-shape content and revision pairs, creates all candidate schema, and asserts unchanged hashes. ROLLBACK restores prior clone state. Postflight signatures/RLS/grants checked and aggregate fixture counts zero. No local or production ledger fabricated.298ms is not a production lock estimate.

Production read-only:ledger95,7content items,0draft-status items,7revisions; candidate table/RPC absent; checkout disabled. Exact approval, fresh catalog/signature/grants/RLS/hash and restricted backup check remain required before production DDL. Existing CurrentUser-DPAPI logical backup has no Storage bytes; full restore not-run.

## Release / rollback / staff

#134–#155 remain merged22/46; production/main24196faf. #156 actual isolated AuthOTPconcurrent redemption failure blocks next ordered release, recovery disabled. #157migration approved; exact#159–#162questions pending. #164approval not requested until concrete review/current CI complete. #162had five green atae80846b but its new queue-race repair requires new gates; do not reuse the older green result.

Rollback disables the new UI/API and retains operation/results/editorial audit history and immutable revisions. No schema drop or old backup restore over newer events. Staff select CMS scope, enter source/reason, inspect before/after/exclusions, confirm and apply bounded batches. After uncertain response reload durable results; continue pending items, re-preview changed/conflicted/expired scope. needs_review does not publish or approve content. Existing webhook/reconciliation remains intact; payments/new schedules/sending/content activation remain gated.

Final queue fix04f8ad07 typecheck/lint exit0 (52warnings), serial synthetic build exit0. Upstream release package64297087 and identical #162 backport integrated at5793e12d6933ba06c58c226d29a4ca8931601398. Final full suite on integrated5793e12d:3012pass127skip0fail/9419assertions/543files/33.81s/exit0. Fresh CI pending.

Selection-generation backport integrated at168cca319ef7c4c7931d3adcd024f176b3e95e56. Both actual animal and CMS kind-cycle regressions on56562 retain0 selected checkboxes/no page errors, exit0; server/browser stopped. Inherited #16261e8952f full3006pass121skip/typecheck/lint/build0; this integration local full/lint/build not rerun, fresh CI will gate the exact combined head. Earlier full3012 and other evidence remain labelled by source. SQL/hash unchanged; exact approval question remains pending.

Strict typecheck after selection merge168cca31:exit0. Prior #164 head da0c1126 CI36634733139 five green; new head CI required.


## Task164 held-lock expiry repair — 2026-10-01 HKT

Independent base `314783b853b12495b35934aa49bf9b64e4d9d245`; verified source commit `f1d6686945d11941c0fb04b3c64356926b285301`. The original candidate used transaction-start now() across locks. Two parameterized real-lock regressions (operation and content_item) started apply while live, proved backend blocking via pg_blocking_pids, retained the unchanged blocker until database clock_timestamp proved expiry, then released it. RED received no P0001 because both applies wrongly succeeded. The repaired apply uses pg_catalog.clock_timestamp() after operation/actor-assignee locks and immediately after final entity locks, before any assignment/classification/result/audit write. FOUND, authoritative Auth/admin FOR SHARE, eligible-stage locks where applicable, durable idempotency, partial results and atomic editorial command/audit are preserved. No API/UI behavior change except rejection of expired work.

| Actual command | Actual result / exit | Raw local log |
| --- | --- | --- |
| `bun test src/lib/contentReview/cmsBulk.database.test.ts` before SQL edits | RED 6 pass / 2 fail / 47 assertions / 5.60s; exit1 | task-164-red.log |
| `bun .superpowers/sdd/HKSCDA_Codex_GPT6_Sol_Implementation_Plan_2026-09-27_zhHK/task-164-rehearsal.ts` | Whole exact SQL BEGIN/ROLLBACK then clone-only apply replacement; exit0 | task-164-rehearsal.log |
| `bun test src/lib/contentReview/cmsBulk.database.test.ts src/routes/api/admin/content/review-bulk.test.ts src/lib/operations/migrationManifest.test.ts src/lib/supabaseMigrations.test.ts` | GREEN 59 pass / 0 fail / 762 assertions / 4 files / 6.92s; exit0 | task-164-green.log |
| `bun test --isolate --timeout 30000` final source | 3020 pass / 121 skip / 0 fail / 9474 assertions / 543 files / 92.91s; exit0 | task-164-full-test.log |
| `npm.cmd run typecheck` | strict TS exit0 | task-164-typecheck.log |
| `npm.cmd run lint` | exit0; 52 existing warnings; 0 errors | task-164-lint.log |
| `npm.cmd run build` exclusive serial placeholder build | exit0 | task-164-build.log |
| `git diff --check` and exact fixture census | exit0; all scoped fixtures0 | task-164-census.log |

All raw logs/helpers/full report live in this worktree's `.superpowers/sdd/HKSCDA_Codex_GPT6_Sol_Implementation_Plan_2026-09-27_zhHK/`; ignored local evidence is retained for root review. RED/GREEN uses only `CMS_REVIEW_BULK_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:52322/audit_pr135_20260929` with `CMS_REVIEW_BULK_TEST_ALLOW_LOCAL_FIXTURES=1`. Full suite adds CHECKOUT_POLICY_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:57322/postgres and SUPABASE_LOCAL_URL=http://127.0.0.1:52321. Build uses VITE_SUPABASE_URL/SUPABASE_URL=http://127.0.0.1:54329, ci-placeholder-anon-key and ci-placeholder-service-role-key. Root explicitly released exclusive DB/build slot before execution.

The new checks raise P0001. Exact unchanged entity/revision/publication/assignment and pending item/applied_at/audit comparisons pass; each captured real SQL errno is adapted to the existing PostgREST code shape and fed through the actual handler, which returns HTTP409 with no-store/Preview expired. This handler verification does not claim a live PostgREST request. Fixtures are synthetic UUIDs/example.invalid and exact cleanup or rollback; no reset/db push/CASCADE or fabricated ledger.

Whole candidate rehearsal locks candidate tables before confirming emptiness, executes all exact SQL and verifies exact signatures, pinned empty search_path, grants, RLS and indexes. Rollback restores definitions/catalog/grants/RLS and **all ledger rows**, then only the apply RPC is replaced in the disposable clone. Historical approved/deployed migrations untouched. Canonical LF SHA256 for `20260927190000_cms_review_bulk.sql` is **b564a09a64d523a8145eef01548dd90f1477ac291f7aac236f6deeca42e3efcb**; only this candidate's manifest entry changed. Any old exact approval covers old bytes only; exact new approval remains root-owned.

Self-review: minimal two-check SQL diff contains no SELECT/PERFORM in either new guard; FOUND semantics preserved. Existing auth/version/eligible-stage/idempotency/audit/1000-item tests retained and passing. Both trackers remain34rows with only ADMIN-04 changed for local code-complete/schema-ready slice. Prior UI evidence retained; new browser/provider/production measurements not-run. No production reads/writes/DDL, external provider, real notifications/payments/refunds, public preview, predecessor propagation, remote push/merge or subagents. Independent review, root integration/current remote CI and exact new production approval pending. Full-suite skips are not passes; existing lint warnings are not regressions.

Rehearsal evidence refinement: the first helper catalog compared functions/tables/ledger and counted created indexes. Added exact index-definition rollback comparison plus pre-existing entity/revision/editorial/Auth fixture guards; reran the same whole candidate command serially, exit0 (both runs retained in task-164-rehearsal.log). Source SQL unchanged. Final broad census initially asserted all audit rows0 and exited1: metadata inspection (exit0) identified five donation.delivery_queued rows dated September29–30 with null actors, predating this batch. Those unrelated rows were preserved. Correctly scoped census repeated exit0: all14 scoped entity/Auth/operation/item/review tables0, all batch audit actions0, historical donation audits5. Both census runs retained; metadata in task-164-audit-residue.log.


## Root Task164 final combined-source gates — 2026-10-01 HKT

Independent Task164 spec/quality review approved the exact repair package through599a4da87c2abc2cf9b637b1adee1f24454e6528, with no Critical/Important findings. Sourcef1d6686945d11941c0fb04b3c64356926b285301 and its SQL/test remain byte-identical after inheriting reviewed predecessor6ca3e3380a4bc23ea7c372907b40a2851e0f5568. Documentation-only conflicts preserve historical evidence and unique CSV rows; no code conflict. Candidate20260927190000_cms_review_bulk.sql canonical LF SHA256b564a09a64d523a8145eef01548dd90f1477ac291f7aac236f6deeca42e3efcb; manifest53unique rows and both trackers34unique rows. Earlier package statements remain historical. #161's filename/schema/backfill approval-scope ruling is inherited; #160 remains pending single-migration approval.

| Actual command | Actual environment/result | Exit |
| --- | --- | --- |
| bun test --isolate --timeout 30000 | Final combined source: 3093pass97skip0fail9830assertions546files115.91s | 0 |
| bun run typecheck | Strict tsc --noEmit | 0 |
| bun run lint | 0errors /52existing warnings | 0 |
| bun run build | Exclusive serial, loopback54329/CIplaceholderkeys; route map unchanged | 0 |
| read-only combined fixture census / git diff --check | Scoped generated rows0 / no whitespace or unresolved conflicts | 0 |

Full suite uses CHECKOUT_POLICY_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:57322/postgres, SUPABASE_LOCAL_URL=http://127.0.0.1:52321, and SUPPORTER_PORTAL/CRM_TAG_BULK/VOLUNTEER_REVIEW_BULK/ADOPTION_ASSIGNMENT_BULK/ANIMAL_REVIEW_BULK/CMS_REVIEW_BULK test databases all set to disposable schema-only clone127.0.0.1:52322/audit_pr135_20260929, each ALLOW_LOCAL_FIXTURES=1. No production data/provider call. The clone lacks the separate private recovery-broker table; that absence and97skips are not passing recovery DB evidence. Root retained prior isolated broker evidence separately. Logs task-164-root-integration-{full-test,typecheck,lint,build,census}.log remain in this plan workspace.

The review's unchanged-contract limits are resolved by retaining source and tests for frozen snapshot/15-minute default, authoritative actor/assignee Auth/admin shared locks, per-item versions, transaction audit, stored partial results/idempotent retry and server-only boundaries; this integration run exercises all enabled inherited bulk fixtures. The two new time guards preserve FOUND and pre-existing classification/revision/status branches. Prior UI/keyboard/a11y/performance captures retained. No new browser/livePostgREST/hosted staff/private-export/provider/production measurements; these are not-run. Lint warnings/skips remain visible.

Main/production remains actual#15907e4c881863b715342ed0757aad7bd691a272738, mainCI36758558621 all5SUCCESS/aliasREADY. #161 exact f0ad57ea CI36764490686 also all5SUCCESS. Task164 code-complete and local schema-ready only; no production migration/feature mutation/deployment/operational activation. Fresh exact-head remote CI, prior sequential release/main gates, named production schema approval, catalog/backup/postflight and hosted identities remain external gates. Existing additive rollback/payment/webhook/delivery boundaries unchanged. No paid branch, blinddbpush, fakeledger or global audit deletion.
