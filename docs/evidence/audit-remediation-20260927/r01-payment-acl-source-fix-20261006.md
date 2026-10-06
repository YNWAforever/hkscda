# R01 Task1 五欄控制權限修復 — 2026-10-06

Human 明確批准 source-only 修復及隔離驗證；既有 commit / sequential merge if green 授權仍適用。這不是正式 migration 或功能啟用批准。

## Source

`20261001101333_r01_payment_idempotency_forward.sql` 最終 raw/LF SHA-256: `90e3090f75cc8af43029f06ffb72c8bccb7aaa0913a4fe088514c69b7bcec35f`。只轉換 PUBLIC/anon/authenticated 的 postgres-grantor table INSERT/UPDATE 為等效舊欄權限，保留 grant options；其他 table/column ACL、roles、memberships、defaults、RLS、audit 不变。未知 grantor、grant chain、explicit/inherited control authority 均原子拒絕。服務 grants 在最後有效權限檢查前執行。

Checkout 保持 false/version1；不 backfill 金額、付款、provider 或 intent。保持 #130 audit/idempotency/media 安全邊界。

## Actual verification

基線 a3125547139dee5c022c1701b063e431790dcec3 的 dirty candidate 精確來源 hash、native PID、argv、UTC、exit、環境及 stdout/stderr hash 在 [receipts](control-boundaries-20261006/)；這些本機結果不代表更新後 #183 的 CI 已跑。

| Command | Native exit | Result / environment |
| --- | --- | --- |
| `bun --no-env-file .../runR01Forward.ts actor-red-modern` | 1 | 真實 RED：active treasurer 可改 checkout_url，預期42501 |
| `python supabase/rls-tests/paymentIntentAclInheritance.py red` | 1 | 獨立 network-none/tmpfs PG170011；套用原SQL native0，繼承 control INSERT/UPDATE 仍 true |
| 同上 `green` | 0 | 新獨立 PG170011；SQL預期 native3 / 55000，prestate完全回復 |
| `bun --no-env-file .../runR01Forward.ts green-modern 20261001101333_r01_payment_idempotency_forward.sql` | 0 | 新 modern170006 schema-only clone；7pass/85assert |
| 同上 `green` | 0 | 新 hosted170006 schema-only clone；7pass/85assert；正式只讀schema/catalog，無正式rows |
| `tsc --noEmit` | 0 | final TypeScript；typecheck-final receipt |
| `bun --no-env-file test --isolate` | 0 | units-reviewed：4603pass/634skip/0fail/12531assert；其餘DB/API skip不算驗收 |
| `eslint src eslint.config.js vite.config.ts supabase/rls-tests` | 0 | 0error，52既有warning |
| `bun --no-env-file run build` | 0 | fixture loopback54329 / placeholders；既有bundler警告保留 |

每種 clone 都比較4588筆所有角色舊欄 SELECT/INSERT/UPDATE/REFERENCES 及 grant options、精確 raw ACL轉換、其他catalog/facts；grant-option variant及第二次套用通過。七個負面case（explicit-control grant、非postgres grantor、五個structural/intent mismatch）均拒絕並還原。真實 JWT active treasurer/admin 保留 old provider_ref update及既有 audit；audit constraint失敗整筆 rollback。staff/pending/disabled fencing保留；service concurrent duplicates/claims/checkout retry通過。原template/modern完整rows+ledger+sequence hashes相同，正常drop自身clone。

首輪units native1因SQL修復後manifest checksum未更新；已更新當前manifest，後續units-final及units-reviewed native0。保留全部先前RED/失敗，不以後續通過覆寫。

## Review / compatibility / rollback

Fresh reviewer指出最後服務grants可能重新引入繼承權限；已真實PG170011 RED→GREEN修正，並重跑兩種clone及完整suite。其餘六個 scoped files 無 actionable finding。Task8分類器及其域實作另行交付；不把本項通過當作Task8或整體R01完成。

這是 source staging，可按授權在 #183 最新五個實際 CI gates 成功後合併；production applied/deployed schema/operationally enabled 皆 false。正式執行仍需新SQL hash的獨立批准、備份及完整release gates。請勿 db push／改歷史 ledger。回復程式版本保留新增 schema，不自動恢復 table-wide client writes（会重新暴露控制欄）；任何 ACL 還原需重新審閱有效權限／grant options／audit。正式 rollback 及 typed full restoration演練 NOT_RUN。
