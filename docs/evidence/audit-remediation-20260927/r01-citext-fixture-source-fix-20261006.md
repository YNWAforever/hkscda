# Task8 精確 native aggregate scanner 修復 — 2026-10-06

Human 已明確批准 source-only exact d3158bc1 classifier patch及隔離驗證。此交付完成分類器與原始完整scope的核對；Task8 volunteer registration/clone業務實作仍未完成。

## Source and strict boundary

只修改 productionSchemaClone.ts及新增productionSchemaCloneAggregates.test.ts。精確 citext1.6 public.min/max(citext)、citext_smaller/larger、完整owner/extension/ACL/grantor/options/default/config/argument/native/aggregate/support/sort/planner合約；未知／provider路径仍拒絕。原七表、triggers及transitive call closure全部保留；CLI #198 array transport修復保留。

套用原 patch後真實漂移測試發現兩項失敗（aggregate language→plpgsql），已收紧所有aggregate必须通過完整合約，不能落入一般SQL/PLpgSQL路徑。實際modern完整掃描另發現jsonb_build_object將callback/sort OID編為JSON字串；query顯式轉bigint產生數值，不把未知字串profile加入容錯。兩項修正均保留先前真實RED，不擴大任何native允許合約。

Final helper raw/LF SHA-256 `c99171a1cd48fb7e7ea34d659ec3dbd4555999e852270711f921062163d75c92`; test `0375959baa1825ee88268a84d9777fb079c582016dff6f49c737f7700ff15952`。

## Executed evidence

[Native receipts, stdout/stderr, exact source pins and scanner runtime sources](control-boundaries-20261006/)（基線1730849c／dirty final candidate，並非正式DB或發布驗收）。

| Command / receipt | Native exit | Actual result |
| --- | --- | --- |
| `bun --no-env-file test .../productionSchemaCloneAggregates.test.ts` / citext-red | 1 | Untouched classifier：0pass2fail |
| three focused helper suites / pure | 1 | Original approved patch：355pass2fail；language drift未拒絕 |
| same focused suites / pure-native-json | 0 | Final：357pass693assert，包括310 aggregate acceptance/refusal cases |
| original full seven-table scan / task8-scan-modern | 1 | Query OID JSON encoding mismatch，guard拒絕，無fixture DML |
| original full seven-table scan / task8-scan-modern-fixed | 0 | Fresh modern170006162-empty-table clone，完整scope通過／catalog不變 |
| original full seven-table scan / task8-scan-hosted | 0 | Fresh hosted170006158-empty-table clone，完整scope通過／catalog不變；正式schema/catalog只讀 |
| `tsc --noEmit` / task8-typecheck | 0 | Native16620 |
| `bun --no-env-file test --isolate` / task8-units | 0 | Native14072；4603pass634skip0fail12531assert |
| full eslint / task8-lint | 0 | Native43448；0error52既有warning |
| `bun --no-env-file run build` / task8-build | 0 | Native44340；loopback fixture54329／placeholder，既有bundler警告 |

每個owned clone正常DROP；原template及modern schema/rows/ledger/sequence hashes保持相同。沒有captured函數執行、provider呼叫、shared role改動或scope縮窄。Fresh reviewer在原scoped六檔未發現其他 actionable finding；後續query編碼修正由actual scanner RED→GREEN及全suite核對，不另派重覆review。

## Remaining work and rollback

Task8 domain missing-target RED、clone actor/Auth fence RED、forward migration、domain GREEN、CI17.11 aggregate integration及hosted/provider UAT仍NOT_RUN。分類器GREEN不代表該域／整體R01完成。新source exact-head CI與逐一source merge仍需完成；十四productionforward migrations仍DO_NOT_APPLY，付款及新排程保持停用。

Source rollback可回復這兩個helper/test檔，會恢復原保守拒絕；沒有DB/schema/data要回復。不得藉rollback縮窄fixture scope或移除未知/provider拒絕。
