# Task9 Fix2: I2 clean-checkout inert fixtures

FIX_BASE `4fc2691af77b7af17489f952b0dc4011713f6f9d`; executable source `b047f9f1f2c15a0ecc520819bd05d5d3224c5cbd`. Same assigned isolated worktree/branch; no subagents. I1 is addressed; M1 Minor deferred to final whole-branch triage.

## Minimum source change and actual clean-layout reproduction

Only three lines in adoptionFinalPreservation.test.ts create the ignored plan parent recursively before the existing mkdtemp call. Unique receipt directories, nested hosted/modern receipts and finally cleanup are retained. Actual runner/selector/I1 final-flag semantics and all remaining source/SQL/private/default/grant/scanner bytes are unchanged.

`bun test supabase/rls-tests/helpers/adoptionFinalPreservation.test.ts` ran from a newly created synthetic clean-layout, with the chosen plan parent initially absent and exact reviewed test/runner/selector bytes. Genuine RED task-9-fix-2-red-current-fo_5ovhd: exit1,5pass9fail20assert; all nine selectors failed with actual ENOENT before assertions. Clean-layout GREEN task-9-fix-2-green-current-sm5fadvu: exit0,14pass0fail29assert; parent initially absent then created, zero owned inert dirs after finally cleanup. Its raw working test bytes were formatted before capture and then committed as b047; focused receipt HEAD marker4fc predates that source commit, so its raw input map identifies the actual amended bytes.

Retained setup failures are separate: task-9-fix-2-red-r6_jicbr exit1/5pass9fail20assert was ENAMETOOLONG at mkdtemp under a long synthetic nesting, not the accepted missing-parent RED. task-9-fix-2-green-sv4vebgp exit1/13pass1fail29assert created the parent but the synthetic receipt path262chars exceeded Windows260 and the positive Python selector returned1. A bounded inert diagnostic encountered WinError206/exit1 before fixture creation completed; only its newly created unique directory was removed after exact resolved-path validation. The successful new short layout uses receipt paths257chars. These setup/diagnostic results are not GREEN or failures of database behavior. No existing source/scratch/clone directories were removed, renamed or moved; only new unique synthetic layouts were cleaned after raw source/log capture.

## Fresh final source-bound rehearsals and mandatory four gates

| Command | Actual exit and summary | Receipt/log |
|---|---|---|
| `R01_ADOPTION_ATOMIC_ALLOW_LOCAL_FIXTURES=1 bun supabase/rls-tests/helpers/runR01AdoptionAtomic.ts hosted` | 0;61pass0fail195assert;70 actual55000 refusals | task-9-hosted-1790924549998/receipt.json |
| `R01_ADOPTION_ATOMIC_ALLOW_LOCAL_FIXTURES=1 bun supabase/rls-tests/helpers/runR01AdoptionAtomic.ts modern` | 0;61pass0fail195assert;78 actual55000 refusals | task-9-modern-1790924800311/receipt.json |
| `bun run typecheck` | 0;37.11s | task-9-gates-1790924885691400900/typecheck.log |
| `bun test --isolate --timeout 30000` | 0;111.14s;3280 pass,391 skip,0 fail,10609 expect() calls | task-9-gates-1790924885691400900/tests.log |
| `bun run lint` | 0;56.98s | task-9-gates-1790924885691400900/lint.log |
| `bun run build` | 0;56.01s | task-9-gates-1790924885691400900/build.log |

`python docs/evidence/audit-remediation-20260927/r01-forward/task-9-gates.py` actual0. Both profiles share62frozen inputs; gates69unique raw inputs. Each clone passed positive baseline,70/78 exact metadata refusals/full rollback, two applies/idempotence, complete unaffected catalog/rows/helper/Auth/default/native/ledger/sequence and post-test preservation, normalDROP and exacttrue final flags. Hosted20→17/modern1→1,production44 unchanged; accepted2–7 composition only, pendingTask1/8 excluded. Full unchanged12table fixture scope, native selections and5352 scanner retained.

Gate frozen/template preserved true; template `c653c8e55cd609b04ca58f3c288549e57da84afe92fe559882c423139a46edb6`→`c653c8e55cd609b04ca58f3c288549e57da84afe92fe559882c423139a46edb6`. Full-suite dedicatedmodern `0dfb82414e2ae225304d0a6ca17b33d61719f674a7fa1145dc54e2392255c10e`→`411ce67780d1a36f794ab3b01d1c08f82b7ac22f3a57ec82dee5df72b9ced65b` is authorized existing fixture transition. Clone modernPreserved is separatelytrue in both profiles; no equality was imposed across the full-suite gates.

Windows PowerShell/Bun1.3.14/Git2.55.0.windows.2/Python3.14.6/PostgreSQL17.6. Ownedclones52322; templateaudit_pr135_20260929 and modern57322 read-only during own rehearsals. Gates clear inherited feature DB URLs/fixture opt-ins; only checkout-policy57322/Auth52321; build54329placeholder config. Fullsuite391skips include39 real ownedDB cases separately executed twice. Lint52baselinewarnings and expected HTTP diagnostics remain; M1 deferred. Actual17.11/fiveindividualCI, scopedreview and publication remain controller externalgates.

## Immutable prior versions and provenance

[Fix2 complete binding](task-9-fix-2-source-binding.json) and [append-only original-path/raw-version translations](task-9-receipts/translation.json) bind exact sources/logs/receipts/current maps. All earlier788+225 translation entries and their raw bodies are retained; Fix1 evidence, sourcebinding and reports remain historical. Original task-9-report.md receives an appended Fix2 covering-command/HEAD summary after packaging, preserving its historical body. Separate Fix2 full report is written after evidence commit and does not masquerade as a pre-existing runtime proof. Source markerb047 plus actual frozen raw maps is authoritative; evidence packaging changes no executable input. Ignored capture Git values remain derived content addresses rather than original-path HEAD objects.

Original brief8849…e1fd/19882bytes and current938df16d…81dd/20180bytes remain genuine separate versions; exact298byte Ruling31-only append qualification and controller raw copy remain preserved from Fix1. Original pinnedCLI2.118.0 migration creation is implementer-reported; exact command/output independently unavailable after bounded retained artifacts/controller root-record lookup. This does not establish CLI creation was not performed. No original creation rerun.

## Security boundary and self-review

SQL remains e6a4b06d802d7c82e4638ce8dfd8ad5e3a21ca87583be8471e0a0559a6656cb8; scanner5352ca4c2660e341b88bb34519e369aa7420711bb9df7c80daff5dadd9387519. No SQL/native/grant/Auth/private/default/actor/body/policy/source-ACL change. No new migration/productDDL/productionDDL, parent data repair, predecessor reruns, provider enablement/mainmerge/push/PR/publicpreview/release. Mandatory ownclones replay unchanged existing approved source DDL only. No deliberate dedicated/template mutation for the inert failure. No automatic action rejection occurred or was bypassed.

Self-review: parent mkdir is awaited before mkdtemp and is idempotent; receipt directories remain unique/nested, finally cleanup remains exact, missing-parent layout reaches all14 actual tests. I1 runner final errors/nonzero exits and selector exacttrue flags are unchanged; full-suite modern transition policy remains unchanged. Minimum source delta is one file/three lines. Remaining actionable reviewer scope I2 only; M1 and original CLI provenance limitation remain qualified.
