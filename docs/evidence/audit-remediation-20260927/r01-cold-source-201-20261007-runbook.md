# Current15 runbook supplement：PR #201

全部15檔 **DO_NOT_APPLY**。Current exact filename／RAW/LF SHA／Git blob 見 [r01-cold-source-201-20261007-manifest.csv](r01-cold-source-201-20261007-manifest.csv)。新 Task8 cold source 不構成正式 DDL、回填、付款／寄信／schedule 啟用批准。所有歷史 manifest 保持當時資格。

必須重新驗證目標完整 catalog、signature、owner、表／欄位 grants+grant options、RLS／policies、schema/default ACL、roles/memberships、helper+Auth+native FK+index+relation shape，選取完整同一 cohort，55000 即停止。檔名 timestamp 只排序，不是執行批准。完整 backup／隔離 restore、dry-run、回復與 retest 通過且取得精確正式批准，才可逐檔套用；禁止 db push、fake ledger、未知 profile 混配。Document restoration9ed664a6 必須先於 fence4e158fad；fence後不可 replay restoration。

Task8兩 RPC 是原本保留的 idempotent registration 和 atomic audited clone。若正式 profile不匹配，不可把冷環境的一個ACL/engineversion當獨立通行條件。Future legacy/null policy22023拒絕保持，正式 future policy/capacity/waitlist UAT仍未完成。App回復保持#200 TanStack patched versions、既有 webhook/reconciliation、安全 clamps／同transaction audit及財務歷史；不刪資料或schema以回復。

共同 preflight／回復／演練及職員交接詳見 [既有15檔 runbook](r01-final-source-201-20261007-runbook.md)、[完整 schema runbook](r01-release-runbook-20261007.md)與[職員交接](staff-handoff-20261006.md)。來源 DB UNKNOWN及未完成 typed restore 不因本 scoped test 消除。
