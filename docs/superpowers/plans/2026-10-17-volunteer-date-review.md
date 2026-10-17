# 指定日期完整場次及審核摘要：本輪執行範圍

日期：2026-10-17（香港）。依使用者本輪「自行本機修復及隔離測試」授權續做；
現有結構內的有界增補，不重建日曆／點名介面，不新增營運決策或發布授權。

## 基線與現況

- 原隔離 worktree／分支 `volunteer-admin-20261013`／`codex/volunteer-admin-20261013`。
- 開始 HEAD `c34af5d7ce03dbf646e67e6de42f2779a6706d99`，tracked tree 乾淨。
- 遠端 main 唯讀核對 `b039bba7df2ab2c9d579624379dee35c370c7e58`。
- 既有 daily-work Tasks0–6 在 c399d09d 已有逐人預覽、CAS、原 operation 恢復、
  部分結果、audit、24組合成角色／viewport A–F 的歷史證據；不是本輪結果。
- Calendar 仍共用 ActivityWorkspace；目前明示只顯示本頁最多25場，
  但跨頁資料不能同時留在日曆，空白日期亦未區分未載入。
- 審核詳情現有狀態、最低年齡、形式、名額等欄位；尚未集中顯示目前 server
  evaluator 的 allowed／reason。已有權限、名額及狀態 RPC 不改。

## 有界設計

1. 保留原每頁25筆 list API、所有篩選、300ms／IME／signal／query cache。
   Calendar 只接受有效且包含首尾不超過93日的香港日期範圍；table 保持原日期範圍能力。
   無界／過長範圍顯示要求指定日期，不發無界 calendar 查詢；提供今日入口。
2. 日曆以目前身份＋篩選為 collection scope，記錄已成功讀到的資料頁。
   同範圍換頁逐頁累積，日期／篩選／身份改變即不呈現舊 collection。
   不背景遍歷全部頁；使用現有頁碼讀下一頁，返回及 reload 仍由原 URL writer 恢復。
3. 明示本次已載入數／總數及部分／完整；失敗保留先前成功頁並顯示 LoadFailure。
   未完成不能將未見日期稱作空；只有成功覆蓋所有頁且 total=0 才是真正無場次。
   重複 IDs、頁長／總數不一致或查詢期間資料移動，標示需重新載入，不宣稱完整。
4. 月曆使用累積資料；批次「本頁」仍只選目前 API 資料頁，顯示該頁號及數量，
   不暗中全選累積頁。既有 lock-all 是原本明確操作，權限與 server 驗證不改。
   單日使用工作區完整寬度與響應式場次卡；多日仍沿用原有週欄，不另建日曆。
   活動名義剩餘名額與 evaluator 有效容量明確標示，兩者均不是預留名額。
5. 審核詳情新增唯讀 server assessment：沿用 `volunteer_policy_evaluate`，傳目前
   activity/profile/duty role／受信任 clock／排除本 registration。回傳安全 DTO，
   缺少資料或失敗不捏造 allowed。原批准及點名 API 的鎖後驗證保持。
6. 現有畫面集中呈現最低年齡／可報名形式、目前狀態／原因、已批／候補／剩餘及
   server 評估原因，清楚標示讀取結果不預留名額。server rules 不複製到前端。
   既有狀態操作、必填理由、saved-refresh-failed、CAS／audit 與原 OP 恢復保持。
   共通與該申請職務的條件分開顯示；有效容量／排除此申請佔用的評估數字直接取自
   evaluator，不以活動的名義容量代替。找不到職務或數字不合法時標示資料未能取得。
   已知審核寫入成功但 detail refetch 失敗時保留「已儲存」提示，重試只讀取；
   成功讀取後才清除刷新警告。

## 預定檔案

- `src/components/admin/volunteers/activityCalendar.ts` 及測試：有界 range／scope page collection。
- `VolunteerActivityWorkspace.tsx`、`ActivitySchedule.tsx`、`activityWorkspaceCopy.ts`：
  日期捷徑、累積 calendar、狀態及本頁選取；不增加 URL 寫入 effect。
- `src/lib/volunteers/registrationReview.ts` 及測試、`types.ts`、`repository.server.ts`：
  唯讀 assessment DTO／parser、既有 evaluator；detail 單筆固定次數查詢，列表不逐列查詢。
- `VolunteerRegistrationDetail.tsx`、`volunteerRegistrationCopy.ts` 及對應測試：
  原畫面集中摘要、讀取時間及安全原因，並驗證成功／刷新失敗顯示。
- 既有 fixture／browser verifier 可擴充；所有 private credentials／Auth／ETL 不入 Git 或包。

## 順序與驗收

1. 唯讀重核 target 的 project／container IDs／network／ports／Auth／DB／ownership。
   原效能 fixture 保留。寫入只在可證明本輪所有的隔離 clone／合成資料上進行，
   不對未知 DATABASE_URL／production fallback。保留原 fixture、歷史樣本及失敗紀錄。
2. RED 重現26場跨頁日曆遺漏；涵蓋0／1／25／26、香港午夜／閏日、
   range 無界／超限、跨篩選舊回應、部分失敗與 total／IDs 變動；再最小 GREEN。
3. RED 缺 review assessment／摘要，再實作。API／DB 驗既有 evaluator、
   last-seat 並行只一人成功、stale 不覆蓋；status reason／未連結身份不捏造。
4. 重驗既有逐人點名 contract／recovery；在隔離環境跑 cancel、correct reason、
   partial、lost response、CAS、terminal replay、receipt/audit rollback。
   admin／staff 允許及禁止的直接 API 都驗，不只藏按鈕。
5. 同一產品 commit 跑 targeted、typecheck、完整 unit、lint、build、適用DB／RLS、
   brand stub，以及 admin／staff 桌面／390px 與鍵盤完整任務。
   每項分 PASS／FAIL／SKIPPED／NOT_RUN，不以歷史數字代替。
6. 交付實際 commit／diff、前後流程、操作時間與點擊的實測或 NOT_RUN、
   同版本截圖、command／exit／證據包與未驗證項目；不自行發布。

## 保留限制

T09 等營運確認；不改資格、名額、候補排序或窗口。沒有真實電郵／WhatsApp／排程。
T08／F05／UC41 的 runtime／event-loop／PostgREST 等仍 partial；本輪 usability
及功能正確性不能代替效能根因／正式環境／真人職員或實機手機驗收。
