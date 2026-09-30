# Concrete release checkpoint — 2026-10-01 HKT

Captured 2026-09-30T22:15:00.772301+00:00. Tested combined source `290abb19a781ce41efc7ad62410a0a278113bf36`. This checkpoint is documentation/evidence only; independent final integration review and its exact-head CI follow. It records executed results, not a new implementation plan.

## Actual rollout and current gates

26 of the46 requested releases (#134–#159) are actually on main. Original157 main publication was corrected by181 without migration replay.180 remains do-not-merge. Freshly verified main and production alias are `07e4c881863b715342ed0757aad7bd691a272738`, CI36758558621 all five SUCCESS, deployment `dpl_D6goofbM7umWWoTqQVGtBxHzkvVP` READY, ledger98. No160+ production DDL/merge occurred. All160–179 prepared branches explicitly target main; each later merge still waits for its predecessor's actual main gates and alias.

| Command | Environment / exact SHA | Actual result |
|---|---|---|
| `bun test --isolate --timeout 30000` | Windows; source`290abb19a781ce41efc7ad62410a0a278113bf36`; loopback checkoutDB57322/Auth52321; build placeholder54329 | exit0; 62.30s; 3195pass/168skip/0fail/10138assert/592files |
| `bun run typecheck` | Windows; source`290abb19a781ce41efc7ad62410a0a278113bf36`; loopback checkoutDB57322/Auth52321; build placeholder54329 | exit0; 24.32s |
| `bun run lint` | Windows; source`290abb19a781ce41efc7ad62410a0a278113bf36`; loopback checkoutDB57322/Auth52321; build placeholder54329 | exit0; 35.91s;0errors/52existingwarnings |
| `bun run build` | Windows; source`290abb19a781ce41efc7ad62410a0a278113bf36`; loopback checkoutDB57322/Auth52321; build placeholder54329 | exit0; 51.70s |

`git diff --check`: exit0; all tracked files unchanged by gates. Logs remain ignored; [sanitized command receipt](final-local-gates-20261001.json). The168 skips are not passes. Per-feature isolated DB/RLS/role/backfill/UI proofs are retained at their own recorded SHAs/environments; they were not rerun by this final suite. Provider sandbox payments, real-role hosted API/private-file/export UAT, full7-step submitted journey, full restore/off-machine/Storage recovery and two-geography cold/warm region samples are not-run.

The latest read-only production public catalog has138tables/276functions/98ledger rows. The unchanged146-requirement checker reports92issues:21missing tables,61missing functions,10missing columns, exit1 incompatible. This includes earlier upload/atomic/fingerprint dependencies as well as pending feature schema. R01 remains open. [Exact current report](production-compatibility-20261001.json); [named migration packet and rollback](migration-approval-packet-20261001.md). SourceCI/build success does not certify production compatibility. No entire-manifest DDL authorization is inferred.

## Every issue lifecycle

| Issue | Code complete | Schema ready | Deployed | Operationally enabled |
|---|---|---|---|---|
| PAY-01 | partial | yes (checkout schema in production) | yes (#135; present in production #155) | no |
| PAY-02 | yes | yes (production 20260929003610) | yes | yes (admission gate; payments disabled) |
| PAY-03 | yes | yes (production 20260929004923) | yes | no |
| PAY-04 | partial | yes for payment config path (isolated) | yes (#135; present in production #155) | no |
| PAY-05 | partial | partial: PR165 isolated SQL verified; exact production schema absent | no (PR165 waits for sequential predecessors) | no |
| CONTENT-01 | yes | yes (#153) | yes (#153) | partial; no automatic classification |
| CONTENT-02 | partial | yes (#155) | yes (#155) | yes (bounded listing); paid transforms disabled |
| VOL-01 | yes | not-required; catalog present | yes (#151; present in production #155) | no |
| VOL-02 | yes | not-required; catalog present | yes (#151; present in production #155) | no |
| SPON-01 | yes | yes (production 20260929125117) | yes | no |
| SPON-02 | partial | yes (production 20260929125117) | yes | no |
| SPON-03 | partial | not applicable | yes (#142; present in production #155) | no |
| SPON-04 | partial | not applicable | yes (#142; present in production #155) | no |
| ADOPT-01 | yes | not applicable | yes (#140 and #141 merged; production READY) | no |
| ADOPT-02 | yes (UI implementation) | not applicable;179 no new SQL | partial (#140/#141); focused #179 wizard slice not deployed | no; retention and hosted journey gates |
| CRM-01 | yes | yes production (#156 20260930163010; #157 20260930165057) | yes (#156/#157 via #181) | no |
| ADMIN-01 | yes | yes (production 20260929160535) | yes | no |
| ADMIN-02 | yes | yes (production 20260929162248) | yes (#149; present in production #155) | no |
| ADMIN-03 | yes | n/a | yes (#150; present in production #155) | no |
| ADMIN-04 | yes for implemented tag/review/assignment/preview/worklist slices | isolated evidence retained; 13 pending source files not deployed; global catalog incompatible | partial (#152/#158/#159); #160-#179 not deployed | partial; hosted staff UAT pending; payment/new schedules off |
| PERF-01 | yes | yes (#155) | yes (#155) | yes (bounded listing); paid transforms disabled |
| OPS-01 | yes | not-applicable (historical CI incident) | yes | n/a |
| SEC-01 | yes for deployed fail-closed Turnstile/limiter and signed-proof source guards | no | partial (#134 and #139 deployed) | no |
| R01 | no | no; current checker146requirements/92issues (21tables,61functions,10columns) | partial (#134-#155 dependency slices) | no |
| R02 | yes (readiness slice) | no new schema; existing dependencies independently gated | no (#168) | no |
| R03 | yes | yes (production 20260929150318) | yes | no |
| R04 | yes | yes (production 20260929150318) | yes | no |
| R05 | yes | yes (production 20260929151028) | yes | no |
| R06 | yes | yes (production 20260929152453) | yes | no |
| R07 | yes | not applicable | yes | partial (provider UAT pending) |
| R08 | yes | yes (#154 four approved files) | yes (#154) | no; new media cron disabled |
| R09 | no | not-applicable (no DB region move) | no | no |
| R10 | yes | not applicable | yes (#138; present in production #155) | yes (date formatting only) |
| R11 | partial | not applicable | yes (#138; present in production #155) | partial (font byte cache) |

[Both trackers](tracker.csv) retain34unique IDs and every issue's PR/commit, command evidence and owner blocker. The plan tracker is [here](../../superpowers/plans/2026-09-27-audit-remediation/HKSCDA_Remediation_Tracker.csv). OPS01 stays historically closed; new releases retain all gates. #133 revision fallback remains limited toPGRST205/42P01; permission/unexpected/no-published/invalid-content failures do not fall back.

## Prepared PR heads

| PR | Exact observed head / state | Latest checks at capture |
|---|---|---|
| [#160](https://github.com/YNWAforever/hkscda/pull/160) | `ffe4db25ce7ac65b077a073ec54ce0fb882864b2` / OPEN / draft=True | 5/5 success; failed=[]; later completion is verified in the PR body |
| [#161](https://github.com/YNWAforever/hkscda/pull/161) | `f0ad57ea30f9a93a1d78bf8092f33116d2243c2c` / OPEN / draft=True | 5/5 success; failed=[]; later completion is verified in the PR body |
| [#162](https://github.com/YNWAforever/hkscda/pull/162) | `4d1289e50c9ffe694ff3dab9a2ac74cd9d59c17b` / OPEN / draft=True | 5/5 success; failed=[]; later completion is verified in the PR body |
| [#163](https://github.com/YNWAforever/hkscda/pull/163) | `6ca3e3380a4bc23ea7c372907b40a2851e0f5568` / OPEN / draft=True | 5/5 success; failed=[]; later completion is verified in the PR body |
| [#164](https://github.com/YNWAforever/hkscda/pull/164) | `bc4b5a6fd753c2a1e4008f7c6bff486106f0575d` / OPEN / draft=True | 5/5 success; failed=[]; later completion is verified in the PR body |
| [#165](https://github.com/YNWAforever/hkscda/pull/165) | `0a37ae0faea1f43de70ffa968f624ac1632a9ea5` / OPEN / draft=True | 5/5 success; failed=[]; later completion is verified in the PR body |
| [#166](https://github.com/YNWAforever/hkscda/pull/166) | `91953ffa2016cc2a5e7d6fee96fe96b94017cc80` / OPEN / draft=True | 5/5 success; failed=[]; later completion is verified in the PR body |
| [#167](https://github.com/YNWAforever/hkscda/pull/167) | `3e021d7ab7e8b365b6f0f6cdec02be8f66eacd85` / OPEN / draft=True | 5/5 success; failed=[]; later completion is verified in the PR body |
| [#168](https://github.com/YNWAforever/hkscda/pull/168) | `9d063e5d3867366d96edf669fd00793656649616` / OPEN / draft=True | 5/5 success; failed=[]; later completion is verified in the PR body |
| [#169](https://github.com/YNWAforever/hkscda/pull/169) | `bb34bfc2c038527701f19bfc9147235f0c8a01b6` / OPEN / draft=True | 5/5 success; failed=[]; later completion is verified in the PR body |
| [#170](https://github.com/YNWAforever/hkscda/pull/170) | `ea5eb539e55d22770ad5a95c0c23d63c95e669d6` / OPEN / draft=True | 5/5 success; failed=[]; later completion is verified in the PR body |
| [#171](https://github.com/YNWAforever/hkscda/pull/171) | `15596e7892fef4a0271cd21eaa761cf2d35976b6` / OPEN / draft=True | 5/5 success; failed=[]; later completion is verified in the PR body |
| [#172](https://github.com/YNWAforever/hkscda/pull/172) | `f0294436c0ecf417330bc4279ad7caf89dba707f` / OPEN / draft=True | 5/5 success; failed=[]; later completion is verified in the PR body |
| [#173](https://github.com/YNWAforever/hkscda/pull/173) | `da2d9b85a239ba41f3590f653a9df490aedfc8a7` / OPEN / draft=True | 5/5 success; failed=[]; later completion is verified in the PR body |
| [#174](https://github.com/YNWAforever/hkscda/pull/174) | `e42378e83797e2546760543582a0128486d4dc5b` / OPEN / draft=True | 5/5 success; failed=[]; later completion is verified in the PR body |
| [#175](https://github.com/YNWAforever/hkscda/pull/175) | `66663ba8abca94d9afbfdbff35d41f5f65f8fa88` / OPEN / draft=True | 5/5 success; failed=[]; later completion is verified in the PR body |
| [#176](https://github.com/YNWAforever/hkscda/pull/176) | `1e21f9b3d4d2cf928f9e2b75b54a8e68088f6798` / OPEN / draft=True | 5/5 success; failed=[]; later completion is verified in the PR body |
| [#177](https://github.com/YNWAforever/hkscda/pull/177) | `3571eb554fde1fa3f94dffdc1c2da000b17c9468` / OPEN / draft=True | 5/5 success; failed=[]; later completion is verified in the PR body |
| [#178](https://github.com/YNWAforever/hkscda/pull/178) | `4ac62d8e11f897b2699f254682b362213a53ffd0` / OPEN / draft=True | 5/5 success; failed=[]; later completion is verified in the PR body |
| [#179](https://github.com/YNWAforever/hkscda/pull/179) | `290abb19a781ce41efc7ad62410a0a278113bf36` / OPEN / draft=True | 5/10 success; failed=[]; later completion is verified in the PR body |

Snapshot timing is explicit: [46 PR records](pr-status-20261001.json). Cancelled duplicate179 runs from its base edit are not green passes; the new documentation-head CI is mandatory. Current green completion is appended to the existing PR body without rewriting historical failed runs.

## Reproductions, roles, concurrency and partial failure

#160/161/162/164/170/178 now check wall-clock expiry after genuine DB lock waits. Exact blocker PIDs and full item/assignment/audit snapshots prove rejection without writes; normal replay/version conflicts remain. #170 actualCI36779128139 had1failure (`finish` undefined after realcrypto). Its independently reviewed test-only request-start signal has deterministic delayed-crypto RED then GREEN; repaired sourceea5eb539 has fresh CI and is inherited in171 onward. Business code/SQL were not changed for that test failure.

#175 actual payment/donation/reconciliation waits crossed expiry, and the handled23505 committed unique-index competitor path was tested separately. The reviewed expiry guard runs outside the handled exception so it rolls back financial facts, delivery job, item and audit together. Completed retries stay completed. Its19focused tests/102assertions and separate1test/24assertions passed.1000synthetic items produced897success/100skip/3conflict; full rehearsal rolled back, six old synthetic rows stayed unchanged, and original clone catalog/ACL/ledger/facts plus all9inherited audits were restored. One initial cleanup gate caught3anonymous fixture audit rows; exact fixture-scoped cleanup restored them before continuing, and that failure is retained in the175 report. No production payment or bank confirmation was performed.

#178 preserves legacy ordinary column grants while denying unauthorized direct assignment edits. Exact1000item rehearsal produced898success/101skip/1conflict, preserved15old synthetic supporters and rolled back audit/catalog. #165 isolated retry/concurrency/audit failure/email failure evidence retains succeeded financial status. Real provider sandbox transactions are not-run; these are isolated synthetic DB/handler proofs, not live provider acceptance.

## Before/after UI and same-environment performance

The owned179 UI code is unchanged by the later test/SQL integrations. Retained actual built178-before /179-after captures use Chromium148.0.7778.96, the same Windows host and read-only fixture54329, width390/768/1440,height1000. Single unthrottled cold-navigation CLS observations:390 `0.104719→0.000861`,768 `0.011590→0.000000`,1440 `0.070421→0.070421`. After:0Axe violations/0overflow/0page errors at all three widths. These are single samples, not medians or hosted performance claims. Keyboard candidate removal/re-ranking, next/back/empty state and sponsor tray preservation were exercised. [Six hashed screenshot links and exact evidence](sequential-merge-179-20260930.md); [earlier controlled Lighthouse before/after and other UI proofs](ui-performance.md). Full7-step submission/upload/expiry journey remains not-run.

Fresh metadata still places production functions iniad1 and DB inap-southeast-1. No region configuration or DB region changed. [R09 record](region-benchmark.md) requires a private same-fixture deployment, plan constraints and Hong Kong plus another region's30cold/warm samples before recommending a switch; those measurements are not-run.

## Staff handoff and external owners

Use retained actor-scoped operation IDs after unknown responses; refresh authoritative state before retrying. Snapshot→preview→per-item permission/version check→apply→result remains enforced; inspect/export each result, never infer whole-batch success. Do not bulk approve adoptions, issue refunds or merge identities through these tools. A saved draft is not a submitted case. Proofs/private files require current role and authorized signed access; hosted identities must exercise those actual routes before operational signoff.

Payments, new delivery sending and new media schedules stay disabled. Existing webhook/reconciliation paths must continue. A successful payment stays successful if receipt/email fails; inspect the durable failed job independently. Terms, policy/content/retention versions, scoped staff/supporter/finance identities, provider sandbox credentials and activation approvals are external. Config versions remain null until certified. The previously verified restricted CurrentUser DPAPI backup remains local and uncommitted; full restoration and Storage bytes are not claimed. [Staff operations](operations-handoff.md), [migration runbook](migration-runbook.md), [current release metadata](release-manifest.json), [UAT evidence and not-run boundaries](uat-results.md).

Next release action waits on the existing160named migration question, fresh candidate-specific preflight and exact-head greenCI.161's earlier named schema/backfill approval remains operative. Other new files and earlier legacy slices need explicit reviewed scope authorization; this packet does not approve them. No public preview, paid Supabase branch, actual notification/refund/content/payment/production migration was created during this checkpoint.

## Final isolated schema contract drill — 2026-10-01 HKT

Current146-object checker on the existing dedicated loopback57322 baseline: exit1 with one missing `list_sponsorship_followup_assignees` RPC. The schema-only per-feature clone52322 separately reports45legacy gaps (exit1); its focused rehearsal evidence is not a full-schema certification. In a single-connection transaction on57322, only the exact reviewed169 picker declaration/service-role grants from canonical c1eb28ad were temporarily created; all146 implemented public schema checks then reported compatible/0issues/exit0. Rollback restored the exact original checker report, function definitions/OIDs/owners/ACL/config and migration ledger. No application data DML or production connection. This certifies the implemented structural checks, not current function-body hashes, all private/storage/index constraints, provider behavior or hosted UAT.

Two harness attempts actually failed before BEGIN/DDL: aggregate `pg_get_functiondef`42809 and Bun's explicit transaction client guard. Both are recorded alongside the successful correction. [Actual sanitized receipt](final-isolated-schema-drill-20261001.json). Source/SQL/UI bytes and the prior3195pass168skip/type/lint/build results are unchanged. Production remains146requirements/92gaps/ledger98.
