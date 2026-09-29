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
