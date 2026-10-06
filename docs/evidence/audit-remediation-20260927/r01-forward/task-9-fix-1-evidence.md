# Task9 Fix1: I1 preservation failure handling

FIX_BASE `493b488b8b156e3e24c9330fbfc0b009371c0b1d`; tested executable source `3221bfa3a32cf60f1e301c40be243321e32c3755`. Same assigned worktree and branch. I1 only; M1 Minor remains deferred to final whole-branch triage.

## Change and actual inert RED/GREEN

The runner retains its complete receipt and sets a clear error/nonzero process exit unless normalDrop, templatePreserved, modernPreserved and frozenInputsPreserved are exactly true. Existing error text is retained. The gate selector refuses false or missing values for all four flags. Its full-suite modern fixture transition remains authorized and is not required to equal its before state. The regression executes the actual finally block with inert IO and the actual selector prefix, before any database/gate action. Its bytes and the selector are now frozen in each clone input map.

`bun test supabase/rls-tests/helpers/adoptionFinalPreservation.test.ts`: genuine unchanged-source RED child1, 4 pass/10 fail/25 assertions (task-9-fix-1-red-current); GREEN0, 14 pass/0 fail/29 assertions (task-9-fix-1-green). Initial inert wrapper setup error remains task-9-fix-1-red: child1, 3 pass/11 fail/14 assertions; its runner-close0 cases are setup failure, not behavioral RED. Earlier wrappers returned shell0 while recording actual child1; this distinction remains in the receipts. No database was mutated for the inert reproduction.

## Fresh final rehearsals and mandatory gates

| Command | Actual exit and result | Receipt |
|---|---|---|
| `R01_ADOPTION_ATOMIC_ALLOW_LOCAL_FIXTURES=1 bun supabase/rls-tests/helpers/runR01AdoptionAtomic.ts hosted` | 0;61 pass/0 fail/195 assertions;70 actual55000 refusals | task-9-hosted-1790922751460/receipt.json |
| `R01_ADOPTION_ATOMIC_ALLOW_LOCAL_FIXTURES=1 bun supabase/rls-tests/helpers/runR01AdoptionAtomic.ts modern` | 0;61 pass/0 fail/195 assertions;78 actual55000 refusals | task-9-modern-1790922868256/receipt.json |
| `bun run typecheck` | 0;49.82s | task-9-gates-1790922945005513700/typecheck.log |
| `bun test --isolate --timeout 30000` | 0;140.94s;3280 pass,391 skip,0 fail,10609 expect() calls | task-9-gates-1790922945005513700/tests.log |
| `bun run lint` | 0;45.39s | task-9-gates-1790922945005513700/lint.log |
| `bun run build` | 0;80.36s | task-9-gates-1790922945005513700/build.log |

`python docs/evidence/audit-remediation-20260927/r01-forward/task-9-gates.py` actual0. Both fresh DB receipts share 62 exact frozen inputs; gates bind 69 unique raw inputs. Positive baseline, 70/78 metadata refusals with rollback, two applies/idempotence, full unaffected catalog/rows/helper/Auth/default/native/ledger/sequence preservation, post-test metadata/rows, normal clone DROP and all four final flags passed. Actual zero-data application tables hosted158/modern162. Same full12-table scope and native selections retained; no narrowed scanner or changed fixture selection. Hosted accepted2–7 composition20→17, modern1→1, production44 unchanged; Task1/Task8 excluded.

Gate template preservation true: `c653c8e55cd609b04ca58f3c288549e57da84afe92fe559882c423139a46edb6`→`c653c8e55cd609b04ca58f3c288549e57da84afe92fe559882c423139a46edb6`. Gate frozen preservation true. Dedicated modern `9d032584ce197236ebecc8095e010e766a79b3f0c9c91000f5d94c7fb12654b4`→`0dfb82414e2ae225304d0a6ca17b33d61719f674a7fa1145dc54e2392255c10e` is the existing full-suite fixture transition; clone rehearsals themselves separately report modernPreserved true. Do not infer cross-gate modern equality.

Runtime Windows PowerShell/Bun1.3.14/Git2.55.0.windows.2/Python3.14.6/PostgreSQL17.6. Owned clones52322; templateaudit_pr135_20260929 and modern57322 read-only during clone rehearsals. Gates clear inherited feature DB/fixture opt-ins; checkout-policy57322/Auth52321, build54329 placeholder anon/service configuration. Full-suite391 skips include39 actual owned DB cases separately run in both profiles; 14 added inert tests do not introduce DB/provider actions. Existing lint52 warnings and intentional HTTP diagnostic output remain; M1 deferred. Exact17.11/five individual CI and scoped review remain external.

## Raw binding and original brief/creation qualification

[Fix1 complete source/receipt/environment binding](task-9-fix-1-source-binding.json) and [append-only raw archive translations](task-9-receipts/translation.json) preserve all prior receipts and proofs. Original Task9 source-binding/evidence remain untouched. The original report preserves its historical body and receives an appended Fix1 covering-command summary after packaging, as requested by the controller. Source marker3221 binds actual tested raw maps; packaging follows separately and changes no executable input. Two ignored capture receipt Git values remain derived content addresses, not original-path HEAD objects.

Original brief8849e33f…e1fd/19882bytes ends Ruling30. Current938df16d…81dd/20180bytes appends only298bytes for Ruling31 afterline90; currentmtime2026-10-02T05:34:35.610414Z. Both genuine versions and the exact bounded diff are separately bound; immutable old translations are not rewritten or relabeled current. Controller qualification copied exactly SHA155929ce88f7c55f5cb149fe884d3168955a5c23f7ec5e5462ad0f4b9edd6f58.

Bounded retained Task9 artifact search for migration new/migration-new/supabase@2.118.0/Created new migration found only the brief requirement, no actual original pinnedCLI invocation record. Original filename20261002045253 exists, and prior implementer history reported pinned2.118.0 creation, but exact command execution is not independently proved by retained artifacts. No creation rerun was performed to manufacture historical evidence.

## Source-only security and review boundary

SQL20261002045253 remains e6a4b06d802d7c82e4638ce8dfd8ad5e3a21ca87583be8471e0a0559a6656cb8; scanner remains5352ca4c2660e341b88bb34519e369aa7420711bb9df7c80daff5dadd9387519. No SQL/private/default/grant/Auth/body/role/security/public-flow/source-ACL change. No new production DBDDL, mainmerge/push/PR/release/publicpreview/provider enablement. Owned schema-only replays and existing mandatory gate fixture behavior only. Production44/deployment/enablement remain unchanged; source re-review and CI are controller work.

Self-review confirms false/missing final flags fail closed while preserving receipt evidence and existing errors; selector cannot advance those invalid synthetic receipts. Existing upstream catalog/row/metadata checks remain intact, and no modern equality was added to full-suite gate completion. No other review scope was amended. No actual automatic action rejection occurred or was bypassed; narrow escalated commands followed the previously authorized sandbox bootstrap limitation.
