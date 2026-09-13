# 六階段開發與隔離驗收交接 — 2026-09-13

這是現有 YNWAforever/hkscda 的可審閱程式候選，不代表正式環境已啟用或真實職員試行已完成。沿用 TanStack Start、React、TypeScript、Supabase、Bun；基線 3fcf8cec235e0fa252b7d134f74948f2a682ebac，隔離分支 codex/admin-volunteer-settings-20260913。原 checkout 的未提交工作保留。

| 階段              | 開發及隔離驗收結果                                                                                                                                   | 仍需外部輸入／正式啟用                                                                                |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 1 可靠性          | 匿名欄位與 RPC 權限、提交資格、付款重試、冪等／原子出席及角色拒絕路徑已實作並測試                                                                    | 正式環境遷移及切換批准                                                                                |
| 2 動物／公開網站  | 版本化發布、相片 CMS、來源／alt／焦點／排序、年齡與公開投影、私有欄位隔離；本次修復不存在的動物／助養詳情頁 main landmark                            | 249 個原相片來源缺口：234 可對應 canonical 記錄、15 需人工確認。不能猜測身份或生成替代動物照片        |
| 3 領養／助養／CRM | 指定 proof、審批、共用帳／收據、未付月份、退款、持久通知；新增簽署驗證的 delivery callback 及 CRM／職員跟進狀態                                      | 真實供應商設定、發信啟用與正式端點驗收                                                                |
| 4 義工／實習      | 貓狗版本政策、admin 驗證表單／比較／發布、資格、跨場容量與時間限制、團體／個人、獨立實習。貓 5→6、狗 10→12 真 API／DB 與畫面試行通過，舊場次容量不變 | 原實習表未提供，不能宣稱逐欄轉換完成；未決普通政策由授權 admin 明確選擇與發布，不需開發者／第二審批人 |
| 5 月曆／自動化    | 四種營運月曆、月初評核、候選升級、缺人／補位、通知重試／送達／退信證據；server 重新核對有效政策                                                      | 正式 cron actor、排程與 email provider 啟用；WhatsApp 尚無 transport，live 配置會拒絕                 |
| 6 完整驗收        | 最新 101 migration 真 DB、角色瀏覽器旅程、貓狗合成試行、恢復及操作交接已執行；公開網站 gate 見下方最新結果                                           | 真實職員營運試行及正式發布／切換尚未執行，不應標記為正式營運全面驗收完成                              |

## 最新可重現證據

- `bun run test:acceptance:all`：2,353 pass、0 fail、0 skip；7,664 assertions／393 files。媒體 reconciliation 原本跳過的測試現使用專用 56321／56322 與 fixture prefix，沒有碰共用 55321／55322。
- TypeScript 通過；lint 0 errors、44 既有 React refresh warnings；production build 通過。
- Supabase CLI 專用 `.local-policy-test` clean replay：63 baseline + 38 candidate = 101；再次 migration up 為 no-op。最新 ledger／權限見 [schema](six-phase-schema-verification.json)。正式資料庫沒有 reset、migration replay 或寫入。
- [production-shaped rehearsal](six-phase-production-shaped-rehearsal.json)：294 application objects，先驗證拒絕未知 function drift，再驗證 prerequisite 與全部 37 後續 feature migrations；保留 canonical sentinel ID 及 production-only source_url。
- [恢復演練](six-phase-restore.json)：還原到另一個本機 DB，158 張表／1,533 筆合成記錄的資料及 ID 雜湊一致。DB 備份不等同外部 object bytes、provider state 或實際 production recovery 證明。
- 角色瀏覽器：[核心設定](browser/report.json)、[政策來源／團體／調期](browser/policy-sources-operations/report.json)、[條款](browser/terms-refresh/report.json)、[工作台](browser/tasks/report.json)、[評核](browser/assessments/report.json)、[實習](browser/internships/report.json)、[動物 CMS](browser/animals/report.json)、[財務](finance-browser/report.json)、[狗舍試行](browser/dog-pilot/report.json)、[簽署回調至職員畫面](browser/delivery/report.json)。
- 狗舍試行明確選用無團體／無每日 scope 的合成政策以測試單場容量；跨场／每日 scope 由獨立 DB tests 驗證，沒有把此旅程誇稱為全部狗舍政策的操作試行。
- 38 個 migration 已列入 [frozen manifest](migration-release-manifest.json)，原 37 檔 SHA-256 未變；45 個本機截圖列入 [raw manifest](raw-artifact-manifest.json)。截圖依既有規則保留本機，不含登入憑證。

## 通知送達操作

部署候選並取得供應商設定授權後，在 Resend 配置 `/api/webhooks/resend`，將該 endpoint 的 signing secret 存入 server-only `RESEND_WEBHOOK_SECRET`，不可使用 VITE 前綴。訂閱 email.delivered、email.bounced、email.failed、email.complained、email.delivery_delayed。未配置 secret 時端點回覆 503；驗證失敗回覆 400；資料庫未持久化回覆 503 供重試。

原始 body 先驗證簽署與時間，再只保存 event ID、provider message ID、事件類型、時間及 body hash；不保存 callback 的收件人／正文。相同事件重播不重複 audit，不同內容相同 ID 拒絕。事件與 audit 同交易；資料為不可改寫事實。查詢按事件時間投影，所以 callback 先於 sender 保存 ID 或到達順序顛倒仍能顯示。

「送達」指收件郵件伺服器接受，不代表已閱讀。工作台及 CRM 區分 provider acceptance、送達、退信／投訴；退信／投訴不會自動重發或把已接受的 send job 改成失敗。職員需查明原因、檢查同意及地址後按既有授權流程跟進。參考 [Resend signature verification](https://resend.com/docs/webhooks/verify-webhooks-requests) 與 [delivered semantics](https://resend.com/docs/webhooks/emails/delivered)。本機驗收僅使用合成 signing key 與真 HTTP 回調，沒有連線發送真實電郵。

## 發布及恢復界線

按 [migration runbook](migration-release-runbook.md) 的逐檔、逐交易、ledger 確認流程處理，最新第 38 檔為 `20260913113000_mail_delivery_evidence.sql`。不得重播已存在 baseline 或把 remote ledger 33 筆誤當缺少其他 source files。回調 migration 新增不可變 evidence 與 service-only projections，不改寫既有 send facts；關閉新回調入口可停止接收，保留已存證據。不要用刪表作 rollback。

政策回復需把舊版複製為新草稿、比較與發布新的生效版本，不改寫原政策／出席事實。先備份並驗證可還原，再批准正式 migration、部署、供應商啟用及營運試行。此候選沒有 push、merge、部署、真付款、真訊息或 production 記錄 mutation。
