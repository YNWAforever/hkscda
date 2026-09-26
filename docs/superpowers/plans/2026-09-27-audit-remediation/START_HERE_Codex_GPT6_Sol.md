# Codex GPT‑6 Sol — HKSCDA 修復執行指令

將以下整段交給 Codex GPT‑6 Sol，並讓它可讀取此交接包。

```text
你是 HKSCDA 的實作工程師。請執行本交接包中的修復計劃，完成程式、隔離測試、文件及可審閱 PR；不要只再寫一份計劃。

Repository: https://github.com/YNWAforever/hkscda
Production reference: https://hkscda.vercel.app/

先完整閱讀：
1. HKSCDA_Codex_GPT6_Sol_Implementation_Plan_2026-09-27_zhHK.md
2. references/HKSCDA_Audit_2026-09-27_zhHK.md
3. references/HKSCDA_Audit_2026-09-27_zhHK.html
4. references/HKSCDA_Reaudit_PR130_PR132_2026-09-27_zhHK.md
5. references/HKSCDA_Reaudit_PR130_PR132_2026-09-27_zhHK.html
6. repository 當前的 AGENTS.md、CLAUDE.md 及適用子目錄指引。

包內相對路徑以解壓目录為準，不是預設 application repository root。將計劃與規格記錄於 docs/superpowers/plans/2026-09-27-audit-remediation/；不要改寫歷史報告。

先 fetch 最新 main，記錄 checkout SHA、production alias SHA 和 CI。計劃基線是 f8d5e5d5840d1775efb7d7f4ae2768f6557096b5，不代表執行當日仍最新。若已有後續修復，用測試確認並更新 tracker，不重複改。

重要狀態：
- OPS-01 在 aa280ed 的再審核 CI 已通過，屬歷史關閉項；新 release 仍需全部 gates。
- #133 已恢復公開領養需知。只在 CMS revision read 的 PGRST205/42P01 使用 approved seed copy；費用、規則、照顧內容、屋苑及指南仍用既有資料表。
- permission error、其他 unexpected error、沒有 published revision、invalid content 不得套 fallback。
- #133 沒有解決所有 CMS／upload／submission／finance schema 依賴；R01 要以當前 catalog 再核對。
- 保留 #130 的 atomic audit、signed proof intent、fingerprint/idempotency、body limit、停權再驗證及媒體 commit-before-public。

按計劃 T00–T24 的相依次序執行。先服務相容性和付款政策，再會丟資料或改錯狀態的後台問題，之後完成公眾流程、bulk、效能和支持者入口。拆成可獨立驗收的 PR；不要一個巨大 PR，也不要完成第一個簡單修正就把整體任務視為結束。

工作規則：
- 在獨立分支/worktree 保留 unrelated work；遵循 strict TypeScript、server-only 邊界、角色/RLS、同 transaction audit。
- 每個真實缺陷先建立可重現的失敗測試，再最小修復；已修項直接回歸验证。低影響文案／版面可用 UI 驗收。
- 只用隔離 DB、合成資料、provider sandbox、email test sink。不可 reset 正式 DB、發真信或做真付款測試。
- migration 要 catalog/signature/grants/RLS 檢查和演練；不可盲目 db push 或偽填 migration ledger。
- new checkout 停用不影響既有 webhook/reconciliation；付款成功不因收條/email失敗變回 pending。
- 批量維持 snapshot→preview→per-item permission/version check→apply→result；不能盲批退款、領養批准或身份合併。
- 實際跑 typecheck、tests、lint、build 及適用 DB/RLS/brand/a11y/performance gates。build 成功不等於 typecheck 通過。
- 依角色測直接 API、匯出及私有檔案；依 UAT 矩陣測手機、鍵盤及完整旅程。
- 一般可逆實作不要反覆詢問。若缺測試身份、正式條款或發布批准，只標記受阻項並繼續其他工作。

完成所有已授權且可執行的實作與驗證後，準備具體 release package。repository 規定 main merge 會自動上線且需 release approval；本指令不授權直接 merge/push main、公開 preview、正式 migration、付款啟用、正式內容上下架、通知發送或退款。對這些操作，先交可審閱 diff、dry-run、驗收證據和 rollback，再按既有授權處理。

每完成一個 task 更新 tracker，區分 code-complete、schema-ready、deployed、operationally-enabled。回報只寫實際執行結果，列 test command/exit code/SHA/environment；未測列 not-run，不能聲稱全部通過。

最終交付：
1. 每個 issue ID 的最新狀態、PR/commit、驗收證據。
2. migration manifest/runbook、相容性及回復邊界。
3. before/after UI及同環境效能數據。
4. sandbox金流、角色權限、並發/重試/partial failure結果。
5. 剩餘外部批准、內容或憑證清單，以及職員操作交接。
```

計劃的 Markdown 是執行主文件；HTML 方便人員閱讀。`HKSCDA_Remediation_Tracker.csv` 是起始清單，執行時逐項更新，不代表已實作完成。
