# HKSCDA 合併 PR #130／#132 後再審核

日期：2026-09-27（香港時間）；觀察時間約 00:54–01:10 HKT。  
正式站：https://hkscda.vercel.app/  
本次固定 SHA：`aa280ed59e1496767e2579c91501ea6330fd62ae`。上次 SHA：`b77e4cde6c90d52d2f9ceeb48c8857d264d34694`。  
這是上次報告的增補，不覆蓋原證據；新增發現不全部代表由這兩個PR新引入。

## 1. 最需要先處理的結果

**正式站已部署新版，但資料庫缺少新版依賴。領養需知已實際失效。**

目前最優先是恢復程式與資料庫相容性。單純調整UI、再merge其他修正，不能解決這個問題。除現場故障外，本次整理 **11項新增發現**，其中R01是立即處理的P1，其餘10項是P2；R01的多個受影響功能共用同一根因，不拆開灌大問題數目。

最新版本的CI已轉為成功：verify、RLS、a11y、brand、performance五個job全部success。上次OPS-01可關閉；CI成功不代表正式資料庫已套用migration。

## 2. 版本與實際查證

| 項目 | 結果 |
|---|---|
| PR #130 | 2026-09-27 00:47:05 HKT合併；公開／後台、交易、上載與原子稽核改善 |
| PR #132 | 2026-09-27 00:47:22 HKT合併；領養中文頁面CMS、修訂、預覽與還原 |
| 相對上次diff | 257檔案；新增／改動23個migration檔 |
| Vercel正式部署 | dpl_DU6HACxZ2jQURHFUUYqymH4GjktM；READY；production alias hkscda.vercel.app；SHA與本次source一致 |
| CI | [run 36256715879](https://github.com/YNWAforever/hkscda/actions/runs/36256715879)，2026-09-27 00:56:36 HKT完成，五個job成功 |
| 正式資料庫唯讀 | HKSCDA／iihqjzilgawhfdhdevam，ACTIVE_HEALTHY；只查catalog及migration metadata，沒有讀申請人／付款個資 |
| 正式DB結果 | 8張抽查的新表、14個指定RPC、1個submission_fingerprint欄位均缺少；ledger最新20260914164558 |
| 現場 | 領養需知錯誤反覆出現；助養付款選項錯誤仍可重現；義工仍無場次；捐款仍停用；助養首頁仍115隻及首屏缺圖 |
| 本機驗證 | 6項隔離程式探針；兩張合成收條；沒有執行完整Bun suite，完整CI結果來自GitHub |

PR #130的說明記錄了22個migration尚未在目標ledger套用及歷史分歧；#132亦要求新CMS migration先完成才merge。本次不只沿用PR說明，而是重新查catalog確認依賴確實缺少。這不等於可以直接把所有歷史migration一併push。

## 3. 資料庫缺漏的影響範圍

| 功能 | 新source依賴／觀察 | 結論強度 |
|---|---|---|
| 領養需知／CMS | adoption_instruction_pages、adoption_instruction_revisions及新RPC缺少 | 公開頁故障已重現；CMS登入後未操作 |
| 公眾助養 | lookup讀submission_fingerprint；建立呼叫create_public_sponsorship_pledge | schema＋必經source路徑確認；未正式提交 |
| 公眾領養 | 完成提交要寫submission_fingerprint；retry亦讀它 | schema＋source確認；未完整正式提交，需驗證補償清理 |
| 動物相片 | reserve_animal_draft_image_upload、publish_animal_publication_once、media queue缺少 | 上載／發布路徑受阻風險；未正式發佈 |
| 助養付款證明 | 公眾／staff proof intent table及reserve RPC缺少 | metadata持久化依賴缺少；未上載正式證明 |
| 實習附件 | internship_attachment_upload_intent缺少 | 新附件上載路徑依賴缺少；未使用真實申請 |
| 團體查詢後台 | update_group_enquiry_with_audit缺少 | 更新路徑依賴缺少；未改正式查詢 |
| 收條 | issue_receipt_with_audit、void_receipt_with_audit、void_donation_receipts_with_audit缺少 | 人工發出／作廢與退款作廢路徑受影響；自動issue_receipt是另一RPC，不把所有收條一概判壞 |
| 付款拒付／退款同步 | fail_pending_provider_payment、refund_provider_payment_atomically缺少 | 已付款事件亦需保護及重放；未觸發供應商事件 |
| 背景相片修復 | claim_due_animal_publication_media_copies、claim_due_content_public_assets缺少 | 目前相容性阻塞；補好後仍有R08容量問題 |

## 4. 新發現清單

| ID | 優先 | 問題 | 證據 |
|---|---|---|---|
| R01 | P1／立即恢復服務 | 正式程式與資料庫不相容，多條服務路徑缺少必要 schema | 新回歸；現場＋部署＋唯讀資料庫確認 |
| R02 | P2 | 領養頁內容失效仍回 HTTP 200，原始資料庫錯誤亦被抹掉 | 既有設計；本次現場證實影響 |
| R03 | P2 | 新領養頁面 CMS 切換分頁會直接丟失未儲存文字 | PR #132 新增；隔離 React 測試重現 |
| R04 | P2 | 新 CMS 每次載入完整歷史，且用歷史列表尋找目前版本 | PR #132 新增；程式碼＋上限模擬 |
| R05 | P2 | 屋苑編輯保留舊發佈狀態；新增表格重用同一 ID | 既有問題，本次新增發現；隔離 React 測試重現 |
| R06 | P2 | 領養費用排序以三個獨立請求執行，中途失敗會留下半完成排序 | 既有問題，本次新增發現；程式碼確認 |
| R07 | P2 | 助養證明上載在 Turnstile 關閉模式被 null token schema 擋住 | PR #130 改動；精確 schema 隔離測試重現 |
| R08 | P2 | 相片故障修復每日只處理50項，失敗項可能長期阻塞隊列 | PR #130 新增；程式碼及排程確認 |
| R09 | P2 | SSR／API 部署 region 與資料庫 region 不一致 | 新確認的設定問題；非新增PR特有 |
| R10 | P2 | 收條日期依賴伺服器時區，香港凌晨可能顯示前一天 | 既有邏輯，本次新增驗證；條件式缺陷 |
| R11 | P2 | 單張簡單收條約4.34 MB，每次生成重新取得7.07 MB字型 | 本次新增實測；本機合成PDF |

### R01 · 正式程式與資料庫不相容，多條服務路徑缺少必要 schema

**優先／類型：**P1／立即恢復服務；新回歸；現場＋部署＋唯讀資料庫確認。

**證據：**Vercel 正式 alias 已指向 aa280ed；領養需知反覆顯示「暫時未能載入領養資訊」。HKSCDA 專案 iihqjzilgawhfdhdevam 缺少 adoption_instruction_pages、adoption_instruction_revisions，以及另外 6 張新增上載／發佈表；14 個抽查的新版 RPC 全部不存在；public_status_token.submission_fingerprint 亦不存在。migration ledger 共 79 項，最新紀錄 20260914164558，沒有 20260925 或以後的版本。兩個 PR 的合併差異包含 23 個 migration 檔案。表／函式實際不存在，比單憑 migration ledger 更能確認不相容。

**影響：**領養需知已是可見事故。助養第一次提交會在 retry lookup 讀不存在的 fingerprint 欄位；領養成功路徑要寫該欄位；新相片上載／發佈、團體查詢更新、手動收條、拒付／退款同步亦依賴缺少的 RPC。這些操作尚未用正式資料觸發，不宣稱全部已有真實失敗交易。

**修正方向：**立即核對目前 schema 與 release manifest，保留備份及 migration 差異；在隔離資料庫演練相容性修復，再按既有發布授權執行。若無法即時修復，評估回復已驗證相容的版本或對受影響新提交顯示維護安排。不要盲目 db push 所有歷史 migration、標記它們已執行，或回退到會漏稽核的舊寫入方式。既有付款 webhook 要保留／排隊及重放，不能直接丟棄。

**驗收：**部署前檢查必要表、欄位、RPC signature、grants、RLS 與初始 published revision；以隔離環境實際走完領養、助養、相片、收條及退款事件。部署後讀取真實正式頁內容。

程式碼：[src/lib/adoptionInformation/publicPage.server.ts:139](https://github.com/YNWAforever/hkscda/blob/aa280ed59e1496767e2579c91501ea6330fd62ae/src/lib/adoptionInformation/publicPage.server.ts#L139)；[src/lib/sponsorship/submission.server.ts:97](https://github.com/YNWAforever/hkscda/blob/aa280ed59e1496767e2579c91501ea6330fd62ae/src/lib/sponsorship/submission.server.ts#L97)；[src/lib/publicAdoption/submission.server.ts:365](https://github.com/YNWAforever/hkscda/blob/aa280ed59e1496767e2579c91501ea6330fd62ae/src/lib/publicAdoption/submission.server.ts#L365)；[src/lib/donations/reconcile.server.ts:254](https://github.com/YNWAforever/hkscda/blob/aa280ed59e1496767e2579c91501ea6330fd62ae/src/lib/donations/reconcile.server.ts#L254)；[src/routes/api/admin/animals/publication/index.ts:150](https://github.com/YNWAforever/hkscda/blob/aa280ed59e1496767e2579c91501ea6330fd62ae/src/routes/api/admin/animals/publication/index.ts#L150)

### R02 · 領養頁內容失效仍回 HTTP 200，原始資料庫錯誤亦被抹掉

**優先／類型：**P2；既有設計；本次現場證實影響。

**證據：**Vercel 正式 logs 的 16:49:42、16:54:09、16:55:37、16:59:30 UTC 都是 GET /adoption/instructions 200，同時記錄 error。resilientPublicLoader 把例外改成狀態資料，保留 200；loadPublicAdoptionPage 先 catch 並改拋泛用 Error，因此 log 只見 Could not load adoption information。CI 的公開頁檢查使用本機 fixture。

**影響：**只看 HTTP 200／部署 READY 的監控會漏掉主要內容完全不能使用；調查人員看不到缺表、權限或資料驗證的原始原因。CI 綠燈不能證明正式 DB 相容。

**修正方向：**保留可操作的錯誤頁，同時讓 SSR 回適當暫時不可用狀態，或提供內容層 readiness／synthetic assertion；記錄去識別化 error code、route、release SHA、correlation ID 及 cause。不要把私人資料或機密放入 log。

**驗收：**模擬缺表及 DB timeout，頁首仍可用，但監控必須告警；恢復後檢查領養費用、規則等實際內容，不只檢查200。

程式碼：[src/lib/routing/resilientLoader.ts:15](https://github.com/YNWAforever/hkscda/blob/aa280ed59e1496767e2579c91501ea6330fd62ae/src/lib/routing/resilientLoader.ts#L15)；[src/lib/adoptionInformation/publicPage.server.ts:154](https://github.com/YNWAforever/hkscda/blob/aa280ed59e1496767e2579c91501ea6330fd62ae/src/lib/adoptionInformation/publicPage.server.ts#L154)；[.github/workflows/ci.yml:79](https://github.com/YNWAforever/hkscda/blob/aa280ed59e1496767e2579c91501ea6330fd62ae/.github/workflows/ci.yml#L79)

### R03 · 新領養頁面 CMS 切換分頁會直接丟失未儲存文字

**優先／類型：**P2；PR #132 新增；隔離 React 測試重現。

**證據：**AdoptionInstructionsManagementView 的 local/saved 只存在元件 useState；父元件用 activeTab 條件渲染，handleTabChange 直接切換並卸載 editor，沒有 dirty callback／切換阻擋。測試改 hero.title 後卸載再掛載，文字回到原伺服器值。

**影響：**職員改標題後去「領養費用／規則」查看資料，再返回便失去修改；顯示「尚未儲存」不足以防止此情況。

**修正方向：**把 dirty 狀態交給父層；tab、路由、重新載入及關閉各有保存／捨棄／取消選項。保存成功才解除阻擋，保留現有 409 衝突時不覆蓋本機文字的設計。

**驗收：**改文字→切tab→取消應留在原頁；保存後切換→返回應保留；保存失敗不能自動離開。

程式碼：[src/components/admin/content/AdoptionInstructionsManagement.tsx:138](https://github.com/YNWAforever/hkscda/blob/aa280ed59e1496767e2579c91501ea6330fd62ae/src/components/admin/content/AdoptionInstructionsManagement.tsx#L138)；[src/components/admin/content/AdoptionInformationManagement.tsx:149](https://github.com/YNWAforever/hkscda/blob/aa280ed59e1496767e2579c91501ea6330fd62ae/src/components/admin/content/AdoptionInformationManagement.tsx#L149)

### R04 · 新 CMS 每次載入完整歷史，且用歷史列表尋找目前版本

**優先／類型：**P2；PR #132 新增；程式碼＋上限模擬。

**證據：**listHistory 選取每個 revision 的完整 content，沒有 range／limit／cursor；getAdminPage 以 history.find 找 published/draft。隔離 fake 模擬服務端最多返回1000行、已發布版本比這1000行更舊，getAdminPage 拋 internal 500。這是條件式重現，沒有聲稱正式庫已有1000版本。

**影響：**日常載入／保存後重新整理成本隨歷史增長；大量建立及封存草稿但長期不發布時，歷史截斷可能使仍有效的公開版本在管理頁找不到。

**修正方向：**目前 published/draft 用 ID 獨立讀取；歷史只讀摘要及伺服器分頁，點開才載內容；還原以指定revisionId查詢，不能以當頁history作存在性判斷。

**驗收：**1、100、1002個修訂均可管理；舊公開版本即使不在第一頁歷史亦可讀；首頁payload保持固定規模。

程式碼：[src/lib/adoptionInstructions/repository.server.ts:200](https://github.com/YNWAforever/hkscda/blob/aa280ed59e1496767e2579c91501ea6330fd62ae/src/lib/adoptionInstructions/repository.server.ts#L200)；[src/lib/adoptionInstructions/service.ts:126](https://github.com/YNWAforever/hkscda/blob/aa280ed59e1496767e2579c91501ea6330fd62ae/src/lib/adoptionInstructions/service.ts#L126)

### R05 · 屋苑編輯保留舊發佈狀態；新增表格重用同一 ID

**優先／類型：**P2；既有問題，本次新增發現；隔離 React 測試重現。

**證據：**EstateEditor 只在 mount 以 props 建立 draft，成功 mutation 僅 invalidateQueries。模擬發布 false→true 並refetch後，按鈕仍顯示「發佈」；再按「編輯」送出 isPublished=false。新增表格的 UUID 亦只初始化一次，連續「新增甲／新增乙」送出相同ID；repository 使用 upsert。

**影響：**職員可能在更新屋苑名稱時把已發佈項目取消發佈；連續新增可能覆寫上一筆而不是建立兩筆。這不是單純標籤顯示錯誤。

**修正方向：**成功回應同步該row的伺服器版本；新增成功重設空表格及ID；將修改內容和發佈狀態的命令分開，加入 expected version 與未儲存防護。

**驗收：**發布→修改名稱仍保持已發布；取消發佈可往返切換；連續新增兩筆必須有兩個不同ID，刷新後均存在。

程式碼：[src/components/admin/content/AdoptionInformationManagement.tsx:397](https://github.com/YNWAforever/hkscda/blob/aa280ed59e1496767e2579c91501ea6330fd62ae/src/components/admin/content/AdoptionInformationManagement.tsx#L397)；[src/lib/adoptionInformation/repository.server.ts:294](https://github.com/YNWAforever/hkscda/blob/aa280ed59e1496767e2579c91501ea6330fd62ae/src/lib/adoptionInformation/repository.server.ts#L294)

### R06 · 領養費用排序以三個獨立請求執行，中途失敗會留下半完成排序

**優先／類型：**P2；既有問題，本次新增發現；程式碼確認。

**證據：**move-fees 依 buildFeeMoveSequence 先移到temporarySortOrder，再改目標，再改原項；三次 POST 逐一提交。每次RPC自身有稽核，但三次並非同一transaction；onSuccess 才 invalidate。上移／下移按鈕沒有 disabled={pending}。

**影響：**第二或第三次失敗時，前面的修改已提交；畫面可能仍是舊排序。快速重複點擊或多人排序可交錯；將來批量調整會放大此問題。

**修正方向：**新增原子 reorder RPC，收兩個ID及預期版本，一次transaction鎖定、驗證、修改和稽核；按鈕在pending時停用，錯誤後重新讀取真實狀態。

**驗收：**在每個寫入點注入失敗，全部不變或完整交換；雙擊只執行一次；並行排序回衝突；不留下臨時sortOrder。

程式碼：[src/components/admin/content/AdoptionInformationManagement.tsx:126](https://github.com/YNWAforever/hkscda/blob/aa280ed59e1496767e2579c91501ea6330fd62ae/src/components/admin/content/AdoptionInformationManagement.tsx#L126)；[src/components/admin/content/AdoptionInformationManagement.tsx:383](https://github.com/YNWAforever/hkscda/blob/aa280ed59e1496767e2579c91501ea6330fd62ae/src/components/admin/content/AdoptionInformationManagement.tsx#L383)；[src/components/admin/content/AdoptionInformationManagement.tsx:508](https://github.com/YNWAforever/hkscda/blob/aa280ed59e1496767e2579c91501ea6330fd62ae/src/components/admin/content/AdoptionInformationManagement.tsx#L508)

### R07 · 助養證明上載在 Turnstile 關閉模式被 null token schema 擋住

**優先／類型：**P2；PR #130 改動；精確 schema 隔離測試重現。

**證據：**PledgeWizard token 初始為null；TurnstileWidget 沒site key時不渲染且turnstileEnabled=false。uploadProofDirectly 仍把 turnstileToken:null 寫入JSON；proof-upload-url 的 z.string().optional() 接受省略但拒絕null。實測相同schema：null=false、省略=true、字串=true，驗證發生在 verifyTurnstile 前。

**影響：**原本支援的本機／preview／明確關閉驗證模式下，選付款證明會在準備上載時400。未檢視正式機密設定，不能斷言正式Turnstile關閉。此問題在補好DB後仍可存在。

**修正方向：**前端沒有token時省略欄位，或server明確normalize null→undefined，再交既有verifier決定；正式啟用時仍拒絕缺token，不能為修UI改為跳過驗證。

**驗收：**Turnstile開／關 × 有／無證明四種組合；使用單次token模型及已簽署proof intent，不得重複消耗同一challenge。

程式碼：[src/components/site/sponsorship/pledgeProofUpload.ts:27](https://github.com/YNWAforever/hkscda/blob/aa280ed59e1496767e2579c91501ea6330fd62ae/src/components/site/sponsorship/pledgeProofUpload.ts#L27)；[src/routes/api/sponsorships/pledges/proof-upload-url.ts:24](https://github.com/YNWAforever/hkscda/blob/aa280ed59e1496767e2579c91501ea6330fd62ae/src/routes/api/sponsorships/pledges/proof-upload-url.ts#L24)；[src/components/site/TurnstileWidget.tsx:30](https://github.com/YNWAforever/hkscda/blob/aa280ed59e1496767e2579c91501ea6330fd62ae/src/components/site/TurnstileWidget.tsx#L30)

### R08 · 相片故障修復每日只處理50項，失敗項可能長期阻塞隊列

**優先／類型：**P2；PR #130 新增；程式碼及排程確認。

**證據：**public-uploads cron 是45 3 * * *，每日一次；animal/content repair 各claim一次p_limit=50，SQL亦hard cap50；失敗claim一小時後可重取，排序仍由最舊created_at開始，沒有attempt ceiling／next_retry_at／dead-letter。正常即時copy成功不受此上限限制。

**影響：**上載故障或中斷後才依賴此修復：1000張pending理論上至少20次每日執行才能清完，未計新流量；最舊50張永久失敗可令後面一直取不到。現場未查或聲稱有1000張積壓。

**修正方向：**把公開圖片修復與每日孤兒清理分開；按分鐘或背景queue執行，設時間預算、重試退避、attempt count及人工處理隊列。後台顯示未完成數、最舊等待時間、逐筆原因及只重試失敗項。

**驗收：**用500項合成資料與50個永久失敗項驗證其餘仍能前進；保留claim fencing、冪等與「先commit才公開圖片」保護。

程式碼：[vercel.json:32](https://github.com/YNWAforever/hkscda/blob/aa280ed59e1496767e2579c91501ea6330fd62ae/vercel.json#L32)；[src/lib/animals/publicationMediaRepair.server.ts:53](https://github.com/YNWAforever/hkscda/blob/aa280ed59e1496767e2579c91501ea6330fd62ae/src/lib/animals/publicationMediaRepair.server.ts#L53)；[src/lib/content/publicationMediaRepair.server.ts:54](https://github.com/YNWAforever/hkscda/blob/aa280ed59e1496767e2579c91501ea6330fd62ae/src/lib/content/publicationMediaRepair.server.ts#L54)；[supabase/migrations/20260926170000_animal_publication_media_copy.sql:99](https://github.com/YNWAforever/hkscda/blob/aa280ed59e1496767e2579c91501ea6330fd62ae/supabase/migrations/20260926170000_animal_publication_media_copy.sql#L99)；[supabase/migrations/20260926190000_content_publication_media_after_commit.sql:78](https://github.com/YNWAforever/hkscda/blob/aa280ed59e1496767e2579c91501ea6330fd62ae/supabase/migrations/20260926190000_content_publication_media_after_commit.sql#L78)

### R09 · SSR／API 部署 region 與資料庫 region 不一致

**優先／類型：**P2；新確認的設定問題；非新增PR特有。

**證據：**Vercel 正式deployment metadata回傳regions=[iad1]；Supabase HKSCDA project回傳region=ap-southeast-1。相同部署SHA已核對。公眾動物全集讀取循環，以及領養提交多個序列PostgREST呼叫，會多次跨region。

**影響：**增加動態頁及多步寫入的網絡往返成本；這是可確認的跨區設定，尚未量到它貢獻多少延遲。不能沿用上次代理環境10–20秒作香港用戶速度。

**修正方向：**確認資料所在地與hosting支援後，把server execution安排靠近DB，或減少序列round-trip／合併原子RPC；更改需核對地區限制及已配置供應商，不為加速移走敏感資料。

**驗收：**同樣資料、請求、冷／暖條件下比較API p50/p95及DB round-trip，先記baseline再切換；香港手機另量LCP/INP。

程式碼：[vercel.json:1](https://github.com/YNWAforever/hkscda/blob/aa280ed59e1496767e2579c91501ea6330fd62ae/vercel.json#L1)；[src/lib/animals/publicListing.server.ts:15](https://github.com/YNWAforever/hkscda/blob/aa280ed59e1496767e2579c91501ea6330fd62ae/src/lib/animals/publicListing.server.ts#L15)；[src/lib/publicAdoption/submission.server.ts:330](https://github.com/YNWAforever/hkscda/blob/aa280ed59e1496767e2579c91501ea6330fd62ae/src/lib/publicAdoption/submission.server.ts#L330)

### R10 · 收條日期依賴伺服器時區，香港凌晨可能顯示前一天

**優先／類型：**P2；既有邏輯，本次新增驗證；條件式缺陷。

**證據：**PDF使用 new Date(issuedAt).toLocaleDateString("zh-HK")，沒有timeZone；zh-HK只選格式。對同一2026-09-26T16:30:00Z，UTC日期26/9/2026、香港日期27/9/2026。未讀正式TZ設定，也未生成真實捐款收條。

**影響：**伺服器使用UTC時，香港00:00–07:59的日期與職員／支持者認知不同；不一致的日期也增加對帳查詢。

**修正方向：**把展示用時區明確設為Asia/Hong_Kong，儲存instant保留UTC；收條編號年度、日期及其他財務period要由協會批准的業務規則統一，不在此推斷稅務年度。

**驗收：**香港午夜前後、跨年、重試補發均使用原issuedAt及一致時區；更換部署region不得改日期。

程式碼：[src/lib/donations/receipt-pdf.server.ts:83](https://github.com/YNWAforever/hkscda/blob/aa280ed59e1496767e2579c91501ea6330fd62ae/src/lib/donations/receipt-pdf.server.ts#L83)；[src/lib/donations/reconcile.server.ts:251](https://github.com/YNWAforever/hkscda/blob/aa280ed59e1496767e2579c91501ea6330fd62ae/src/lib/donations/reconcile.server.ts#L251)

### R11 · 單張簡單收條約4.34 MB，每次生成重新取得7.07 MB字型

**優先／類型：**P2；本次新增實測；本機合成PDF。

**證據：**實際generateReceiptPdf配合repo字型及假姓名執行兩次：PDF 4,338,613／4,338,609 bytes；本機生成764／704ms；兩次均呼叫字型fetch。字型7,071,436 bytes，使用subset:false。測試將fetch改讀本機檔案，沒有正式網絡、DB、Storage或email。

**影響：**大量發收條會重複取字型、消耗CPU及儲存；支持者下載一頁文字收條亦較重。時間是本機CPU觀測，不是正式server延遲；不能說郵件附帶4MB，現有傳送路徑未作此驗證。

**修正方向：**先快取／本機載入字型bytes，對並行請求合併讀取；評估更小且完整支援繁中的字型或經驗證的subset方案。原碼註明現有subset會缺字，不能直接改true；批量收條以背景任務產生，保留可恢復工作狀態。

**驗收：**測姓名含常用／罕見繁中、長名稱及英文，文字不可缺字；比較檔案大小、CPU、font fetch次數及批量失敗恢復。

程式碼：[src/lib/donations/receipt-pdf.server.ts:32](https://github.com/YNWAforever/hkscda/blob/aa280ed59e1496767e2579c91501ea6330fd62ae/src/lib/donations/receipt-pdf.server.ts#L32)；[src/lib/donations/receipt-pdf.server.ts:43](https://github.com/YNWAforever/hkscda/blob/aa280ed59e1496767e2579c91501ea6330fd62ae/src/lib/donations/receipt-pdf.server.ts#L43)；[src/lib/donations/reconcile.server.ts:280](https://github.com/YNWAforever/hkscda/blob/aa280ed59e1496767e2579c91501ea6330fd62ae/src/lib/donations/reconcile.server.ts#L280)

## 5. 上次23項問題逐項回查

「source未改」是仍有同一程式原因，不代表本次再次完成所有登入後E2E。正式內容可獨立於git變動，因此沒有把未重新讀取的內容當作新現場證據。

| 上次ID | 本次判斷 | 說明 |
|---|---|---|
| PAY-01 | 仍存在／現場 | 捐款仍顯示尚未完成正式啟用審批 |
| PAY-02 | 仍存在／source | API新增body上限，但建立捐款前仍沒有同一付款啟用／方式審批gate |
| PAY-03 | 仍存在／source | 助養電郵及手動付款指示仍寫死；原子提交不解決付款資料來源 |
| CONTENT-01 | 未能關閉 | source條件未改；本次故事重讀未完成，不沿用舊截圖冒充新證據 |
| VOL-01 | 仍存在／現場 | 等載入完成後仍無已發佈義工場次 |
| SPON-01 | 仍存在／現場 | 勾稍後付款仍展開已付款證明 |
| SPON-02 | 仍存在／現場 | 條款仍沒有閱讀連結 |
| SPON-03 | 仍存在／現場＋source | 月額、動物偏好與付款／續期解釋未補齊 |
| SPON-04 | 部分改善，未關閉 | 409有特定文案；仍只提交時存草稿，其他錯誤泛用 |
| CONTENT-02 | 仍存在／現場 | 第一頁仍有5張缺相片；卡片決策資訊未改 |
| VOL-02 | 仍存在／source | section-container用法與樣式未改；本次沒有新增手機驗證 |
| ADOPT-01 | 仍存在／source | 舊條款同意會失效是改善；但草稿TTL／清除仍缺 |
| ADOPT-02 | 未關閉，新增回歸 | 新CMS擴充維護能力，沒有解決長表格準備；需知頁另因R01失效 |
| CRM-01 | 仍是產品缺口 | 統一公眾支持者自助入口未新增 |
| ADMIN-01 | 仍存在／source未改 | ExportBar錯誤及busy處理未改 |
| ADMIN-02 | 仍存在／source未改 | SupporterFormDialog props同步未改 |
| ADMIN-03 | 仍存在／source未改 | 搜尋debounce／取消／保留狀態仍待統一 |
| ADMIN-04 | 仍待UX改善 | 批量能力存在；職員流程及狀態呈現未重整 |
| PERF-01 | 仍存在／source | 讀取改為累加實際batch長度以避免截斷；仍先讀全集再分頁 |
| PAY-04 | 仍存在／source未改 | 設定讀取錯誤仍回空array |
| PAY-05 | 仍存在／source | reconcile改善，publicStatus.server仍把side effect refresh失敗的succeeded改回pending |
| OPS-01 | 已關閉（本次SHA） | 最新CI五個job成功；新增正式schema相容性問題改列R01/R02 |
| SEC-01 | 條件風險仍在 | 完全缺少配置仍fail open；本次未讀正式secret值，不判定正式保護已失效 |

## 6. 兩個PR確實帶來的改善

| 改善 | 本次判斷 |
|---|---|
| 新CMS草稿、修訂、還原、409保留文字 | source已存在；R03/R04是餘下問題，不等於整個CMS沒做 |
| 助養原子提交＋稽核 | 新RPC把pledge及相關記錄原子化；正式缺RPC需先補相容性 |
| proof intent取代再次驗證Turnstile | final pledge有proof時驗signed intent，不重複消耗單次challenge；本次已排除「同token驗兩次」假設 |
| 領養／助養retry fingerprint及409提示 | source已改；正式缺欄位阻礙投入使用 |
| request body大小限制 | 多個公開／後台route已改用bounded reader；不再沿用未設上限的舊診斷 |
| 已停權義工再驗證 | requireVerifiedVolunteer查最新停權狀態，改善舊token繼續使用的風險 |
| 收條發出／作廢原子稽核 | source改用RPC；缺migration時不能聲稱正式已可用 |
| 相片先commit後公開及可恢復意圖 | 保留此保護；R08針對恢復排程與吞吐，不要求退回公開draft |
| PayPal回應、收條中文／長姓名、付款輪詢deadline | source有改善；R10/R11仍需處理時區與成本 |

## 7. 處理次序與批量維護規格

1. **先恢復服務相容性。** 以release SHA列出必要schema／RPC／seed；核對production ledger與catalog；隔離資料庫演練、確認備份及恢復方案；再由現有發布權限執行經驗證的migration／rollback。保留供應商event，補好後重放及對帳。
2. **再驗證完整旅程。** 需知→領養提交→後台收件；助養有／無proof→確認→職員審核；義工身份→場次→預約；付款sandbox成功／拒付／退款→收條。空狀態及查詢成功不代表提交成功。
3. **修正會丟資料或改錯狀態的UI。** R03/R05/R06優先於更多新CMS欄位；統一dirty guard、最新版本同步及原子排序。
4. **完善批量工作。** 維持上次建議的「選範圍→差異預覽→執行結果」；相片修復、收條與匯出用背景任務。明示本頁／全部符合條件數量、成功／略過／衝突／失敗；只重試失敗項。維持每筆權限、版本、容量與稽核，不把一堆獨立POST包裝成看似原子的bulk。
5. **最後以同條件量測效能。** 先DB region與序列請求，再完整集合讀取及版本歷史，最後字型／圖片／PDF。每次提供baseline、同資料after及錯誤率，不用不受控網絡測試百分比宣稱改善。

建議後台增加「服務準備」狀態卡：部署版本、schema相容性、最後成功背景任務、pending圖片、收條失敗、場次覆蓋率。錯誤顯示未知／不可用，不能當作0；卡片只顯示必要狀態，不顯示key或私人payload。

## 8. 測試方法及交付限制

隔離探針直接讀固定source並移除imports後轉譯，React 19.2.5／Zod 3.25.76與repo lock一致；外部網絡、Query層及身份等依賴以假資料替代。這不是完整應用E2E或登入後瀏覽器測試。它重現：CMS卸載丟草稿、屋苑舊state、新增重用ID、null token schema拒絕、歷史1000行截斷，以及日期時區差異。PDF探針用真實repo字型及生成函式，只把字型fetch改成本機讀取；兩次PDF大小及時間存入JSON。

此回合沒有登入HKSCDA admin、寄信、建真實申請、付款、退款、操作cron、執行migration或修改應用程式。只讀了metadata/catalog；沒有讀申請人／支持者個資。完整Bun測試本機未跑；遠端CI結果已核對。本次手機實機／完整accessibility／生產負載測試仍未完成。故事頁本次重讀未完成，因此僅保留其舊項目未關閉，不把讀取逾時當成新的網站故障。

本報告內新問題並非全部由這兩個PR引入；每項都有標明。公開事故、source＋DB依賴、隔離重現及條件風險分開處理。

## 9. 證據包內容

- 新領養頁錯誤截圖與DOM，義工／助養／捐款DOM。
- GitHub PR release gate、最新CI結果、Vercel部署摘要及領養錯誤logs。
- 唯讀catalog查詢原文及結果，缺少的表／RPC／欄位清單。
- 程式碼diff摘要、23個migration檔案清單、固定source摘錄及SHA256。
- 6項隔離探針、PDF探針、輸出JSON及可重現的依賴lockfile。

參考：[PR #130](https://github.com/YNWAforever/hkscda/pull/130)、[PR #132](https://github.com/YNWAforever/hkscda/pull/132)、[commit差異](https://github.com/YNWAforever/hkscda/compare/b77e4cde6c90d52d2f9ceeb48c8857d264d34694...aa280ed59e1496767e2579c91501ea6330fd62ae)。單次Turnstile語義核對 [Cloudflare官方文件](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)；此項假設已排除，不列作缺陷。
