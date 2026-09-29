# T24 · audit remediation release checklist

Updated 2026-09-30 HKT. **Next sequential release: NO-GO** because #156's actual isolated Auth concurrent OTP check fails. #134–#155 have merged sequentially (22/46); their exact main CI runs were re-read and all conclude success. Current main/production alias is 24196faf027998388eff3196a6979e23566e2443, Vercel dpl_DJpjHkmVayPsXZqwiA2CMJG43Ygk READY, main CI 36624781016 all five gates green. See pr-status-20260930.json for each merge SHA, URL and CI. #156–#179 remain open; later reviews continue while this gate is blocked.

Source freeze f330d1f2c8d8286e0db66bad102b4035008dc53f includes repaired #162, not later #164–#179. PR163 changes documentation only. release-manifest.json binds this source to 51 unique migration-file checksums; all 51 were compared against committed Git bytes with zero mismatches. Manifest SHA-256: 4023e54be04e6c90a5984cbff4a8d89170da167e5b2e8ef7f914bce0adfb432e. This is an inventory, not permission to apply files in CSV order. Configuration nulls are unverified activation versions. Both trackers separate code, schema, deployment and enablement; partial issues stay open.

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
