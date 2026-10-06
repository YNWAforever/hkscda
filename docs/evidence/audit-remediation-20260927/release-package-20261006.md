# R01 交付包 · 2026-10-06

**2026-10-06 最新執行：** #196／#197 已提交、push 及建立 draft PR；兩個已綁定 source 的五個 CI gates 和必要 DB steps 全綠。本機 explicit unit4279 pass／634 skip／0 fail，原六項 API failures 保留且新 CI 同項實際通過。整組尚未合併：#183 付款權限 RED、Task8 source 安全邊界批准及 R265 raw preservation failure 仍未解除。完整 SHA／command／exit／environment 見 [新執行收據](conditional-merge-receipt-20261006.md)。下文及歷史記錄為此前 capture；publication／fresh CI 狀態以新收據為準。

## 目前可審閱的交付

Task13 的16個程式／SQL／測試／文件已本機提交：e5a28c47b839fa12b770d1e639b0a74368021675，tree d3bc880b023b0108e5b532f24b6266228809428d，父提交為 #195 的2e176ebdf8647a1d13ae92a57116a3e73fa437b0。本 Task14 文件位於本機分支 codex/audit-r01-release-package-20261006；實際 commit 身分記錄於本機交付報告。

**仍未發佈：** Task13 push／draft PR兩次在程序啟動前被自動審批拒絕；直接使用者批准問題仍待回覆。本次沒有執行遠端 push／建立新 PR／新 head CI／production migration或功能啟用；不推論其他歷史遠端分支不存在。既有 codex/audit-* preview suppression 保留；不觸發公開preview、不merge main。

2026-10-06已核對既有release：原 #134–#179 共46個PR及 #181/#182 已merged，main／READY alias為4bbd4a4dffbd053328e92c03281a23d1d4ebe682；run36833019358五項工作成功。這只證明既有baseline。#183–#195 共13個R01 draft仍unmerged；#180為無關do-not-merge。

## 驗證與未完成界線

| 項目 | 實際結果／環境 | 不能推論 |
|---|---|---|
| focused／full typecheck、lint、build | native0；lint留52 baseline warnings；build child37932=0，後續log-summary cp950 error另記 | 不是新GitHub CI |
| 凍結來源後full units | 4279 pass／634 skip／0 fail，12176 assertions，628files；明確不可達loopback59999、provider cleared、無env fallback | skip不是DB／API驗收；初次7個API／assertion failure未被此結果直接修復證明 |
| PG17.6 獨立 strengthening／NoOp | R268 native0；111 named rows相同；17 permission/rollback/FK、26business、12site/knowledge races、2annual races，共57 cases | 沒有重跑restoration；不是full catalog/H1／production |
| 真實race matrix | RC四個23514；RR四個40001；Serializable四個40001；annual RR兩個40001；實際等待且invariant保持 | 不等於hosted staff/API acceptance |
| native PG17.11 modern restoration | R261 server170011；兩次applications／named no-op；六組seed counts2/2/4/0/0/0及原始資料保持 | seeded baseline不是schema-only；未證明17.11 strengthening／完整CI角色matrix |
| 嚴格full-raw preservation | R265 native1：pg_statistic同489identities、192changed；inventory亦不同；application/Auth/ledger/sequences相同 | 原因未記錄；無waiver；舊657/71及H1未admitted |
| dedicated56322／typed55322 | 前者缺localcredentials，測試未啟動；後者actual170006，不是170011 | 不重設現有stack、不偽造credential/version |
| Quality | brand26×5、a11y26×1；perf24cold samples95–100，loopback synthetic fixture | 無hosted／兩地30cold/warm／新before-after 改善宣稱 |

[命令／exit／SHA evidence](release-evidence-20261006.json) 保留15個ordinary receipts及失敗結果。[完整決策紀錄](r01-decision-chronology-20261006.md)保留原始271條。R268 NoOp原始strings只在記憶體，未獨立封存；cleanup依正常完成、finally流程及template check，沒有額外explicit receipt。

## 審閱及release次序

1. 審閱Task13 exact16及此文件diff；Task1 五項 control ACL、Task8 兩項 scanner proposal仍待exact approval，未套用。
2. 如直接批准publication，再推exact source branch，以 #195 branch為base建立stacked draft。新head的verify／brand／performance／a11y／rls-matrix五個individual jobs及native17.11 document step、實際role/API steps須逐項檢查。Aggregate success或continue-on-error不可遮蓋bootstrap fail／skips。
3. DBA按 [14-file manifest](r01-forward-migration-manifest-20261006.csv)／[runbook](r01-release-runbook-20261006.md)核對exactprofile、backup及rollback，逐named file取得production approval。目前全部 **DO_NOT_APPLY**。
4. 完成 [外部驗收清單／staff handoff](staff-handoff-20261006.md)，才決定operational activation。既有signedwebhook／reconciliation保持；新checkout、payment、delivery/media schedules仍off。

## 索引與歷史資格

[目前13 draft source／CI disposition](r01-source-ci-disposition-20261006.csv) 列exact source head與已摘錄的dated run；Task11 nativefinance67、Task12 group34＋finance67 nonSkipped。Task9 aggregate成功但bootstrap失敗／DB skipped、Task6早期RLS失敗及Task12首個failed CI均保留；source head與test checkout相同tree不能冒稱相同commit。

- [兩份tracker的34項reconciliation](tracker-reconciliation-20261006.csv)；[兩份 tracker 的先前九項狀態／R01歷史](tracker-history-20261006.json)。目前9項含已證明過時的 source／rollout 字段已校正；其餘25項保留原有 code/schema/deployed/enabled 資格，沒有整表改成 ready。
- [目前UI／performance資格](ui-performance-handoff-20261006.md)；[原始UI report](ui-performance.md)保持不變。
- [Task13 shipping說明](../r01-forward/document-publication-guards.md)；[歷史migration runbook](current-migration-runbook-20261001.md)與migration-manifest.csv是舊時間點，不是current14-file approval。

最後captured production catalog為2026-10-01：154 public tables／304 public functions／ledger112；146要求、44 gaps、checker exit1。隔離環境44→25（排除Task1）→20→17→13→8→7不更新production44；supplemental private/native document objects亦不在146之內。

Tracker 的 current_sha 是該 issue 的已接受 source／merge 身分，須連同 pr_commit 的明確標籤閱讀，不是每列都強改成 global main。OPS-01 保留歷史 closed-incident SHA，將 main4bb／五個 green jobs 列為另一天的觀察。Original46 的 source SHA 與 merge SHA 各自保留；source deployed 不代表 provider／UAT／R01 schema 已 ready。
