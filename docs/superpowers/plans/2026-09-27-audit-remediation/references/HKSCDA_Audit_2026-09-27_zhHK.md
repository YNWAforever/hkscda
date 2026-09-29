# HKSCDA 網站、Onboarding、付款及後台審核

審核日期：2026-09-27（香港時間）  
目標：https://hkscda.vercel.app/  
程式庫：YNWAforever/hkscda（private，經已連接 GitHub 讀取）  
固定程式碼版本：`b77e4cde6c90d52d2f9ceeb48c8857d264d34694`；合併 PR #131，2026-09-26 23:50 HKT。

## 1. 管理層結論

目前已有相當完整的領養、義工政策、助養、財務及 CMS 基礎，但「功能存在」與「公眾能完成服務」仍有落差。最優先不是再增加更多頁面，而是把付款啟用、內容真實性、可預約場次及各種通知的狀態接通。

本次最重要的五項是：**捐款入口停用、付款 API 與前台審批沒有同步、付款資訊在電郵／API 另有寫死來源、正式站仍有示範故事及活動、義工沒有已發佈場次。** 另已重現助養「稍後付款」選項反而展開付款證明的操作錯誤。

這是一份唯讀審核與改善方案，沒有修改程式碼、資料庫、正式內容、設定或付款。沒有建立正式申請、寄通知或扣款。沒有憑空打 UX 分數或宣稱通過完整安全認證。

## 2. 證據範圍及限制

| 範圍 | 實際完成 | 不能據此宣稱 |
|---|---|---|
| 程式碼 | 複製並固定 main SHA；讀 AGENTS.md、關鍵公開表單、付款／身份／後台／批量服務及相關 SQL、測試與歷史證據 | 不是每行程式的形式驗證，也未讀正式 DB |
| 網站 | 首頁、捐款、義工、團體查詢、助養列表及表格、領養需知及申請前兩步、故事、年報、FAQ；桌面 DOM＋部分截圖 | 未完成真實提交或完整手機實測 |
| 後台 | /admin 重導至登入畫面；靜態審核管理介面及 API | 沒有登入後視覺驗收、角色 E2E、真實匯出或批量執行 |
| 付款 | 停用狀態、前後端程式路徑及供應商接點審核 | 沒有付款、退款、實際 webhook／收條寄送驗收 |
| 效能 | 8 個公開 URL 各三次 HTTP GET，最多同時兩條；另有靜態對照 | 不等同香港用戶速度、瀏覽器 LCP/INP/CLS 或正式負載測試 |
| CI | 讀取固定 SHA 的 Actions 狀態 | 本機缺 Bun／依賴，沒有執行 build／test；CI 原因未能取得 |

審核期間 repository 有其他 CI run，故所有程式碼結論只綁定上述 SHA。沒有驗證 Vercel 正式部署 SHA 與此完全一致，現場觀察與程式碼推論分開標示。舊 9 月 14 日審核只作比較線索，是否已修正以本次 source 為準。

優先級：P1 = 影響服務、付款一致性、信任或發布保障，應先解決；P2 = 明確操作問題或擴展性／設定風險，接着處理。風險及改善建議不等同已觀察正式事故。

## 3. 各條旅程現況

| 旅程 | 已確認可用的部分 | 主要斷點／待驗收 |
|---|---|---|
| 義工 | 公開中心、電郵驗證入口、場次搜尋及空狀態；源碼有 OTP、會員身份、資格、候補及政策檢查 | 零已發佈場次；未實測驗證電郵、核實身份及預約完成 |
| 支持者 | donor／volunteer／sponsor 共用身份解析、後台 supporter detail 及通訊意向 | 公眾各身份仍分散；找回紀錄、收條及偏好缺統一入口 |
| 領養 | 動物→候選清單→排序→七步表格，已看到自動草稿及第二步 | 長表格準備指引、草稿到期／清除、相片續填；真實提交及後續配對未測 |
| 助養 | 115 隻列表、偏好清單、每月承諾、付款證明及狀態模型 | 首頁 5/16 缺相片、付款選項反向、不可閱讀條款、金額／分配／續期說明不足 |
| 捐款 | 公眾停用說明；程式含 Stripe card、PayPal、COD AlipayHK、FPS、PayMe | 正式未啟用；server gate、付款資料來源、回調與對帳須先驗收 |
| 後台 | 六大功能分組、角色守衛、分頁、發佈預覽、義工批量及稽核設計 | 需登入實測；匯出提示、表單同步、搜尋一致性及批量易用性改善 |

## 4. 問題及驗收清單

| ID | 優先 | 證據類型 | 問題 |
|---|---|---|---|
| PAY-01 | P1 | 現場確認／營運 | 捐款主入口尚未啟用 |
| PAY-02 | P1 | 程式碼確認／未在正式站 POST | 付款啟用及付款方式審批沒有在建立捐款 API 同步執行 |
| PAY-03 | P1 | 程式碼確認 | 助養電郵及手動捐款仍採用寫死的付款資料 |
| CONTENT-01 | P1 | 現場確認 | 首頁、故事庫及推廣區仍公開示範內容 |
| VOL-01 | P1 | 現場確認／營運 | 義工場次為空，登記後的下一步沒有可預約服務 |
| SPON-01 | P2 | 現場＋程式碼確認 | 「稍後付款」checkbox 與實際動作相反 |
| SPON-02 | P2 | 現場＋程式碼確認 | 必須同意助養條款，但表格沒有可閱讀的條款連結 |
| SPON-03 | P2 | 體驗／功能缺口 | 每月金額、動物偏好與實際付款關係不清楚 |
| SPON-04 | P2 | 程式碼確認 | 助養草稿只在提交時儲存，錯誤回饋亦過於籠統 |
| CONTENT-02 | P2 | 現場確認 | 助養首頁相片缺漏及卡片資訊不貼合助養決策 |
| VOL-02 | P2 | 現場＋程式碼確認 | 義工頁內容貼左，與全站容器不一致 |
| ADOPT-01 | P2 | 程式碼確認 | 包含住址及家庭資料的本機草稿沒有到期／清除入口 |
| ADOPT-02 | P2 | 體驗改善 | 七步申請仍需要更好的填寫準備與進度回復 |
| CRM-01 | P2 | 產品缺口 | 支持者身份已集中，但公眾自助服務仍分散 |
| ADMIN-01 | P2 | 程式碼確認 | CRM 匯出失敗沒有可見錯誤或進度 |
| ADMIN-02 | P2 | 程式碼風險 | 支持者編輯視窗只在初次 mount 初始化欄位 |
| ADMIN-03 | P2 | 程式碼確認 | 多個後台列表每次輸入直接改查詢，狀態未一致保存 |
| ADMIN-04 | P2 | 可用性改善 | 義工批量功能已存在，但操作介面仍偏技術化 |
| PERF-01 | P2 | 程式碼確認 | 公眾動物分頁仍先讀取完整合資格集合 |
| PAY-04 | P2 | 程式碼確認 | 付款設定讀取失敗與沒有已發佈方式無法區分 |
| PAY-05 | P2 | 程式碼確認 | COD 付款已成功但收條／通知恢復失敗時被回報為 pending |
| OPS-01 | P1 | GitHub 狀態確認／原因未明 | 本次固定 commit 的 CI 未通過 |
| SEC-01 | P2 | 條件式設定風險 | 兩組防濫用設定完全缺少時仍 fail open |

### PAY-01 · P1 · 捐款主入口尚未啟用

**證據（現場確認／營運）**：捐款頁顯示「網上捐款尚未完成正式啟用審批」，金額、資料、付款及提交全部停用。donate.tsx:234–235 使用 VITE_PUBLIC_DONATION_CHECKOUT_ENABLED 編譯時旗標；顯示方式另由已發佈 payment_public_config 控制。

**影響**：首頁、頁首、故事及浮動提示仍引導使用者「立即捐助」，但到達後無法完成捐款。這是已觀察到的服務不可用狀態，未證明支付供應商故障。

**修正**：保留審批控制；未啟用時以精簡聯絡／經核實替代安排頁面取代整版停用表格，入口文案同步。後台增加啟用準備清單：供應商環境、審批版本、webhook、回跳、對帳、收條及通知；完成後才啟用。

**驗收**：未啟用時所有入口描述一致；啟用前以 sandbox 完成支付成功、取消、延遲回調、重送及收條測試。

程式碼：[src/routes/donate.tsx](https://github.com/YNWAforever/hkscda/blob/b77e4cde6c90d52d2f9ceeb48c8857d264d34694/src/routes/donate.tsx)；[src/lib/paymentPublicConfig/public.server.ts](https://github.com/YNWAforever/hkscda/blob/b77e4cde6c90d52d2f9ceeb48c8857d264d34694/src/lib/paymentPublicConfig/public.server.ts)

### PAY-02 · P1 · 付款啟用及付款方式審批沒有在建立捐款 API 同步執行

**證據（程式碼確認／未在正式站 POST）**：api/donations.ts:26–52 經限流、Turnstile 後直接呼叫 createDonation。service.ts:174 起解析請求、建立身份／捐款／付款；沒有檢查前台啟用旗標或該方式的 published + visible 狀態。method 只受 enum 驗證。

**影響**：停用前台不能等同停用交易入口；直接有效請求仍可能建立紀錄、取得手動付款指示，或在供應商有設定時建立 checkout。沒有實際繞過測試或扣款。

**修正**：建立 server-only 付款啟用政策，建立任何身份／捐款／供應商請求前驗證全局狀態及方式審批版本。前台讀取同一安全投影。停用只限制新 checkout，不應阻止既有付款 webhook 對帳及收條補發。

**驗收**：以隔離環境測試全局關閉、方式未公開／已封存、審批在請求期間變更；全部拒絕且零新交易／供應商呼叫。既有交易仍可完成 reconciliation。

程式碼：[src/routes/api/donations.ts](https://github.com/YNWAforever/hkscda/blob/b77e4cde6c90d52d2f9ceeb48c8857d264d34694/src/routes/api/donations.ts)；[src/lib/donations/service.ts](https://github.com/YNWAforever/hkscda/blob/b77e4cde6c90d52d2f9ceeb48c8857d264d34694/src/lib/donations/service.ts)；[src/lib/donations/domain.ts](https://github.com/YNWAforever/hkscda/blob/b77e4cde6c90d52d2f9ceeb48c8857d264d34694/src/lib/donations/domain.ts)

### PAY-03 · P1 · 助養電郵及手動捐款仍採用寫死的付款資料

**證據（程式碼確認）**：sponsorship/emailTemplates.server.ts:49–63 定義固定 FPS、銀行、PayMe、PayPal 短網址及 Give.asia 資料；pending_payment 電郵要求按該資料完成首月付款。submission.server.ts:422–477 會使用此模板。donations/service.ts:261–279 亦直接回傳固定手動付款指示。公眾助養列表及狀態頁則要求等職員核實安排。

**影響**：網站、CMS、API、電郵的付款資訊有多個來源，改了 CMS 未必改到電郵；亦可能在尚未啟用時寄出付款指示。未核實硬編碼帳戶是否仍有效，不能斷言它們錯誤。

**修正**：統一由已審批、用途適用的付款設定生成網頁、API 回應及電郵，記錄使用的 config version。沒有有效設定時只寄核實安排及參考編號，不能回退到寫死帳戶。

**驗收**：更改／撤回某付款設定後，所有新頁面、API 回應及電郵保持一致；歷史交易保存當時快照；禁止測試資料進入正式通知。

程式碼：[src/lib/sponsorship/emailTemplates.server.ts](https://github.com/YNWAforever/hkscda/blob/b77e4cde6c90d52d2f9ceeb48c8857d264d34694/src/lib/sponsorship/emailTemplates.server.ts)；[src/lib/sponsorship/submission.server.ts](https://github.com/YNWAforever/hkscda/blob/b77e4cde6c90d52d2f9ceeb48c8857d264d34694/src/lib/sponsorship/submission.server.ts)；[src/lib/donations/service.ts](https://github.com/YNWAforever/hkscda/blob/b77e4cde6c90d52d2f9ceeb48c8857d264d34694/src/lib/donations/service.ts)；[src/components/site/sponsorship/PledgeStatusPage.tsx](https://github.com/YNWAforever/hkscda/blob/b77e4cde6c90d52d2f9ceeb48c8857d264d34694/src/components/site/sponsorship/PledgeStatusPage.tsx)

### CONTENT-01 · P1 · 首頁、故事庫及推廣區仍公開示範內容

**證據（現場確認）**：首頁推薦「【示範】豆豆新生活更新」；/stories 顯示四篇 demo 故事、四個對應地圖項目，以及「夏日領養日／七月慈善市集／六月救援報告」三項示範推廣。featured reader 只驗證 published、rescue_story、isFeatured，沒有以真實案例來源作資格條件。

**影響**：捐款與領養信任頁混入測試素材；九月仍以「本月」描述七月市集。這不是指真實救援紀錄為假，而是正式站明確展示了標示示範的內容。

**修正**：先按明確 demo ID 列出待下架清單並保留紀錄；由內容負責人補上獲批准的真實案例。CMS 加 demo／production 類別、來源、負責人及有效期，所有首頁、故事、地圖、推廣共用發佈條件。

**驗收**：公開各入口不再含 demo 項；真實舊文章仍保留；過期活動顯示已結束；首頁精選不可繞過內容資格。

程式碼：[src/lib/content/publicStoriesPage.server.ts](https://github.com/YNWAforever/hkscda/blob/b77e4cde6c90d52d2f9ceeb48c8857d264d34694/src/lib/content/publicStoriesPage.server.ts)；[supabase/migrations/20260925040818_featured_public_story_filter.sql](https://github.com/YNWAforever/hkscda/blob/b77e4cde6c90d52d2f9ceeb48c8857d264d34694/supabase/migrations/20260925040818_featured_public_story_filter.sql)

### VOL-01 · P1 · 義工場次為空，登記後的下一步沒有可預約服務

**證據（現場確認／營運）**：/volunteer 載入後顯示「目前未有已發布的核實義工場次」，有重新查看按鈕；並非把載入中誤當失敗。仍可進入電郵驗證入口。

**影響**：首次義工可投入時間登記但看不到可預約日期；目前無法驗證實際滿額、候補及取消流程。原因可能是沒有發佈、沒有適用政策或營運尚未安排，本次未讀正式資料庫，不能確定。

**修正**：後台顯示未來 14／30 天覆蓋率及未能發佈原因；用現有批量產生活動流程補足已批准場次。公眾空狀態提供具體開放安排及自願訂閱開放通知。

**驗收**：先在測試環境建立批准政策及場次，匿名可看到安全摘要；新義工／資深義工／團體按規則預約；正式發佈後抽查日期。

程式碼：[src/components/site/volunteer/VolunteerSessionBrowser.tsx](https://github.com/YNWAforever/hkscda/blob/b77e4cde6c90d52d2f9ceeb48c8857d264d34694/src/components/site/volunteer/VolunteerSessionBrowser.tsx)；[src/components/admin/volunteers/VolunteerActivityWorkspace.tsx](https://github.com/YNWAforever/hkscda/blob/b77e4cde6c90d52d2f9ceeb48c8857d264d34694/src/components/admin/volunteers/VolunteerActivityWorkspace.tsx)

### SPON-01 · P2 · 「稍後付款」checkbox 與實際動作相反

**證據（現場＋程式碼確認）**：預設未勾選時標籤是「我將稍後透過電郵中的付款方式完成付款」；勾選後 includeProof=true，標籤變成付款證明並展開金額、日期、檔案欄位。瀏覽器操作後已確認展開狀態。

**影響**：使用者以為選擇稍後付款，實際進入已付款上載；付款方式理解錯誤，增加放棄及職員解釋成本。

**修正**：改成穩定的兩選項：稍後按核實安排付款／已付款，上載證明。狀態切換不改變選項本身的意思。

**驗收**：選稍後付款不顯示證明欄；選已付款才顯示；鍵盤、讀屏及中英文意義一致。

程式碼：[src/components/site/sponsorship/PledgeWizard.tsx](https://github.com/YNWAforever/hkscda/blob/b77e4cde6c90d52d2f9ceeb48c8857d264d34694/src/components/site/sponsorship/PledgeWizard.tsx)

### SPON-02 · P2 · 必須同意助養條款，但表格沒有可閱讀的條款連結

**證據（現場＋程式碼確認）**：PledgeWizard.tsx:515–527 只有必填 checkbox 及「我同意條款及細則」文字，沒有條款正文或連結。schema 預設條款版本 sponsorship-terms-2026-07。

**影響**：支持者不能在作出承諾前知道金額如何分配、取消、更換動物或資料使用安排。這是知情及內容完整性問題，本報告不作法律合規結論。

**修正**：加入可閱讀的已發佈條款、版本日期、簡要要點，提交所見版本；版本更新後要求重看。

**驗收**：無登入亦可閱讀條款；提交記錄與使用者當時看到的版本一致；鍵盤可開啟及返回表格。

程式碼：[src/components/site/sponsorship/PledgeWizard.tsx](https://github.com/YNWAforever/hkscda/blob/b77e4cde6c90d52d2f9ceeb48c8857d264d34694/src/components/site/sponsorship/PledgeWizard.tsx)；[src/lib/sponsorship/schemas.ts](https://github.com/YNWAforever/hkscda/blob/b77e4cde6c90d52d2f9ceeb48c8857d264d34694/src/lib/sponsorship/schemas.ts)

### SPON-03 · P2 · 每月金額、動物偏好與實際付款關係不清楚

**證據（體驗／功能缺口）**：表格顯示一個 HK$300/month 及所選動物列表；schema 容許最多十隻偏好，但只有一個 amount_cents。確認電郵描述首月付款；狀態頁提供 pending／active 等狀態。沒有在該表格解釋每隻或整份承諾、排序是否保證配對，以及是否自動扣款。

**影響**：使用者可能把承諾理解成已完成訂閱或每隻動物各扣該金額；職員需手動澄清。現有流程不應宣稱已建立自動月扣。

**修正**：確認摘要明示總額、分配方法、偏好與正式配對、首次付款及續期安排、是否自動扣款、修改／停止方式。未建 recurring provider agreement 前標示手動每月支持。

**驗收**：選一隻與多隻時總額／分配皆明確；狀態區分承諾、已收證明、已收款、已配對與下次到期。

程式碼：[src/components/site/sponsorship/PledgeWizard.tsx](https://github.com/YNWAforever/hkscda/blob/b77e4cde6c90d52d2f9ceeb48c8857d264d34694/src/components/site/sponsorship/PledgeWizard.tsx)；[src/lib/sponsorship/schemas.ts](https://github.com/YNWAforever/hkscda/blob/b77e4cde6c90d52d2f9ceeb48c8857d264d34694/src/lib/sponsorship/schemas.ts)；[src/components/site/sponsorship/PledgeStatusPage.tsx](https://github.com/YNWAforever/hkscda/blob/b77e4cde6c90d52d2f9ceeb48c8857d264d34694/src/components/site/sponsorship/PledgeStatusPage.tsx)

### SPON-04 · P2 · 助養草稿只在提交時儲存，錯誤回饋亦過於籠統

**證據（程式碼確認）**：PledgeWizard.tsx:139–158 的 saveDraft 只由 handleSubmit 呼叫，沒有輸入自動保存或明確儲存按鈕；重整前未提交的資料會丟失。response !ok 一律轉成通用 submitError。已付款分支的金額／日期／檔案沒有完整的 conditional required，欄位 aria-invalid 固定 false。

**影響**：與領養自動保存體驗不一致；填到一半重整失去內容，資料錯誤時不知道改哪項。

**修正**：加入可控自動保存／離開提示及清除草稿，條件驗證檔案、日期、金額，在頁首及欄位顯示原因，保留既有重試冪等設計。

**驗收**：未提交前重整可恢復合適欄位；檔案不能恢復時明示；400、檔案過大及網絡失敗可理解並可重試。

程式碼：[src/components/site/sponsorship/PledgeWizard.tsx](https://github.com/YNWAforever/hkscda/blob/b77e4cde6c90d52d2f9ceeb48c8857d264d34694/src/components/site/sponsorship/PledgeWizard.tsx)；[src/components/site/sponsorship/pledgeProofUpload.ts](https://github.com/YNWAforever/hkscda/blob/b77e4cde6c90d52d2f9ceeb48c8857d264d34694/src/components/site/sponsorship/pledgeProofUpload.ts)

### CONTENT-02 · P2 · 助養首頁相片缺漏及卡片資訊不貼合助養決策

**證據（現場確認）**：當次 /sponsors 第一頁 16 張卡片中，5 張顯示「暫未有相片」，首三張均缺相片。助養卡仍強調領養經驗、性別及絕育，頁面只提供年齡篩選。

**影響**：難以認識動物及理解長期照顧需要；支持者不能快速按貓狗、名字／編號或照護需要找到對象。

**修正**：運用現有 missingPhoto 後台篩選補圖；建立缺資料工作隊列。助養卡增加經核實的照顧需要、支持用途及近況；加物種、搜尋及有相片篩選，不虛構醫療或資金目標。

**驗收**：首屏皆為已核實相片或清楚解釋的缺圖狀態；按編號能找到指定動物；數量與分頁一致。

程式碼：[src/routes/sponsors.tsx](https://github.com/YNWAforever/hkscda/blob/b77e4cde6c90d52d2f9ceeb48c8857d264d34694/src/routes/sponsors.tsx)；[src/routes/admin/index.tsx](https://github.com/YNWAforever/hkscda/blob/b77e4cde6c90d52d2f9ceeb48c8857d264d34694/src/routes/admin/index.tsx)；[src/lib/animals/publicListing.functions.ts](https://github.com/YNWAforever/hkscda/blob/b77e4cde6c90d52d2f9ceeb48c8857d264d34694/src/lib/animals/publicListing.functions.ts)

### VOL-02 · P2 · 義工頁內容貼左，與全站容器不一致

**證據（現場＋程式碼確認）**：1363×936 桌面瀏覽器量到 h1 left=0；截圖可見標題及按鈕貼左。volunteer.tsx:90、111 使用 section-container，但 src CSS 未找到該類別定義；現有 styles.css 定義 container-wide。

**影響**：版面缺乏一致邊距，標題及內容視覺擠邊；流動裝置仍須另行實測，不能由桌面結果推算。

**修正**：套用已存在 public-container／container-wide 設計容器，統一義工首屏、服務說明及中心的寬度及留白。

**驗收**：在 390、768、1366 px 檢查側距、無水平溢出，快捷按鈕與章節標題對齊。

程式碼：[src/routes/volunteer.tsx](https://github.com/YNWAforever/hkscda/blob/b77e4cde6c90d52d2f9ceeb48c8857d264d34694/src/routes/volunteer.tsx)；[src/styles.css](https://github.com/YNWAforever/hkscda/blob/b77e4cde6c90d52d2f9ceeb48c8857d264d34694/src/styles.css)；[src/components/site/PublicFormFrame.tsx](https://github.com/YNWAforever/hkscda/blob/b77e4cde6c90d52d2f9ceeb48c8857d264d34694/src/components/site/PublicFormFrame.tsx)

### ADOPT-01 · P2 · 包含住址及家庭資料的本機草稿沒有到期／清除入口

**證據（程式碼確認）**：ApplicationWizard.tsx 將 getValues() 透過 localStorage 保存；draft.ts 只剔除 File/photos，沒有 TTL。成功提交才 removeItem；畫面已告知本機儲存，但未見清除草稿控制。助養亦使用相同 serializer。

**影響**：共用電腦或家庭裝置可長期留下未提交的聯絡及家庭資訊；照片不保存是已有的保護。沒有發現資料外傳證據。

**修正**：提供是否在此裝置保存、清除／開始新申請、過期清理與恢復前確認；只保存必要欄位。需要跨裝置恢復時採身份驗證及有期限的伺服器草稿。

**驗收**：過期草稿不自動回填；清除後 storage 無相關資料；照片永不存 localStorage；阻擋 storage 時申請仍可進行。

程式碼：[src/components/site/adoption/ApplicationWizard.tsx](https://github.com/YNWAforever/hkscda/blob/b77e4cde6c90d52d2f9ceeb48c8857d264d34694/src/components/site/adoption/ApplicationWizard.tsx)；[src/lib/publicAdoption/draft.ts](https://github.com/YNWAforever/hkscda/blob/b77e4cde6c90d52d2f9ceeb48c8857d264d34694/src/lib/publicAdoption/draft.ts)；[src/lib/sponsorship/draft.ts](https://github.com/YNWAforever/hkscda/blob/b77e4cde6c90d52d2f9ceeb48c8857d264d34694/src/lib/sponsorship/draft.ts)

### ADOPT-02 · P2 · 七步申請仍需要更好的填寫準備與進度回復

**證據（體驗改善）**：已實測候選清單→申請第 1 步→第 2 步；流程有七步、排序、草稿保存及逐步驗證。聯絡步同時要求姓名、電話、電郵、家庭人數及住址；中英文字大量同時呈現。完整相片及提交未執行。

**影響**：使用者在了解資料要求之前已開始長表格；草稿不包含檔案，跨裝置續填及完成預期不夠明確。

**修正**：申請前加所需資料／相片清單、合理時間估計（先用真實測試訂立）、步驟完成狀態及安全返回修改；選定語言後以單一主語言呈現。不要為減少步數而移除必要動物福利評估。

**驗收**：空欄按下一步會定位首個錯誤；返回不丟資料；恢復草稿後提示需重新選相片；完成提交前清楚顯示偏好、費用及下一步。

程式碼：[src/components/site/adoption/ApplicationWizard.tsx](https://github.com/YNWAforever/hkscda/blob/b77e4cde6c90d52d2f9ceeb48c8857d264d34694/src/components/site/adoption/ApplicationWizard.tsx)；[src/components/site/adoption/WizardFields.tsx](https://github.com/YNWAforever/hkscda/blob/b77e4cde6c90d52d2f9ceeb48c8857d264d34694/src/components/site/adoption/WizardFields.tsx)；[src/routes/adoption/instructions.tsx](https://github.com/YNWAforever/hkscda/blob/b77e4cde6c90d52d2f9ceeb48c8857d264d34694/src/routes/adoption/instructions.tsx)

### CRM-01 · P2 · 支持者身份已集中，但公眾自助服務仍分散

**證據（產品缺口）**：publicIdentity.server.ts 以 RPC 統一身份；後台有 supporters。公眾義工使用驗證電郵中心，領養及助養用獨立 status token；檢查的路由沒有統一支持者帳戶／收條中心。

**影響**：同一人同時是義工、捐款人及助養人，仍須分別保存連結及向職員查詢；不能把後台 supporter row 當作已完成公眾 onboarding。

**修正**：先建「找回我的申請／助養／收條」入口，再逐步提供驗證電郵後的支持者中心。使用 verified identity linking，不可只憑輸入相同 email 就公開歷史資料；通訊偏好與交易通知分開。

**驗收**：新支持者、既有支持者、多重身份、失效連結及不匹配 email 均有明確下一步，且不洩露別人的紀錄。

程式碼：[src/lib/supporters/publicIdentity.server.ts](https://github.com/YNWAforever/hkscda/blob/b77e4cde6c90d52d2f9ceeb48c8857d264d34694/src/lib/supporters/publicIdentity.server.ts)；[src/components/site/volunteer/VerifiedEmailSignIn.tsx](https://github.com/YNWAforever/hkscda/blob/b77e4cde6c90d52d2f9ceeb48c8857d264d34694/src/components/site/volunteer/VerifiedEmailSignIn.tsx)；[src/components/site/sponsorship/PledgeStatusPage.tsx](https://github.com/YNWAforever/hkscda/blob/b77e4cde6c90d52d2f9ceeb48c8857d264d34694/src/components/site/sponsorship/PledgeStatusPage.tsx)

### ADMIN-01 · P2 · CRM 匯出失敗沒有可見錯誤或進度

**證據（程式碼確認）**：ExportBar.tsx:12–18 在 response !ok 時 throw；:44、53 的 onClick 直接回傳 Promise，沒有 catch/error state 或 busy state。readModel.server.ts:14–23 在超過 5,000 筆時回傳 413 及可操作的縮小篩選訊息，但 UI 會丟失這個原因。

**影響**：職員點匯出後看似無反應，可能重複點擊；合理的匯出上限被誤認為系統故障。

**修正**：顯示匯出中、阻止重複點擊、解析 413／401／403／500，提供保留篩選的重試；大額匯出另用背景工作，不移除安全上限。

**驗收**：5,001 筆回傳清楚提示與下一步，零不完整 CSV；網絡失敗可重試；成功下載的篩選與畫面一致。

程式碼：[src/components/admin/crm/ExportBar.tsx](https://github.com/YNWAforever/hkscda/blob/b77e4cde6c90d52d2f9ceeb48c8857d264d34694/src/components/admin/crm/ExportBar.tsx)；[src/lib/crm/readModel.server.ts](https://github.com/YNWAforever/hkscda/blob/b77e4cde6c90d52d2f9ceeb48c8857d264d34694/src/lib/crm/readModel.server.ts)

### ADMIN-02 · P2 · 支持者編輯視窗只在初次 mount 初始化欄位

**證據（程式碼風險）**：SupporterFormDialog.tsx:35–42 以 existing 初始化 useState；onOpenChange 只改 open 及清 mutation，沒有以最新 props 重設 edit 欄位，也沒有 dirty／discard 保護。

**影響**：同一元件仍掛載且資料重新整理後再打開，可能顯示舊值；取消後再開亦保留未提交欄位。是否造成正式紀錄覆寫需在登入測試中重現。

**修正**：開啟時從最新版本初始化，關閉 dirty 表單時確認捨棄；保存帶 expected version，處理他人同期修改。

**驗收**：取消 A→重新開啟應顯示伺服器值；背景更新 B 後重新開啟看到 B；舊版本保存回傳衝突，不能覆蓋。

程式碼：[src/components/admin/crm/SupporterFormDialog.tsx](https://github.com/YNWAforever/hkscda/blob/b77e4cde6c90d52d2f9ceeb48c8857d264d34694/src/components/admin/crm/SupporterFormDialog.tsx)

### ADMIN-03 · P2 · 多個後台列表每次輸入直接改查詢，狀態未一致保存

**證據（程式碼確認）**：SupporterList、PledgeReviewLane、CaseList、ContentManagement 的原始 query 直接進 query key；queryFn 沒有接收 AbortSignal，也未提供 keepPreviousData。VolunteerActivityWorkspace 亦以完整 filter 即時查詢。財務 PaymentsReconcile 已有 keepPreviousData，可作參考。

**影響**：快速輸入及中文 IME 容易產生中間搜尋請求及清空舊行的視覺跳動；部分列表離開再返回丟失搜尋狀態。不是已量到每個按鍵必發一個請求。

**修正**：統一 250–300ms debounce／IME composition、AbortSignal、保留舊結果及 fetching 提示；頁碼、篩選、排序用 URL，選取在條件變動時明確失效。

**驗收**：五次快速輸入只查最後條件或有限合併請求；舊請求可取消；上一頁返回維持狀態；錯誤不顯示為空資料。

程式碼：[src/components/admin/crm/SupporterList.tsx](https://github.com/YNWAforever/hkscda/blob/b77e4cde6c90d52d2f9ceeb48c8857d264d34694/src/components/admin/crm/SupporterList.tsx)；[src/components/admin/sponsorship/PledgeReviewLane.tsx](https://github.com/YNWAforever/hkscda/blob/b77e4cde6c90d52d2f9ceeb48c8857d264d34694/src/components/admin/sponsorship/PledgeReviewLane.tsx)；[src/components/admin/adoptions/CaseList.tsx](https://github.com/YNWAforever/hkscda/blob/b77e4cde6c90d52d2f9ceeb48c8857d264d34694/src/components/admin/adoptions/CaseList.tsx)；[src/components/admin/content/ContentManagement.tsx](https://github.com/YNWAforever/hkscda/blob/b77e4cde6c90d52d2f9ceeb48c8857d264d34694/src/components/admin/content/ContentManagement.tsx)；[src/components/admin/volunteers/VolunteerActivityWorkspace.tsx](https://github.com/YNWAforever/hkscda/blob/b77e4cde6c90d52d2f9ceeb48c8857d264d34694/src/components/admin/volunteers/VolunteerActivityWorkspace.tsx)

### ADMIN-04 · P2 · 義工批量功能已存在，但操作介面仍偏技術化

**證據（可用性改善）**：VolunteerActivityWorkspace 已有 generate/copy/edit/rebind/close/cancel/attendance、跨頁快照選取、預覽及每組 apply。結果直接展示 operation UUID、policy UUID、template_key、分組交易語句，並逐組勾選執行。

**影響**：日常排一個月班次仍需理解大量技術識別及重複確認；真正衝突原因不容易一眼辨認。不能再說本系統沒有批量功能。

**修正**：在既有安全執行器上加三步流程：選範圍→預覽差異及例外→確認執行。預設顯示職員看得懂的政策名稱、日期、容量、受影響人數；技術 ID 收到詳細資料。低風險無衝突組提供一次審閱後排程執行，高風險取消／容量／政策變動維持明確審核。

**驗收**：30 天排班可在同一工作區完成；跨頁選取總數、快照時間、部分失敗、重試及通知狀態皆明確；不降低原有名額與衝突檢查。

程式碼：[src/components/admin/volunteers/VolunteerActivityWorkspace.tsx](https://github.com/YNWAforever/hkscda/blob/b77e4cde6c90d52d2f9ceeb48c8857d264d34694/src/components/admin/volunteers/VolunteerActivityWorkspace.tsx)；[src/lib/volunteers/bulk/service.ts](https://github.com/YNWAforever/hkscda/blob/b77e4cde6c90d52d2f9ceeb48c8857d264d34694/src/lib/volunteers/bulk/service.ts)

### PERF-01 · P2 · 公眾動物分頁仍先讀取完整合資格集合

**證據（程式碼確認）**：publicListing.server.ts:8–40 以 1,000 筆為批次讀完整合資格動物；publicListing.functions.ts 再交 buildPublicAnimalListing 篩選、排序及 slice。這已避免以前 1,000 行截斷，但每次查詢 DB 工作量仍隨全集增長。

**影響**：畫面每頁 16 筆不等於資料庫只處理 16 筆；瀏覽頁碼、年齡及搜尋可能重複讀完整資料。這是擴展性風險，不是已證明正式資料量大或 DB 已慢。

**修正**：先記錄 RPC／SQL duration、讀取筆數及 payload；把可索引條件、穩定排序、count／游標移到 DB；年齡由自由文字逐步正規化。避免為未量度瓶頸盲目加 index。

**驗收**：1k/10k 合成資料驗證完整結果及穩定分頁；每頁回應不含無關詳細資料；同樣條件比較 p50/p95、查詢計畫及 bytes。

程式碼：[src/lib/animals/publicListing.server.ts](https://github.com/YNWAforever/hkscda/blob/b77e4cde6c90d52d2f9ceeb48c8857d264d34694/src/lib/animals/publicListing.server.ts)；[src/lib/animals/publicListing.functions.ts](https://github.com/YNWAforever/hkscda/blob/b77e4cde6c90d52d2f9ceeb48c8857d264d34694/src/lib/animals/publicListing.functions.ts)；[src/lib/animals/publicListing.ts](https://github.com/YNWAforever/hkscda/blob/b77e4cde6c90d52d2f9ceeb48c8857d264d34694/src/lib/animals/publicListing.ts)

### PAY-04 · P2 · 付款設定讀取失敗與沒有已發佈方式無法區分

**證據（程式碼確認）**：paymentPublicConfig/public.server.ts:24–27 在資料庫 error 時 log 後 return []；零有效方式亦回傳 []。

**影響**：後台／維運難以分辨正常未啟用與讀取故障；若只按畫面診斷，會把系統問題當成審批未完成。

**修正**：保留 fail-closed，但回傳可區分 unavailable／not_configured／ready 的安全狀態；公眾提供重試或聯絡，內部告警不可含密鑰。

**驗收**：模擬 DB timeout 與真正零已發佈設定，UI及監控顯示不同原因；兩者皆不允許新付款。

程式碼：[src/lib/paymentPublicConfig/public.server.ts](https://github.com/YNWAforever/hkscda/blob/b77e4cde6c90d52d2f9ceeb48c8857d264d34694/src/lib/paymentPublicConfig/public.server.ts)；[src/routes/donate.tsx](https://github.com/YNWAforever/hkscda/blob/b77e4cde6c90d52d2f9ceeb48c8857d264d34694/src/routes/donate.tsx)

### PAY-05 · P2 · COD 付款已成功但收條／通知恢復失敗時被回報為 pending

**證據（程式碼確認）**：publicStatus.server.ts:40–43 在 refreshFailed 且本地 status=succeeded 時回傳 pending，註解目的是讓輪詢繼續重試後續工作。

**影響**：一個付款狀態兼任收條／通知工作狀態；捐款人可能看不到已確認付款，增加重複查詢和重付疑慮。未實測正式 COD 交易。

**修正**：分開 paymentStatus、receiptStatus、notificationStatus；已驗證成功保持成功，後續工作以 outbox／背景恢復及個別狀態呈現。

**驗收**：供應商確認成功後即使 PDF/email 故障仍顯示付款成功、收條處理中；重試只產生一份有效收條及一個交易。

程式碼：[src/lib/donations/publicStatus.server.ts](https://github.com/YNWAforever/hkscda/blob/b77e4cde6c90d52d2f9ceeb48c8857d264d34694/src/lib/donations/publicStatus.server.ts)；[src/lib/donations/reconcile.server.ts](https://github.com/YNWAforever/hkscda/blob/b77e4cde6c90d52d2f9ceeb48c8857d264d34694/src/lib/donations/reconcile.server.ts)

### OPS-01 · P1 · 本次固定 commit 的 CI 未通過

**證據（GitHub 狀態確認／原因未明）**：GitHub run 36253318554 對應 b77e4cde…，verify=failure，brand/performance/rls/a11y 四個 job 均 skipped。verify steps 為空；下載 job log 回傳 BlobNotFound 404。

**影響**：沒有這個版本的成功品質閘證據。可能是 runner／配額／設定或程式錯誤；不能由 failure 直接宣稱測試失敗或安全漏洞。

**修正**：先查 Actions run 的平台訊息，恢復能真正執行的 CI；對目標 release SHA 重跑 typecheck、test、lint、build、RLS、a11y 及關鍵流程，記錄 deploy SHA。

**驗收**：同一預定上線 SHA 全部必要閘完成，未跳過；保留每項結果及測試環境；失敗時不自動部署正式站。

程式碼：[.github/workflows/ci.yml](https://github.com/YNWAforever/hkscda/blob/b77e4cde6c90d52d2f9ceeb48c8857d264d34694/.github/workflows/ci.yml)；[AGENTS.md](https://github.com/YNWAforever/hkscda/blob/b77e4cde6c90d52d2f9ceeb48c8857d264d34694/AGENTS.md)

### SEC-01 · P2 · 兩組防濫用設定完全缺少時仍 fail open

**證據（條件式設定風險）**：turnstile.server.ts 在 secret 未設定時 return true；rate-limit.server.ts 在 Upstash 未設定時不啟用限制。啟動檢查阻止只設半組，但接受兩者皆空。

**影響**：正式環境若漏設整組，公開提交及登入保護可能不足。此次沒有讀正式環境機密或進行攻擊測試，不能宣稱目前正式站保護已失效。

**修正**：正式環境採明確安全模式及 readiness 驗證：要求啟用或由受控設定明確記錄例外，告警與速率監控；本機測試可保留注入方式。

**驗收**：production 配置缺少整組時 readiness 不通過或對提交 fail closed；dev test 保持可測；已有鍵但驗證失敗仍拒絕。

程式碼：[src/lib/security/turnstile.server.ts](https://github.com/YNWAforever/hkscda/blob/b77e4cde6c90d52d2f9ceeb48c8857d264d34694/src/lib/security/turnstile.server.ts)；[src/lib/security/rate-limit.server.ts](https://github.com/YNWAforever/hkscda/blob/b77e4cde6c90d52d2f9ceeb48c8857d264d34694/src/lib/security/rate-limit.server.ts)

## 5. 已改善的舊問題：保留，不重新開發

| 已確認在固定 source 存在 | 證據 | 本次判斷 |
|---|---|---|
| 動物後台伺服器分頁及缺圖篩選 | routes/admin/index.tsx:72–80；animals/adminList.repository.server.ts | 不再沿用「全下載、超過 1,000 丟失」的舊後台診斷；公眾讀取另見 PERF-01 |
| 動物編輯 dirty guard、等待草稿、真實內容預覽 | AnimalForm.tsx:62–75、84、353–379、413、819–888 | 舊的未儲存預覽／早期輸入被覆寫問題已有相應防護，待回歸確認 |
| 助養審核可鍵盤進入及回復焦點 | PledgeReviewLane.tsx:119–131、152–162、282 | 不再報只有 row click |
| 義工批量選取、預覽、分組交易、重試及恢復 | VolunteerActivityWorkspace；volunteers/bulk/service.ts；20260914160736 SQL | 應改善現有操作，不重造不受控批次 |
| 實習分頁／選取才讀詳情 | InternshipManagement.tsx:233–249、310 | 不再沿用單一 500 筆全量快照診斷 |
| 後台六大功能區及身份快取 | adminNav.ts；admin/identity.ts | 應增加任務導覽，不再堆一套平面導航 |
| 付款 request fingerprint、provider idempotency、COD uncertain recovery | donations/service.ts | 保留；不得以無限重試建立新付款 |
| 義工 authoritative booking、共用容量、條款與身份檢查 | 20260914160716_volunteer_member_booking_correctness.sql | 新 bulk／快取不可繞過交易鎖及最新政策檢查 |

這些是 source 上存在的改善，不代表已完成本次正式環境測試。

## 6. 讓職員更容易維護及批量處理

### 6.1 用「今天要處理甚麼」作後台入口

保留六大功能區，在各區首頁加入待辦視圖：待核實身份、待跟進申請、缺相片、未來 14 天無場次、付款待核實、收條失敗、內容待審、即將過期活動。每項顯示數量、最早等待時間、負責人及直接處理連結；資料讀取失敗須顯示未知而非 0。

首次使用按角色提供 3–5 項任務式引導：內容職員「補一隻動物相片→預覽→送審」；義工統籌「發布政策→排下一月→檢查缺額」；財務「核實付款→對帳→檢查收條」。提供清楚的 draft、已發布、承諾、已收款及已送達字義，不把技術 ID 作首要資訊。

### 6.2 批量操作矩陣

| 模組 | 建議批量行為 | 保護及結果 |
|---|---|---|
| 義工活動 | 按週模板排 4／8 週、例外日、同系列改說明、截止、取消、出席 | 重用現有 snapshot→preview→apply；容量／政策／團體／48 小時規則逐項驗證 |
| 義工身份 | 標籤、分派審核者、請補資料草稿 | 資格升級須足夠證據；寄出通知獨立確認；不批量跳過核實 |
| 領養申請 | 按階段／等待時間分派、建立跟進任務、待補資料模板 | 不一鍵批准領養或覆寫配對；保留每個個案決策 |
| 動物內容 | 缺圖清單、按編號對圖、批量分類／送審／封存 | 上載前顯示檔案→動物對應；已連結個案不可永久刪除 |
| 助養 | 分派跟進、付款證明審核隊列、到期提醒草稿 | 憑證匹配、承諾與付款分開；付款確認與配對結果均可追溯 |
| 財務 | 匯入對帳檔、候選匹配、確認匹配組、補發收條工作 | 金額／幣別／reference 重複檢查；退款與收條 void 不作盲批 |
| 支持者 CRM | 批量標籤、分派、清理格式、受限匯出 | 合併身份必須人工檢查；不能批量授予通訊同意 |
| CMS | 過期活動、示範隔離、缺來源／缺圖、批量送審 | 明確 selection snapshot、版本、公開影響、操作者及回復方式 |

共用互動規格：明示「本頁 25 筆」及「全部符合條件 N 筆」；先鎖定快照；操作前列 before／after、符合／略過／衝突數；完成後可下載逐筆結果及只重試失敗項。大任務背景執行，顯示 queued／running／partial／done；同一 idempotency key 不重複執行。更改篩選清除選取並解釋原因。

通知與資料修改分開：資料已更新、通知排隊、供應商接受、已送達、失敗各自顯示。本次審核沒有發送任何通知；未來大批通知需明確顯示收件範圍及訊息預覽。

## 7. 效能證據與優化次序

### 本次 HTTP 觀察

每頁三次、最多兩條路徑並行，獨立 urllib 請求；未使用瀏覽器快取。時間由本執行環境發出至 response headers／讀完 body，包括代理、TLS、網絡及服務端，**不是瀏覽器 TTFB、LCP 或香港實際用戶體驗**。三次樣本不足以計算有意義的 p95。所有公開頁回傳 200 及 x-vercel-cache: MISS，不能推論整個網站或資料庫沒有快取。identity encoding 的 HTML bytes 不代表實際 gzip wire size，也不含 JS／圖片。

| 路徑 | HTTP | headers 中位數 | 完成中位數 | HTML bytes |
|---|---|---|---|---|
| / | 200 | 11.17s | 11.21s | 29,852 |
| /donate | 200 | 11.17s | 11.20s | 23,008 |
| /sponsors | 200 | 19.63s | 19.93s | 64,006 |
| /animals/cat | 200 | 19.98s | 20.04s | 58,527 |
| /volunteer | 200 | 9.87s | 9.88s | 20,121 |
| /adoption/instructions | 200 | 9.62s | 9.68s | 47,977 |
| /stories | 200 | 10.35s | 10.61s | 42,640 |
| /report/audit | 200 | 10.44s | 10.46s | 17,373 |

靜態對照 `/robots.txt` 的 headers 中位數為 9.60s；因此必須先排除量測路徑／代理成本，不應直接把上述秒數歸咎於應用程式。

### 已有歷史基準（不是這次正式測速）

`docs/evidence/operations-release-20260915/performance.md` 記錄：policy payload 1,710,407→649,002 bytes；本機 SQL p95 97.4→32.2ms；1,001 隻動物測試由 1,000 full rows／5,833,001 bytes 變為 20 summaries／11,835 bytes。相同 122 場 calendar fixture 雖減少 payload，但 SQL p95 132.6→153.0ms，不能宣稱所有操作都加快。上述為舊版本、本機合成資料，不能用作本次生產提升百分比。

優化次序：先修正付款／資料不可用及錯誤狀態；量測公眾完整集合查詢；補列表 debounce／abort；圖片建立 responsive thumbnails；大型 PDF 提供輕量預覽及檔案大小提示；最後依 trace 做快取與索引。年報畫面標示 29.4 MB 及 16.9 MB，已提供大小，未下載核實，不當作首頁載入量。

正式量測需香港及另一地區、手機／桌面分開；登入後用 1k/10k/50k 合成資料、每情景足夠重複數、保留冷／暖與錯誤率。新增 list-ready、filter-ready、save、publish、bulk preview/apply，以及 API duration／payload／query plan。公眾 `publicMetrics.ts` 已有 consent-gated web-vitals，後台需另一套去識別化任務指標；不可記錄姓名、電郵、token 或完整 query string。

建議驗收預算（目標，不是已達標）：正常行動網絡下列表首屏可操作時間由實測訂 baseline；warm 搜尋／翻頁盡量 <1s；20–25 筆 summary API 壓縮前盡量 <50KB；前後比較須同樣資料及環境。權限、已發布狀態、交易內容及私人資料不能為快取犧牲正確性。

## 8. 依賴有序修正路線

| 波次 | 工作 | 完成閘 |
|---|---|---|
| A：發布與服務準備 | OPS-01；PAY-01/02/03；CONTENT-01；VOL-01 | 固定 release SHA、CI 可執行；付款入口與 server policy 一致；真實公開內容；已批准場次可見 |
| B：完成公眾流程 | SPON-01/02/03/04；ADOPT-01/02；VOL-02；CONTENT-02 | 助養文案、條款、資料驗證及草稿；領養成功／失敗／續填；義工新舊身份驗收 |
| C：減少日常人手 | ADMIN-01/02/03/04；CRM-01 第一階段 | 任務隊列、可靠匯出、最新版本表單、統一搜尋、保留安全批量流程 |
| D：效能與可靠性 | PERF-01；PAY-04/05；SEC-01；背景任務及觀測 | 同條件效能證據；交易／收條／通知分狀態；production readiness 完整 |

付款 API guard 及寫死資料來源要先於正式開通支付。批量 UI 改善必須重用現有 DB 正確性檢查。可以獨立修正文字、容器及錯誤提示，但正式內容發佈／付款啟用仍按協會既有權限處理。

## 9. 開發及驗收交接清單

1. 先 fetch 最新 main，記錄與本報告 SHA 的差異；逐項重現，已修正項標明證據，不重複改。
2. 按 AGENTS.md 建獨立分支／測試環境，保留他人工作。本報告不授權直接 push main、發布或修改正式 DB。
3. 付款以測試帳戶／sandbox：雙擊同一請求、改金額、逾時後重試、有效與無效簽署、重放／亂序 webhook、幣別及金額不符、取消、延遲成功、部分退款、收條失敗重試；不得重複計款。
4. 義工：新義工配額、總名額、團體鎖定、48 小時界線（Asia/Hong_Kong）、資格／條款更新、候補遞補、跨場次每日配額、兩個同時預約、批量 stale preview。09:30–12:30／10 人／新義工 5 人等原有要求先與已批准政策核對，不擅自硬編碼覆蓋。
5. 領養：最多三隻、已不可領養動物、必填項、照片格式大小／重試、草稿失效、提交冪等、status token 過期、後台接收／分派／補資料／完成／封存。
6. 助養：無偏好／多偏好、稍後付款／已有憑證、條款版本、重試不重複承諾、部分／重複付款、分配與退款、通知失敗、找回連結。
7. 後台角色：依 access.ts 對各角色測 UI 與直接 API；匯出、檔案及私人照片需同樣授權。未登入 401／越權 403，無敏感資料落客戶端 cache。
8. 桌面及 390px 手機實測 menu、浮動捐助提示、候選清單、助手及底部按鈕互相遮擋；鍵盤焦點、errors、dialog 返回焦點、200% zoom。
9. 交付 PR 包含：問題 ID、before/after、受影響檔案、測試結果、migration／回復策略、待人工事項。付款與正式內容啟用要有具體可審閱結果。

## 10. 本次證據索引

本報告的來源連結固定到 commit；ZIP 另附當次可保存的公眾 DOM／截圖、HTTP 原始樣本、CI 摘要、source 摘錄及 SHA256 清單。截圖名稱可能只顯示頁面上半部，空狀態全文以對應 DOM 為準。

CI：[固定 SHA 的 Actions run](https://github.com/YNWAforever/hkscda/actions/runs/36253318554)。未取得 log 原因是工具回傳 BlobNotFound 404；沒有將此錯誤解讀為程式測試失敗。

待補的主要現場範圍包括**登入後後台及驗證會員流程**，、**sandbox 付款全鏈路**及**手機介面與完整提交流程**。應以安全登入方式提供測試身份再驗收，不在聊天輸入密碼，也不要用正式捐款／真實申請作測試資料。
