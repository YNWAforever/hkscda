# 義工營運中心 — 實作及驗收紀錄

實作 commit：98647fc。

日期：2026-09-14。候選分支：feat/volunteer-admin-operations-centre。
基線：7aa7bfca385532baffacce2ff4ea80dd20169d8c（PR #120 已合併版本）。

## 已交付

- 統一品牌工作區、角色導覽、麵包屑、手機展開導覽及頁內步驟；所有原有義工內頁 URL 保留。
- 營運總覽使用有權限的 exact count 查詢和香港日界；部分失敗顯示未能讀取。待審批總數連到相同全範圍、可分頁的 pending 名單。
- 新增 /people 名冊：伺服器姓名/已連結電郵字面搜尋、級別/身份篩選、穩定分頁、總數；待核實而零報名的身份亦可找到。
- 新增 /people/$id：身份/資格、報名、出席事實及更正、核實歷史。各類100筆上限及完整總數/覆蓋起點明示；不推算缺失服務。
- 原有活動/報名工作區移至 /activities；報名詳情按 canonical profile_id 連回人物；未連結的舊報名導向證據核對流程。
- 資格頁可按電郵/姓名選人，支援個人詳情深連結，選人時清除其他人的證據輸入，保留既有原子核實命令。
- 月曆支援從總覽選定場次；待辦、團體及改期、全日配額、來源和評核頁加入一致分組與步驟導覽。
- 設定頁增加逐項版本差異、必要日期/原因/pending 操作控制、SPA及整頁離開的未儲存提示。原先顯示初始常數的月度摘要改為連到目前版本化評核設定，避免誤認初始值為現行設定。
- 修復本次瀏覽器驗收重現的舊身份核對 list_legacy SQL別名歧義，以新增遷移處理，不改舊遷移。

## 驗證

最終命令及結果：

| 檢查                        | 結果                                                                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| bun run test:acceptance:all | 2,405 passed / 0 failed，7,864 assertions，408 files；全部使用專用56322資料庫                                             |
| bun run typecheck           | 通過                                                                                                                      |
| bun run lint                | 0 errors，44既有warnings                                                                                                  |
| bun run build               | 通過                                                                                                                      |
| 專項資料庫/SQL權限/回退     | 見 database.md；新名冊讀模型及 legacy repair 的重現/修正證據                                                              |
| 角色/裝置/內頁/旅程         | 50頁面/角色/尺寸檢查、29權限檢查、5操作旅程全部通過；見 browser.json，附代表截圖                                          |
| 公開品牌檢查                | 已執行但未通過：/stories 的兩個既有本地 synthetic.jpg 測試資產回應觸發 ERR_BLOCKED_BY_ORB，非本次義工後台檔案；不標為通過 |

第一次直接 bun test 使用預設本地RLS環境時，sponsorship_assignment fixture建立失敗。改用repo指定 test:acceptance:all 專用56322環境後，完整資料庫/單元測試通過。沒有以跳過測試解決。

瀏覽器測試只連接 http://127.0.0.1:56336 與專用 Supabase http://127.0.0.1:56321。測試帳戶使用 example.invalid，未對真實義工、支持者、金錢或出席做變更；登入不發送電郵。政策成功發布/原子報名/出席不變條件由完整隔離DB/API接受測試驗證；瀏覽器結果僅按實際執行的旅程陳述，不等同正式營運試行。

## 遷移、兼容與發布

本候選包含兩項新增 forward migration：

1. 20260913180745_volunteer_admin_directory_read.sql：受限staff/admin讀模型，service_role才可呼叫；不改表或記錄。
2. 20260913182552_volunteer_legacy_list_alias_fix.sql：只修正現有函式的 list_legacy 別名，保留mutation body、ACL及函式屬性；guard遇到不同現行函式會停止，須先核對。

目前只在隔離56322直接套用函式驗證，沒有修改正式DB、沒有重播既有遷移、沒有修改正式ledger。正式發布須先取得release approval，再核對部署目標/遷移ledger/目前函式、執行未套用的新遷移，最後部署本候選及做唯讀smoke。不要先部署需要新RPC的名冊頁而未套用新讀函式。

應用回退至基線後，新讀函式可以保留；若需要移除，按 database.md 的安全次序 DROP 指定函式，不使用 CASCADE，不刪任何canonical身份/紀錄。別名修正可以在舊應用版本中保留。沒有執行正式回退或正式角色試行。

## 保留與審查

保留較新的PR #120、現有身份/照片/資料/政策原子流程。原始checkout未修改。既有未追蹤 docs/evidence/admin-volunteer-settings/production-repair-20260914.md 未加入commit。

獨立源碼覆核指出的三項整合問題（SPA草稿流失、pending統計入口不一致、報名缺人物連結）均已修正；瀏覽器發現的側欄對比及日期/月分/範圍標籤亦已修正。正式合併/部署尚未授權，本候選供PR審查。
