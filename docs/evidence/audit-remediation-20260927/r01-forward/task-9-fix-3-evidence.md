# Task9 Fix3: exact supporter source-component profile

FIX_BASE `fff2aa600a2d0053e007632bd24ce88a5b517541`; tested source `8821c8f8facc8146ac61c8b305ab79f41768fec8`. Same assigned worktree/branch. Ruling32 only; I1/I2 remain fixed, M1Minor deferred.

## Actual failed CI and unchanged-source RED

Original PR192/exactfff CI36978660763 attempt1: workflow aggregateSUCCESS concealed rls-matrix110748791450 FAILURE during bunx supabase start on17.11.0.002. SQLSTATE55000: R01 adoption table metadata differs: supporter; all behavioral steps skipped. Other4individualjobsSUCCESS. All5original rawlogs/finalreceipt retained and byte/hash-verified; RLS270840bytes/rawSHA3b277167427e182851849f8f2263a1fbd52ea600e7e318b61f347b9c68ca2986. No CI retry requested or run. Initial metadata snapshot was in_progress; final receipt is authoritative for completed job outcomes.

`R01_ADOPTION_ATOMIC_ALLOW_LOCAL_FIXTURES=1 bun docs/evidence/audit-remediation-20260927/r01-forward/task-9-fix-3-diagnose.ts diagnose` parent0 with actual unchangede6a SQL55000/supporter. task-9-fix-3-red-1790927158262 binds65rawinputs, exact maintenance28c0155046bdaf1b2688a5d43e0630ed3e3d717c6c20fb818476b8582f7ec98a plus assignmentwhole941b203c92e4a4fb163917a230008d6b8d19161927916e406c8ef668a8c42f09/fragmentc810e2dd0d10db228840954eec63b1697473236aeeda0a050c52e2e54cfe088c. Fresh modern zero-data clone/full unchanged5352 scanner; known baseline accepted/forcedrollback, source reconstruction inside one rollback, fullcatalog/Auth/default/native/helper/role/index/ledger/sequence/row preservation and normalDROP/template/modern/frozen alltrue. This expected-defect diagnostic parent0 does not mean the SQL was accepted.

Actual supporter complete profile8ac590a6fec96f6c2cbaa48e7be16c97→6283c96ed21f1197474461a8028892e1. Onlyrelations+columns ACL differ frommodern: authenticated table INSERT/UPDATE absent, explicit nongrantable INSERT/UPDATE on11nonassignmentcolumns; crm_assignee_user_id excluded. Hosted differs onlyrelations. Other9 complete profiles exactlymatchmodern; all nonACL supporter fields and complete extraAuth/default/native328/index/helper/roles/memberships/ledger/sequences unchanged ([]). Complete old/component facet values and source fragments are bound independently, not copied from Task6 allowance. Rootverified65rawinputs/receipt1f11d71f/diffac483828 beforeRuling32. 17.6 reconstruction is distinct from exact17.11 startup.

## Minimum repair and final validation

SQL adds only complete supporter6283 as third exact MD5 alternative, retaining3148 and8ac. Exact binary comparison proved olde6a SQL plus35bytes in that single guard equals newe690d843472a2c2208e4dd484c0c208a2ae4e0bcedf2cac328cffbca59740992/352912bytes. All other SQL/private/body/default/grant/Auth/native/actor/error/signature bytes remain exact. Generator binds the full captured alternative and asserts other9/extrafacets. Owned runner reproduces exact bound source fragments only in its disposable component clone, then preserves that actual ACL as baseline. No grant/default/RLS normalization or metadata repair in Task9 SQL.

Gate admission now requires hosted+modern+component and identical raw input maps; every existing I1 final flag remains exacttrue. Inert receipts include all3profiles; I2parent mkdir/unique/finally cleanup preserved. New component negatives grant excluded assignment UPDATE and allowed name UPDATE WITH GRANT OPTION; both are actual55000/fullrollback. Existing70/78refusals remain. Formatting completed before freezing.

| Command | Actual exit/result | Receipt/log |
|---|---|---|
| `R01_ADOPTION_ATOMIC_ALLOW_LOCAL_FIXTURES=1 bun supabase/rls-tests/helpers/runR01AdoptionAtomic.ts hosted` | 0;61pass0fail195assert;70 actual55000refusals | task-9-hosted-1790928080801/receipt.json |
| `R01_ADOPTION_ATOMIC_ALLOW_LOCAL_FIXTURES=1 bun supabase/rls-tests/helpers/runR01AdoptionAtomic.ts modern` | 0;61pass0fail195assert;78 actual55000refusals | task-9-modern-1790928423473/receipt.json |
| `R01_ADOPTION_ATOMIC_ALLOW_LOCAL_FIXTURES=1 bun supabase/rls-tests/helpers/runR01AdoptionAtomic.ts component` | 0;61pass0fail195assert;80 actual55000refusals | task-9-component-1790927901903/receipt.json |
| `bun run typecheck` | 0;34.13s | task-9-gates-1790928679243249400/typecheck.log |
| `bun test --isolate --timeout 30000` | 0;94.08s;3280 pass,391 skip,0 fail,10609 expect() calls | task-9-gates-1790928679243249400/tests.log |
| `bun run lint` | 0;29.7s | task-9-gates-1790928679243249400/lint.log |
| `bun run build` | 0;77.84s | task-9-gates-1790928679243249400/build.log |

`python docs/evidence/audit-remediation-20260927/r01-forward/task-9-gates.py` actual0. Three profiles share66frozen DBinputs; gates73unique rawinputs. Positivebaseline/twoapplies/idempotence/fullunaffectedcatalog/rows/helper/Auth/default/native/ledger/sequence/posttests preservation/normalDROP/fourfinalflags allpassed. Hosted20→17; modern/component1→1; production44 unchanged, Task1/8 excluded, accepted2–7 only. Same12table fullfixture scope and unchanged5352scanner.

Gate frozen/template true; template `c653c8e55cd609b04ca58f3c288549e57da84afe92fe559882c423139a46edb6`→`c653c8e55cd609b04ca58f3c288549e57da84afe92fe559882c423139a46edb6`. Dedicatedmodern `411ce67780d1a36f794ab3b01d1c08f82b7ac22f3a57ec82dee5df72b9ced65b`→`e960d7170333dc1159787adc427308cf0a33b7161a7a4e9f854ddaba0878ab71` is the authorized full-suite fixture transition; each ownclone separately modernPreservedtrue. No equality was imposed across full-suite gates.

Windows PowerShell/Bun1.3.14/Git2.55.0.windows.2/Python3.14.6/PostgreSQL17.6. Onlyowned52322clones; templateaudit_pr135_20260929/modern57322 readonly during ownrehearsals. Gates clear inherited feature DB/fixtureopt-ins; checkoutpolicy57322/Auth52321; build54329placeholderconfig. Fullsuite391skips include39real ownedDBcases executed in all3profiles. Existing lint52warnings/intentionalHTTPdiagnostics/M1 remain. Actual17.11/fiveindividualCI and scopedreview remain external, not inferred from localgreen.

## Binding, immutable history and boundaries

[Complete Fix3 binding](task-9-fix-3-source-binding.json) and [append-only raw archive translations](task-9-receipts/translation.json) preserve all prior1240translations/210rawblobs, failedCI, priorRED/setupfailures and olde6sources. Originalreport receives a coveringFix3append after packaging; previous report bodies stay exact. Source marker8821 binds actual66/73rawmaps; own manifest row73 e6→e690 hash was updated beforegatefreezing outside DBinputs and is committed with evidence. Its HEAD8821 blob is older than tested working manifest, explicitly qualified; ignoredcapture Git values remain derived content addresses.

OriginalCLI2.118.0 migration filename creation remains implementer-reported, exact original invocation/output independently unavailable after bounded lookups; no recreation or inference of nonperformance. Original brief versions and298byte Ruling31 append qualification stay preserved; separate exact Ruling32 is newly bound. No original translations/runtime proofs relabeled current.

Self-review confirms onlyonecomplete known-profile digest added; sourceSQL tail/body/grants/default/native bytes unchanged, no wildcardallowance. Meaningful newACL/grantoption unknownprofiles refuse55000; existingpositive/refusal/preservation checks and I1/I2 behavior pass. Source construction grants/revokes are only unchanged historicalfragment replay in newownedclone, not a runtime policy change or normalization. Source-only SQL/evidence, no productionDDL/DML/mainmerge/push/PRupdate/release/provider/publicpreview/Task1ACL/Task8scanner action; no subagents, no dependenttask start, no CI retry, no actual automatic action rejection/workaround. BroadUAT/JWT/PostgREST/Authinternal/provider/fullrecovery not-run. OriginalCI failure and engine/provenance/M1/externalreview/fiveCI concerns remain explicit.
