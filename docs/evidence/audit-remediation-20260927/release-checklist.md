# T24 · audit remediation release checklist

Updated 2026-09-30 HKT. **Next sequential release: NO-GO** because #156's actual isolated Auth concurrent OTP check fails. #134–#155 have merged sequentially (22/46); their exact main CI runs were re-read and all conclude success. Current main/production alias is 24196faf027998388eff3196a6979e23566e2443, Vercel dpl_DJpjHkmVayPsXZqwiA2CMJG43Ygk READY, main CI 36624781016 all five gates green. See pr-status-20260930.json for each merge SHA, URL and CI. #156–#179 remain open; later reviews continue while this gate is blocked.

Source freeze c685b23b8ff18af8a73af858f51f48e7bb1f6f91 includes repaired #162, not later #164–#179. PR163 changes documentation only. release-manifest.json binds this source to 51 unique migration-file checksums; all 51 were compared against committed Git bytes with zero mismatches. Manifest SHA-256: 4023e54be04e6c90a5984cbff4a8d89170da167e5b2e8ef7f914bce0adfb432e. This is an inventory, not permission to apply files in CSV order. Configuration nulls are unverified activation versions. Both trackers separate code, schema, deployment and enablement; partial issues stay open.

## Gate register

| Gate | Actual state and evidence |
| --- | --- |
| Isolation / main | Separate worktrees and PRs; unrelated original work retained. Main/alias verified at #155. |
| Typecheck / lint / build | PR162 typecheck initially failed on new test implicit-any; explicit type repair passed. Lint exit0, 52 warnings. Parallel builds collided in shared node_modules/.nitro (exit1); a serial synthetic build repeat passed exit0. Build is not typecheck proof. |
| Full isolated tests | PR162 repair: 3006 pass /121 skip /0 fail;9383assertions/540files/33.55s, exit0. Loopback checkout DB57322 and AuthAPI52321. Repeated after the queue unmount persistence repair on e9352e56. |
| Schema / RLS / atomic audit | PR162 schema-only production clone52322:6tests39assertions, actual service/denied roles, audit rollback and concurrent retry, exit0. 1000-item result796success202skip2conflict, animal fields unchanged. Full SQL rollback253ms, no backfill. Each preceding release has its own exact rehearsal/postflight. |
| Remote CI | #159 run36626877044, #160 run36627282399, #161 run36629148497 all five green. Current-head #162 and documentation #163 gates pending at this capture. |
| Supporter recovery | Actual isolated Auth v2.197.0 + Mailpit fails one-time concurrent redemption (two sessions), exit1. Known/unknown/wrong identity/expiry/sequential replay/suspension checks pass; no supported provider/config fix verified. Recovery remains disabled. |
| UI / keyboard / a11y | #159–#162 actual components at390/768/1366, 200% zoom, recovery/partial failure/CSV/pagination; synthetic APIs, zero Axe/page errors. Hosted actual-role full journeys not-run. |
| Same-environment performance | #155 10k loopback: p50/p95 221.73/306.33ms→17.56/29.49ms, 11→1calls, 4787800→15285bytes. #138 font fetch100→1 with no proven CPU/size benefit. Hosted regional T20 not-run. |
| Provider sandbox / email | Actual payment-provider sandbox, refund and hosted sending not-run. Local Auth email test sink was run. No real payment/refund/notification was tested or enabled. |
| Production schema / backup | Ledger95; #134–#155 required approved schema applied and verified. #157/#159–#162 candidate schema not applied. Restricted CurrentUser-DPAPI logical backup exists; checksum/ACL/roundtrip verified earlier; full restore not-run and Storage bytes absent. |

## Approval and compatibility boundaries

Sequential main releases when green are already authorized. Do not ask for the same release approval again. Exact production migration approvals remain separate: #157 approved; #159/#160/#161/#162 exact requests pending; #162 SQL hash unchanged by the later queue fix. Production #153/#154/#155 exact approved migrations are complete. No paid Supabase branch is authorized.

Payment activation, new sending/media schedules, public preview, real content classification/publication, notices and refunds remain separately gated. Preserve existing webhook/reconciliation intake while new checkout is disabled. Receipt/email failure never changes succeeded payment to pending. Retain #130 proof intent, fingerprint/idempotency, body limit, suspended-user recheck and commit-before-public media behavior; #133 fallback remains limited to CMS revision-read PGRST205/42P01.

Before each next approved schema change: verify the reviewed source hash, current catalog/signature/grants/RLS/indexes, backup inventory, exact per-PR rehearsal and unchanged-row assertions. Observe provider ledger identifiers; never fabricate historical entries or run blind db push. No end-to-end full restore or one-shot 51-file production upgrade has been certified. Revert only to a compatibility-proven app/config while retaining additive versions, operations and audit/payment facts; never restore an old snapshot over later events.

## Next concrete work

1. Keep #156 disabled/draft until supported atomic OTP consumption passes every redemption path and hosted parity is verified. Continue independent repairs/reviews of later PRs.
2. Finish exact-head CI and outstanding exact migration approvals; apply and merge only in the authorized sequence after the predecessor's main gates and alias postflight.
3. Obtain approved terms/payment methods/content/session policy and role identities; complete provider sandbox, hosted API/export/private-file and mobile/keyboard journeys before those operations are enabled.
4. Hand staff the per-domain preview/apply/result/recovery instructions and rollback boundaries below. Existing merged code is not proof of all operational activation.

## PR164 source update

Source freeze 5793e12d6933ba06c58c226d29a4ca8931601398 includes reviewed CMS bulk and both queue unmount guards. Inventory now52unique SQL files, all committed LF hashes verified; CSV SHA256 a3519ee326b19427326b51cdb8606aa8792dc16b499af76622931d078a1892cf. Historical #163 freeze above remains labelled. CMS clone6tests39assertions,1000items796success202skip2conflict,unchanged content/revisions,full SQL rollback298ms;actual queue/component UI passes. Typecheck/lint/serial build exit0,52lint warnings; final full suite3012pass127skip0fail/9419assertions/543files/33.81s/exit0; exact remote CI pending. Production unchanged at#155, #156stillNO-GO; #164 exact SQL approval not yet requested.

## PR165 source update

Freeze 421bf7f790dd595fbc0161ea885605dde617f3f4;53 source SQL checksums and updated CSV hash. Local full3017pass131skip9445assertions/36.43s;typecheck/lint/build0,52warnings;manualDB4tests29assertions;CRM17tests90assertions;UI3widths/Axe0;full-file6-row rollback251ms. Four independent findings closed. Fresh CI pending; exact SQL approval not yet requested. Production remains#155;#156blocks next release.

PR162 selection-generation backport61e8952f verified:3006pass121skip/9383assertions/45.61s;typecheck/lint/build0;actual queue delayed-kind-cycle regression red25 to green0;SQL unchanged. Current source/CI metadata supersede earlier capture; remote gates pending.

## PR166 current source update

Freeze 4f3f2f7e22afc2d8d2bbdf4cb05044a6701df7ee;54 committed SQL hashes verified. Runtime identical to tested e229f46d:3022pass133skip9462assertions/40.72s;typecheck/lint/build0,52warnings;DB2tests122assertions;UI3widths/Axe0;SQL7rowsrollback253ms. Fresh remote CI pending. #156 remains blocked; requested disabled-feature exception unanswered, not an approval.


## PR167 verified read queue (2026-09-30)

See sequential-merge-167-20260930.md for exact commands, source SHA, local PostgREST and three-width browser evidence. No new migration; not deployed. Pending proofs are filtered before count/page, including active pledges with later proofs. Staff review each current proof; no bulk money approval. Earlier #156 OTP release blocker remains. #165/#166 exact schema questions now pending after five green CI gates.


## PR168 readiness verification (2026-09-30)

See sequential-merge-168-20260930.md. Final3051pass/133skip, strict typecheck/lint/build0 and actual three-width SSR/client navigation/Axe0. Server-generated references correlate for client navigation; transport failures do not invent a reference. Stable section IDs tolerate approved CMS copy edits. No migration or schedule activation. #167 fivegreenCI36640615081; #168 freshCI pending; ordered #156 gate and predecessor schema approval questions remain.


## PR169 preparation — 2026-09-30

PR169 local code/gates ready,production schema/deploy/enable not ready. Inventory55. Full3065pass137skip,typecheck/lint/build0;12browser cases/Axe0;exact source SQL rehearsal. Await exact-headCI,ordered predecessors and schema approval. #168 fivegatesSUCCESS36642612271;#156 actual OTP failure remains blocking.
## 2026-10-01 HKT current sequential checkpoint (supersedes prior status)

26/46requested PRs released through#159; main/production07e4c881863b715342ed0757aad7bd691a272738, mainCI36758558621 all5SUCCESS, READY dpl_D6goofbM7umWWoTqQVGtBxHzkvVP. #157 main publication used corrective#181 after its original dependency-base merge; no migration replay. #156 now uses the reviewed application-owned single-use recovery broker; prior isolated provider OTP race is historical, not the current source blocker. Recovery/sending activation remains separately gated.

Source freeze is reviewed combined PR162 `4d1289e50c9ffe694ff3dab9a2ac74cd9d59c17b`; this PR changes documentation only and excludes later164–179source. Manifest52unique migration files recomputed against actual canonical LF SQL with0mismatches. Updated release-manifest.json and pr-status-20261001.json distinguish source, actual main releases, isolated schema and enablement. Prior20260930report remains historical. Fresh exact-head PR162/PR163 remote gates are pending at this capture; no fresh local full/type/build rerun for identical source in this documentation-only descendant.

Next sequential release holds only at #160's pending single production migration approval. #161's explicit named-file schema/backfill approval remains operative after two strictly narrower wall-clock expiry checks; exact new hashcd143432 disclosed, schema/grants/backfill unchanged. Fresh predecessor main/alias, catalog/signature/grants/RLS/checksum/backup and postflight remain mandatory. #162 and later unapproved production migrations await named approvals; no blanket schema rollout.

Restricted backup refreshed2026-09-30T16:29:12Z: encrypted1,913,782bytes, SHAae4c855334e4685cfc10c289c0be50ae960dc047934128eb8b98da209afb755d. Schema/data/roles were separate in-memory dump processes, not one cross-dump snapshot; CurrentUser DPAPI roundtrip and restricted ACL checked. Full restore, off-machine copy and Storage object bytes remain not-run. Backup precedes156/157/159additive changes; replay exact approved empty-object migrations if recovery requires those objects. Preserve later financial/audit facts and additive history on app rollback; no older snapshot restore over new facts.

Staff: existing deployed overview/CRMtag bulk use stored snapshot→preview→per-item permission/version checks→apply→result/recovery. Expired/stale items require new preview; retry unknown outcomes from the saved operation. Reviewer/adoption/animal/CMS controls remain release-gated in later candidates. No blind refunds/adoption approvals/identity merge. Payments/new recovery/delivery/media schedules remain disabled; existing signed webhook/reconciliation remains compatible. Hosted staff-role API/export/private-file journeys, approved terms/content, provider sandbox/full journeys and same-region hosted T20 are not-run/unverified; null configuration versions remain null.
