# Current staff handoff and release evidence — 2026-10-01 HKT

Snapshot `2026-10-01T06:26:12.182444+00:00`. This current addendum preserves all earlier audit/re-audit and sequential reports at their recorded source/environment. The original46-PR scope has **41 source merges** at remote capture `2026-10-01T06:26:08.767731+00:00`; **40/46 accepted releases** after five main gates and same-SHA READY. #182 is an additional focused approved repair. PR179 candidate acceptance must be recorded in its PR body after its actual main CI; no future acceptance is asserted here.

Last accepted main/production alias `748fd6441add145f481524ad186ce4bb1186ad9f`, CI [36823569108](https://github.com/YNWAforever/hkscda/actions/runs/36823569108), READY `dpl_BNn5LAYDtyGMySXxzop2sBuWVb1h`. Latest genuine migration ledger observed **109**. [Actual sequential receipts](all-merge-execution-20261001.json) / [all34 issue states](tracker.csv). Source deployment does not certify business content, provider behavior or operational enablement.

## Actual commands and environments

| Command / gate | SHA and environment | Result |
|---|---|---|
| `bun test --isolate --timeout 30000` | `2e9d1ee717c43cda3949d701aaa5f460f9e882b7`; Windows loopback Auth52321/checkoutDB57322; build placeholder54329 | exit0; 152.19s; 3195pass/188skip/0fail/10138assertions/593files |
| `bun run typecheck` | `2e9d1ee717c43cda3949d701aaa5f460f9e882b7`; Windows loopback Auth52321/checkoutDB57322; build placeholder54329 | exit0; 41.21s |
| `bun run lint` | `2e9d1ee717c43cda3949d701aaa5f460f9e882b7`; Windows loopback Auth52321/checkoutDB57322; build placeholder54329 | exit0; 51.07s; 0errors/52warnings |
| `bun run build` | `2e9d1ee717c43cda3949d701aaa5f460f9e882b7`; Windows loopback Auth52321/checkoutDB57322; build placeholder54329 | exit0; 117.17s |

[Local gate receipt](pr179-final-combined-local-gates-20261001.json) is bound to its actual source; later documentation-only commits retain this binding and require fresh exact-head remote CI. Skips are not passes. Recorded PR and main runs independently execute verify/typecheck/tests/lint/build, RLS matrix, brand, a11y and performance gates; each accepted row records its actual SHA/run. Hosted real-role API/export/private-file/provider/complete journey gates are not inferred from fixture CI.

## Approved schema, catalog and recovery

| PR | Exact file / canonical SHA256 | Genuine provider ledger | Actual scope / preservation |
|---|---|---|---|
| #160 | `20260927181701_volunteer_review_bulk.sql` / `96149a16e41cdf9fdf2e246b700033877fc91c3c00403a2b2efcd39d12cb3164` | `20261001014214`; 98→99 | pass;3empty tables/RLS/service SELECTonly/5pinnedservice-only functions; 2profiles/6cases/600audits hashes preserved |
| #182 | `20261001080000_service_readonly_evidence_privileges.sql` / `e0023564a32cc3f46aff90647c0fa42a9909d9826e37c72442e4cf9a0e557808` | `20261001014620`; 99→100 | pass;3tables/9rolecombinations no table/column writes;service SELECTonly;11RPCs unchanged; draft1/600audits hashes preserved;archive/export/snapshot0 |
| #161 | `20260927183000_adoption_assignment_bulk.sql` / `cd14343255b0e9c5901beed3952de6da03bcade1e56284994f5edc7e92cce238` | `20261001022601`; 100→101 | pass;2emptyRLSserviceSELECTonlytables/6pinned signatures/2validindexes/enabledversiontrigger; 6caseoriginalfields and600audit hashes preserved;6newversions1 |
| #162 | `20260927184500_animal_review_bulk.sql` / `8f5eceb8b99aecd8914f131b1a44be4eaf1a5ad3e5e6f13239d2137cbc253c41` | `20261001024348`; 101→102 | pass;2emptyRLSserviceSELECTonly tables/6table-role checks/no table or column writes/4pinnedservice-only signatures/2validindexes; 292animals/0drafts/0editorialreviews/600audits hashes and existing editorial RPC definition preserved |
| #164 | `20260927190000_cms_review_bulk.sql` / `b564a09a64d523a8145eef01548dd90f1477ac291f7aac236f6deeca42e3efcb` | `20261001031157`; 102→103 | pass;2empty RLS serviceSELECTonly tables/6table-role checks including columnwrites and MAINTAIN/4pinnedservice-only functions/2validindexes; 7content items/7immutable revisions/0editorial reviews/600audits exacthashes and existing editorial RPC unchanged; checkoutfalse |
| #165 | `20260927201916_manual_payment_atomic_reference.sql` / `d4f683821d1277d4d6b05d6d671fd63e66f6bc75d274e25496f29e4dc5c37b86` | `20261001032650`; 103→104 | pass;valid/ready normalized partial unique reference index;postgres-owned empty-search-path service-only definer RPC;4existing table RLS/owners unchanged; 6payments/6donations/0jobs/600audits exacthashes preserved;duplicate groups0;checkoutfalse |
| #166 | `20260927211801_editorial_quality_queue.sql` / `8c1b4550d4361f348246654bab356f3cd2366de48afb0eb384b90efb38526642` | `20261001034448`; 104→105 | stable postgres definer RPC with pinned empty search_path/service-only EXECUTE;2 nonunique partial indexes valid/ready; existing RLS/owners/grants unchanged; 7 content/7 revisions/0 review/600 audits hashes unchanged;checkout false; no live content operation |
| #169 | `20260928073000_sponsorship_followup_assignment.sql` / `c1eb28ad0953d0ae3f9d85c574c363ee2fe342ea68ddc5bd9f6b9b09baf04ef2` | `20261001045928`; 105→106 | two columns/FK validated;2 pledges version1/unassigned;2 public postgres definer RPCs pinned empty search_path/service-only EXECUTE;invoker version trigger/client EXECUTE denied;partial index valid/ready; existing RLS/owners/grants/triggers unchanged; 2 pledge original fields/6 payments/600 audit rows exact hashes unchanged;checkout false/version1;no live assignment/payment/notification |
| #170 | `20260928080000_sponsorship_followup_bulk.sql` / `c3819e013b6593b36d0257ad54d6920c75529596dda460f6d66011fe83857800` | `20261001051516`; 106→107 | 2 empty RLS operation/result tables;captured role-table/column write flags denied inclMAINTAIN/serviceSELECTonly;3 public service-only and1 private owner-only flags/empty paths;2validreadyindexes;338 prior bodyHash/owner/config/signature/4EXECUTEflags unchanged; 6 payments/6 donations/15 supporters/13 supporter roles/2 pledges/0 delivery jobs/600 audits exact normalized hashes unchanged; checkout false/version1;no live bulk assignment |
| #172 | `20260928090000_finance_bank_dryrun.sql` / `9f55dabaa7d884ab2fa40fdb465bd38bce10ac4f8eaec05025e66ecbc45857a0` | `20261001055531`; 107→108 | 1 valid/ready exact pending manual-payment index; service-only postgres SECURITY DEFINER preview RPC with empty search_path;342 existing function definitions/owners/config/full ACLs and existing table/column ACLs/FORCE RLS/policies/indexes unchanged; 6 payments/6 donations/15 supporters/13 supporter roles/2 pledges/0 delivery jobs/600 audits exact normalized hashes unchanged; checkout false/version1;no live bank-match preview or confirmation |
| #173 | `20260928100000_finance_delivery_retry_guard.sql` / `27a5e87e3175bd545b6fe0a03429933bb617dc4c7f30f5dd3538de61539ddf0a` | `20261001061046`; 108→109 | 1 valid/ready exact failed-delivery index;service-only failed-job list RPC;exact retry RPC body and search_path tightened to empty while its owner/signature/return/volatility/full ACL remain;342 other existing function metadata/full ACLs and prior table/column ACLs/FORCE RLS/policies/indexes unchanged; 6 payments/6 donations/15 supporters/13 supporter roles/2 pledges/0 delivery jobs/600 audits normalized hashes unchanged;checkout false/version1;no job retry/send/scheduler activation |

The63-file canonical source manifest is an inventory. Authority covers the exact separately approved scopes and named11-file packet, including #182 after explicit permission; it does not cover blind legacy replay, a ledger edit, dedupe, payment enablement or notification sending. Each application checked its dependency catalog/signatures/owner/search_path/grants/RLS within the recorded projection, actual backup, exact source/hash and accepted predecessor;5s lock/30s statement limits; one apply; read-only postflight and unchanged prior data/audit evidence. Production actor commands were not used to test behavior. [Catalog projection scope](catalog-projection-review-20261001.md) qualifies #170: captured effective flags/body metadata were preserved; full ACL/grant options/FORCE RLS/policy preservation was not retrospectively certified. Remaining migrations use the stronger reviewed projection, including exact literal case/casts/boolean grouping in index predicates.

Fresh final public catalog after all approved scopes: **pending**, not a compatible claim. Earlier ledger98/92-gap report is a pre160/182 historical snapshot. R01 legacy dependencies remain separately open.

Restricted CurrentUser-DPAPI backup `hkscda-before-next-approved-ddl-20261001T061410Z.dpapi`, SHA256 `78a3de25d70a46093b952a9aca1f3559ef3cab1f8c24fd506933bc007df175bf`, completed `2026-10-01T06:14:10Z`; restricted ACL, hash and decryption roundtrip verified. No plaintext file or Git payload. Schema/data/roles are separate in-memory dumps, not one cross-dump transaction. Full restore, off-machine recovery and Storage object bytes **not-run**.

Rollback: stop only affected new UI/writers/claims and keep existing signed webhook ingestion/reconciliation available. Keep additive schema, tightened ACLs, immutable revisions and financial/audit/event/operation/result/job facts. Never restore an older DB over newer events or mark a committed payment pending because PDF/email failed. No older complete-app rollback SHA is certified against the full schema; prove compatibility in isolation first.

## Staff workflow and partial failure

1. Verify current identity and displayed filters; distinguish25 visible versus up to1000 matching rows. Filter changes invalidate selection. Use snapshot→preview→per-item permission/version check→apply→result. No blind refund, adoption approval or identity merge.
2. Review before/after/eligibility/count/expiry. Completed items are authoritative and replayable. Expired/conflicting unresolved items require an explicit new snapshot; post-lock wall-clock checks prevent writes after a preview expires.
3. Preserve the actor-scoped operation ID on unknown responses. Read durable results before retrying still-pending items; failed refresh blocks new writes. Switching Auth/role removes the previous actor panel; no other actor may recover that operation. Save per-item CSV/audit references.
4. Finance bank CSV preview is bounded UTF8 and read-only. Confirmation is one explicitly reviewed reference/payment/amount at a time; no automatic credit or delivery. A duplicate reference is a conflict to investigate. Recovery retry acts on the already committed delivery job and does not credit again.
5. Reminder draft/recipient preview/sending are separate actions. Draft eligibility changes clear stale text. CMS quality queues overlap and are read-only; classification, publish/archive/photo actions still need their own approved facts and permissions.
6. Public adoption approved-seed fallback is only CMS revision relation missing `PGRST205`/`42P01`; permission/unexpected errors, no published revision and invalid content never fall back. Fees/rules/care/estate/guides use their original tables. #130 atomic audit/signed intent/fingerprint-idempotency/body limit/role recheck/commit-before-public invariants remain.

## Isolated acceptance evidence

| Area | Actual retained result | Evidence / limit |
|---|---|---|
| Role/direct commands | Current-role/Auth suspension, owner, version, audit rollback and service-role restrictions exercised in guarded local fixtures; fresh main RLS gates separately recorded | Per-PR sequential reports and current exact SQL hashes; hosted real identities/export/private files not-run |
| Bank confirmation concurrency/expiry | Same payment race gives one success/one conflict and one credit audit/job; held payment/donation and unique-index waits expire with P0001/409 and complete rollback; expired terminal replay preserved | [175 deadline RED/GREEN](sequential-merge-175-20260930.md), source99d94f2/exacte8588464; loopback52322 schema-only clone |
|1000 bank items / partial result|897 succeeded/100 skipped/3 conflicts;897 credit audits/jobs and900 result audits; injected result-audit failure rolls money/job/result back; replay adds none|175 exact SQL transaction drill; all synthetic data rolled back; timings current-only, not before/after|
|1000 CRM ownership items|898 succeeded/101 skipped/1 conflict; role/owner/version and audit rollback preserved; old15 synthetic supporters retained|[178 isolated proof](sequential-merge-178-20260930.md); no real assignment/identity merge|
| Recovery and public portal | Application-owned one-use broker/parallel redemption/session fencing, Mailpit sink and isolated marketing preference audit tests retained | [156 broker](sequential-merge-156-broker-20260930.md)/157 reports; old provider OTP race is historical; hosted provider parity/recovery activation not-run |
| Actual payment provider sandbox | **not-run** in this release; isolated ledger/callback/retry fixtures are separate | Sandbox merchant credentials/account, callbacks/reconciliation/PDF/email-test-sink evidence and explicit activation required |

## Before/after UI and same-environment measurements

Wizard same Windows host/Chromium148.0.7778.96, read-only fixture54329, source c0da836e against prior178, one unthrottled cold sample at each width; current source is unchanged in this UI area. Tray1→0 and accessible removal0→3; keyboard middle removal compacts ranks and preserves sponsor entries, empty/list navigation restores global sponsor tray. After Axe/overflow/page errors0 at all three widths.

| Width | CLS before→after | Limit |
|---|---|---|
|390|0.104719→0.000861|single sample|
|768|0.011590→0|single sample|
|1440|0.070421→0.070421|unchanged single sample|

[Six before/after screenshots and hashes](sequential-merge-179-20260930.md) / [raw wizard measurements](ui/t09-current-wizard-results.json). [Public3-run median comparison](ui-performance.md) / [48 raw run values](performance-runs.csv) / [8 median rows](performance-comparison.csv) retain their earlier fixture/source. Mobile homepage score97→93 and LCP2404→2545ms are retained; no general speed improvement or hosted performance claim. Full seven-step submission/upload/staff receipt/expiry is not-run. T20 two-geography private-region benchmark is not-run.

## Remaining external inputs and operational gates

- Release owner/DBA: concrete forward repair/rehearsal/approval for residual R01 legacy dependencies, private/storage boundary checks, full restore/off-machine/Storage bytes evidence and compatible rollback target. No paid Supabase development branch is authorized.
- Finance: approved method/account/version/public instructions and merchant sandbox credentials; signed callback replay/reconciliation/receipt/email-test-sink UAT. Payment activation/refunds remain separately unauthorized.
- Content/sponsorship/adoption: approved bilingual terms PDFs/hash and allocation/cancellation/renewal copy, facts/photo rights, seven-day draft retention and actual published IDs/revisions; no source merge publishes content.
- Volunteer coordinator: approved session/policy/coverage and test identities for each real role; keyboard/mobile200%/complete journey, direct API/export/private-file/revoked-session UAT in a private environment.
- On-call: certified readiness/recovery/cron credentials and alert thresholds/ownership, hosted Turnstile/limiter challenge UAT. The four Turnstile/Upstash variables were reported configured by the user; that is not a hosted challenge pass. New recovery/delivery/media schedule activation and sending remain separately unauthorized.
- Performance/PDF owners: authorized private two-geography benchmark and rare-glyph/font-size decision; T20/R09 and part of R11 remain open.

New checkout remains disabled/version1 throughout recorded postflights. New sending/media schedules are not activated. This handoff certifies the recorded source/schema/release slices and keeps incomplete business/UAT dependencies explicit.
