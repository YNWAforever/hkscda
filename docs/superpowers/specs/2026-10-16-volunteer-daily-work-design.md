# 義工待審判斷資料與場次逐人點名設計

日期：2026-10-16，Asia/Hong_Kong。狀態：**最小方向已獲使用者同意；本具體規格及配套 implementation plan 待審閱，未授權開始產品實作。**

## 1. 目標、基線與授權

讓 admin／staff 在既有後台完成「找申請 → 查看 → 返回 → 開場次 → 點名 → 確認結果」，減少逐人離開場次名單，並能分辨成功、跳過、衝突、失敗及結果尚未確定。

- 原 worktree：`C:\Users\laich\Documents\HKCSDA\HKCSDA\hkscda\.worktrees\volunteer-admin-20261013`。
- 本輪文件開始時分支：`codex/volunteer-admin-20261013`。
- 已重新核對 HEAD：`7d70df5d18457728ca149c990e8211e4b901e73b`；開始時工作目錄乾淨。
- 最近唯讀核對的遠端 main：`b039bba7df2ab2c9d579624379dee35c370c7e58`。實作開始時再次核對，不把這個紀錄當永久最新。
- 來源：現行 AGENTS.md；2026-10-13 主稽核、續審、Page／Remediation／UC 矩陣及三份詳細計劃；2026-10-16 `T08-runtime-url-7d70df5d.md`；本 HEAD 的六個指定畫面與相關 server／RPC／測試。附包 source 只作證據，不能替代 repo。
- 本次授權只新增／核對 spec 及 plan；不得 push、建立 PR、merge、deploy、改正式設定、啟動排程或通知。

本輪對應既有 T02／T03／T06／T07／T11／T12 的局部驗收，以及 UC02／03／07／28／31／36／42／43／45／49／51。以下 DW-A–F 是本輪任務案例，不取代原編號或回填歷史結果。

## 2. 保留及排除範圍

保留 TypeScript strict／零手寫 any、server-only 邊界、API → HTTP → service → repository、fresh server Auth／角色檢查、RLS、atomic audit RPC、雙語 copy、共享 formatter／StatusBadge／LoadFailure／ConfirmActionDialog。

保留 `7d70df5d` 單一 URL writer、admin-me 60 秒 query、搜尋 300ms／IME／AbortSignal／keepPreviousData、身份切換清理、既有活動工作區／操作恢復，以及 admin-only 批次指派審核員。Calendar 繼續共用工作區。

不新增批次批准報名、跨頁點名、候補政策、自動通知、日曆重做或 route-loader 重構；不改容量、資格、截止時間及角色範圍。T09 現行營運規則仍待核准；本輪 synthetic 時間／人數只作測試輸入。T08／F05／UC41 的 PostgREST pre-SQL 等待保持 PARTIAL，不以本輪可用性成果結案。

## 3. 現況與最小邊界

| 現況                                                                    | 本輪決定                                                                                 |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `VolunteerTasks` 只有姓名及詳情入口；pending DTO 只有五個基本欄位       | 擴充同一頁查詢，先分頁，再讀該頁場次摘要及名額；不逐列 fetch                             |
| tasks 已有分類／頁碼，尚未提供搜尋；詳情返回只接受 activities／calendar | 待審區接上現有搜尋 hook；新增報名返回狀態 adapter，保持活動返回 helper 相容              |
| `ActivityDetailBody` 已有 25 筆分頁名單及詳情連結                       | 在原側板嵌入點名 panel，仍保留詳情入口                                                   |
| 舊 bulk attendance 遍歷整場報名；SQL 已回逐人 ID／kind／reason          | 不把舊場次選取當成逐人選取；新增 attendance 專用 command 分支，舊 commands 維持原意      |
| 舊 bulk 以整日 fingerprint／組別交易防衝突                              | 新逐人分支使用所選報名的 CAS 與場次版本；不拿舊整日 fingerprint 阻擋同場其他獨立成功項目 |
| 現有 attendance RPC 寫 append-only event 及 audit                       | 新分支包裝同一 RPC，將逐人結果與成功寫入一併提交，不另造出席規則                         |

## 4. 待審資料與查詢契約

### 4.1 呈現

每筆以姓名、可區分同名個案的報名參照、活動名稱、開始／結束時間、場地、本次人數、申請狀態及名額摘要呈現。沿用既有即將開始／逾期分類及 server `asOf`。桌面可比較、手機直向排列；「查看／處理申請」及「開啟場次名單」不需橫向捲動。

參照沿用既有格式；同頁短參照碰撞時顯示完整 UUID，完整 ID 亦可在詳情核對。姓名不是 record key。不為此新增 Auth 帳戶查詢或暴露額外電話／電郵。

名額顯示活動 capacity、approved participant 數及 `max(0, capacity - approvedParticipants)`，與目前 registration detail 同一口徑；不是資格保證或預留。缺欄位顯示待重新載入，不能補成 0。批准仍走既有 server 容量與政策驗證。

### 4.2 讀取介面

`POST /api/admin/volunteers/tasks` 的舊 `action:"list"` 保持接受；新增可選 `q`，trim 後最多 100 字。搜尋為姓名、報名 UUID／參照、活動名稱及場地的字面包含匹配，不將 `%`／`_` 當 wildcard。q 不進 URL、href、telemetry 或存取紀錄。

新增 `public.volunteer_pending_work_snapshot(p_actor uuid, p_scope text, p_page integer, p_page_size integer, p_as_of timestamptz, p_query text) returns jsonb`。原五參數 `volunteer_pending_snapshot` 保持介面，以空 query 委派新投影；不建立會與舊五參數呼叫歧義的 default-argument overload。

新投影延續既有參數限制（page 1–100000、pageSize 0–100），UI 固定 25，沒有載入全部按鈕。先取得 pending counts、scope／q 的 filteredTotal 及當頁 IDs，再只聚合該頁場次的報名人數；沒有每列 HTTP／RPC。

新 `PendingWorkSnapshot` 保留 `counts, registrations, page, pageSize`，另有 `filteredTotal`；每個 registration 保留舊欄位並加入：

```typescript
type PendingWorkFields = {
  profile_id: string | null;
  participant_count: number;
  status: "pending";
  ends_at: string | null;
  location: string;
  capacity: number;
  approved_participants: number;
  remaining_capacity: number;
};
```

`counts` 一律是未套 q 的全 pending 分類統計，保持 overview 口徑；`filteredTotal` 是已套 scope 及 q 的分頁總數，不能用 counts 決定搜尋後的下一頁。兩者同一 SQL snapshot／asOf。pageSize=0 不做名額／列投影。新舊 API／DTO 相容期以明確 schema 分辨缺欄位；不能把缺欄位當實測零。

### 4.3 返回與搜尋

新增 `registrationReturnState.ts`，`RegistrationReturnState = ActivityReturnState | { from:"tasks"; safeSearch:Record<string,string> }`；原 `ActivityReturnState` 及 activity helpers 不擴大目的地。

新 adapter 提供 `readRegistrationReturnState(params)`、`registrationRouterSearch(state)`、`buildRegistrationReturnHref(state)`、`buildTaskRegistrationHref(id, state)`。tasks allowlist 為 `pending_scope, page`，另保留經原 helper 正規化的 `activity_return_*` 舊書籤脈絡；禁止任意 return URL、q、actor、token。活動返回仍用既有安全篩選，新增可驗證的名單 `detail_page` 以還原原側板頁碼。

q 留在既有按身份清理的本分頁 session／記憶體。直接連結只還原安全條件；新分頁沒有原 session q 時不推測搜尋。返回按鈕及 browser Back 都使用同一 allowlist；活動、待辦頁碼不混用。

新增 `useVolunteerReturnPosition`，在離開清單時保存 list key、actor、scope／page、觸發 record ID 及 scrollY；資料 ready 後恢復列／捲動。列已移走時 clamp 捲動並聚焦清單標題。storage 不可用則限本次掛載記憶體，明示不保證 hard reload 恢復。身份切換清除新增的 return-position 及 session operation pointer；安全 URL 的 operation UUID 可供原 actor 日後登入恢復，不能讓新 actor 執行。這個 hook 不寫 URL；所有 URL 更新仍經既有單一 writer。

## 5. 場次逐人點名契約

### 5.1 名單與可用操作

既有 bulk `detail` 分頁保留，SQL 的新 detail branch 才新增 `attendance_contract:1`、server `asOf`，以及每列 `updated_at, participant_count`；repository 以這個 asOf 為一次 clock 投影每列 `attendance_actions`。每個 action 是 `{command, attendance_status, allowed, reason, requires_reason}`。不允許時顯示雙語簡短原因，未知原因使用安全 fallback。新 app 接舊 DB 沒有 marker 時不得自行補 `attendance_contract:1`。

server 用 `attendanceActionCapabilities(input, now = () => new Date())` 從已授權讀到的報名／場次投影現行規則；它不是授權憑證。DB parity 測試逐項對照既有 `set_volunteer_attendance_with_audit`，真正提交仍由該 RPC 在鎖後核實。

- `record` 的現有合法轉移不變，包括 attended → completed 的正常完成紀錄。
- `correct` 必須有 trim 後 1–1000 字理由，沿用現有 bulk 上限；不因此擴大單筆 API 規則。
- 顯示同一目標與現況相同的項目為 `unchanged`，不建立重複 event。
- `no_show`、取消場次／報名上的更正邊界依現行 RPC，不自行增加「只有 approved 才可更正」等新限制。
- backend 缺 `attendance_contract:1` 時只保留原詳情入口並顯示功能尚未可用，不能 fallback 至整場 attendance。

點名單位為 registration；participant_count>1 的報名清楚標示人數。現有模型沒有團體逐位成員 ID，不能宣稱可替團體內每個人獨立記錄出席。

### 5.2 additive commands

以下全部經同一 `/api/admin/volunteers/bulk`、現有 body limit、Auth／role 與 no-store。新增 schema 放 `bulk/attendance.ts`，由現有 `bulk/service.ts` 納入，未知欄位／重複 ID 拒絕。

```typescript
type AttendanceTarget = {
  registration_id: string; // UUID
  expected_updated_at: string; // 原字串保留微秒，不經 JS Date 重編碼
  attendance_status: "not_marked" | "attended" | "completed" | "no_show";
  command: "record" | "correct";
  reason?: string;
};
type AttendancePreviewCommand = {
  action: "attendance_preview";
  activity_id: string;
  expected_activity_updated_at: string;
  page: number; // 1–100000
  page_size: 25;
  entries: AttendanceTarget[]; // 1–25、unique registration_id
  idempotency_key: string; // client 於第一次 dispatch 前固定的 UUID
};
type AttendanceApplyCommand = { action: "attendance_apply"; operation_id: string };
type AttendanceLookupCommand = { action: "attendance_lookup"; idempotency_key: string };
type AttendanceCommand =
  | AttendancePreviewCommand
  | AttendanceApplyCommand
  | AttendanceLookupCommand
  | { action: "status"; operation_id: string }; // 原 status 繼續供還原查詢
```

`attendance_preview` 驗證 actor、場次版本、IDs 全屬該場及目前指定頁的子集。跨場、跨頁或重複 IDs 拒絕整個要求，不默默截成 25。符合範圍但已過時的 registration 保留於預覽並標示 conflicted；不以當前版本偷偷取代傳入版本。預覽不擴大到未提交的人。

server 從現有 `volunteer_bulk_operation` 保存 `action:"roster_attendance"`、原 request hash、場次 snapshot、scope、逐人 before／target／decision，沿用 30 分鐘期限及 `(actor_user_id,request_key)` 唯一鍵。preview 只提交技術快照，沒有持久化的出席、審計、outbox 或通知；取消不呼叫 apply／cancel mutation。若沿用 rollback probe，必須證明全部業務／audit／trigger 產物隨 probe rollback，不能啟動外部 sender。

同 key 同 body 回原預覽；同 key 改 body 回 409 `idempotency_payload_changed`。entries 的 request hash 以固定欄位、ID 排序及 trim 後 reason 正規化，空 reason 統一省略；before 不來自 caller。修改選人／目標／理由會使 UI 原預覽失效，須取得新預覽。

### 5.3 逐人預覽與結果 DTO

以下名稱固定於新 TypeScript 契約，HTTP 外層仍 `{kind:"ready", operation}`；舊 operation 回應不變。

```typescript
type AttendanceFact = {
  registration_status: string;
  attendance_status: string;
  updated_at: string;
};
type AttendancePreviewRow = {
  registration_id: string;
  contact_name: string;
  participant_count: number;
  before: AttendanceFact;
  target: AttendanceTarget;
  decision: "ready" | "skipped" | "conflicted";
  reason: string | null; // 只允許本節定義的 code
};
type AttendanceItemResult = {
  registration_id: string;
  kind: "applied" | "skipped" | "conflicted" | "failed";
  reason: string | null;
  before: AttendanceFact; // 原預覽快照，不偽裝為衝突後現況
  current: AttendanceFact | null; // apply 時可核實的現況；刪除／無法取得為 null
  after: AttendanceFact | null; // applied 必有；failed 不冒充 after
  event_id: string | null; // applied 必有既有 append-only event ID
  audit_id: string | null; // 本次成功／嘗試結果的 audit ID
};
type RosterAttendanceOperation = {
  id: string;
  action: "roster_attendance";
  created_at: string;
  expires_at: string;
  activity_id: string;
  activity_title: string;
  scope: { kind: "page"; page: number; page_size: 25; selected_count: number };
  state: "previewed" | "completed" | "expired";
  rows: AttendancePreviewRow[];
  results: AttendanceItemResult[] | null;
  notifications: []; // 本操作不新增通知
};
```

rows／results 以預覽列順序對齊，結果 ID 集合必須等於預覽 ID 集合且恰好一筆一人；不從總數或目前 attendance 值猜成功。HTTP 頂層 200 表示回應有效，不表示每列成功；UI 從逐人 kind 計數，並可區分「全部成功」「部分成功」「沒有寫入成功」。

安全 reason allowlist：`unchanged, registration_not_approved, activity_cancelled, future_attendance, attendance_correction_required, invalid_attendance_status, stale_registration, stale_activity, registration_missing, operation_expired, transaction_failed`。輸入缺 reason／無效 target 為 400／422，不在 UI 直接展示 SQL／provider 原訊息；未知業務拒絕映射 `invalid_attendance_status`，未知系統錯誤映射 `transaction_failed`。

### 5.4 apply、部分失敗及持久化

新增 `public.volunteer_roster_attendance_command(p_actor uuid,p_command jsonb) returns jsonb`；`bulk/repository.server.ts` 只將三個 additive commands 路由到它，舊 commands 仍走原 RPC。

1. 延續 domain → operation → activity／registration 的相容鎖順序；與舊 domain advisory lock、attendance RPC 不得形成倒置鎖。等待鎖後重新檢查 active actor。讀取／寫入 operation 均限定 actor，不能相信 caller 傳來的 actor。
2. 鎖定 operation。若已有完整 results，直接回原收據，即使其後有人更正或預覽期限已過亦不重寫。`state=completed` 是終態，失敗列亦不在原 operation 重新執行。
3. 首次 apply 若超過 30 分鐘，逐人回 `skipped/operation_expired`；沒有出席 event，保存完整結果後 state 仍為 completed。只有「期限已過且尚未有 results」的 status 投影為 expired。若場次版本已變，所有原 ready 列回 `conflicted/stale_activity`；不能用新場次時間／狀態偷偷執行。
4. 依 registration UUID 穩定順序鎖定所選記錄。每筆 ready 列在自己的 subtransaction，以原 `expected_updated_at` 呼叫既有 atomic attendance RPC。版本變動回 `conflicted/stale_registration`；其他列繼續。預覽已 skipped／conflicted 的列維持未寫入，不在 apply 自動升為 ready。
5. 每筆成功保留 RPC 寫入的 event／before／after／audit。以 eventId 查同一交易內對應 audit ID，不另建第二筆成功 audit。可預期拒絕回 skipped；可辨認 stale 回 conflicted；意外單筆例外 rollback 該筆的所有資料後回 failed／transaction_failed。
6. 對 apply 中未成功的列，於 subtransaction 外記 `volunteer_registration.attendance_attempt` audit：actor、registration、operation、要求的變更、原版本、可取得的當前版本、結果及安全 reason；不捏造出席 event。取消預覽不寫 attempt audit。
7. 所有成功資料、逐人 attempt audit 及 operation 的完整 results 在**同一外層交易**提交。若 receipt／audit 保存失敗，整個 apply 回滾，先前 subtransaction 的成功也不成立；不能先提交業務後另存收據。回應中 applied 只能在外層 commit 後送出。

例：A 成功、B 被同事改過、C 單筆 audit 故障。結果 A=applied、B=conflicted、C=failed；B／C 沒有新出席 event。再次 apply 同 operation 只回三筆原收據，A 不重做。重處理 B／C 必須讀最新狀態、明確選取仍需處理的人、填理由及建立新預覽；保留原 operation 作追溯。

舊 `{action:"apply",group_index}` 遇 `roster_attendance` 必須拒絕，不能繞過新逐人 CAS 分支。舊整場 attendance／generate／edit／cancel 的日期組及 fingerprint 行為不變。`volunteer_bulk_result` 只對新 action 委派新 projection；既有 status 可回新 DTO。

## 6. 斷線恢復與 UI 狀態契約

`bulk/attendanceRecovery.ts` 定義 reducer／controller，所有新增 dispatch 使用 `fetchAdminJson(..., expectedActorUserId)`；不修改共用 HTTP 的通用重試行為。

| 狀態／事件                       | 可見行為與下一步                                                                                                                                                                        |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| draft → previewing               | dispatch 前固定 preview key；禁止雙擊。沒有可送出的 apply                                                                                                                               |
| preview 回應遺失                 | 用原 key 呼叫 attendance_lookup；not_found 只代表目前查不到，不證明原要求未到。只可重送原 key、原 body 的技術預覽，不能自動 apply                                                       |
| previewed → applying             | 畫面逐人核對、明確確認；送出前保存 actor＋operation ID＋apply-intent pointer，凍結 targets                                                                                              |
| apply 回應遺失、逾時或 5xx       | 標為 outcome_unknown，先用原 operation ID 查 status；不顯示「寫入失敗」及不發新 key                                                                                                     |
| status completed                 | 逐人展示原 results，從成功清單移除待處理項。禁止重新 apply 來刷新畫面                                                                                                                   |
| status previewed                 | 只證明當次查詢尚無已提交收據；原 request 仍可能在途中。使用者可再次確認**同一 operation ID**的 apply，server row lock／終態冪等確保競態只寫一次；不可自動重送或建立替代 operation       |
| status expired 且無 results      | 顯示未取得可執行預覽；重新讀資料、只為仍需處理者建立新預覽                                                                                                                              |
| status 失敗／not_found／401／403 | 保持結果未明／需要重新登入；不猜成全失敗。同身份保留 pointer；身份清理時移除 session pointer／PII，但保留安全 URL operation UUID，原 actor 可日後登入核對；另一身份不能取得或提交原操作 |
| receipt 成功但 invalidation 失敗 | 原收據保持可見，顯示「已儲存，重新載入失敗」；retry 只做 read／invalidation                                                                                                             |
| 使用者離開／重整／切換身份       | operation UUID 放入既有單一 URL writer 的 operation 欄位；同 actor 可還原，其他 actor 在 API 被拒。清除本機個人資料及新 draft，不能取消已送出交易                                       |

preview 明確回 400／422 時保留草稿及欄位錯誤，沒有 apply；只有可驗證的輸入拒絕可用此分支。409 key mismatch 保留原 identity 並先 lookup；5xx／斷線不是輸入拒絕。

operation pointer 僅存 UUID、actor 及 phase，不存名冊、理由、token。sessionStorage 不可用時，以安全 URL operation UUID 還原；若兩者都不可保存，確認前停止並告知恢復位置無法保存。URL 的 operation 不是授權。未知結果尚未解決前，該場次不得重新產生重疊的出席草稿。

controller 的事件 union 固定為 `PREVIEW_REQUESTED, PREVIEW_RECEIVED, PREVIEW_REJECTED, PREVIEW_LOST, LOOKUP_RECEIVED, APPLY_CONFIRMED, APPLY_RECEIVED, APPLY_LOST, STATUS_RECEIVED, STATUS_FAILED, REFRESH_FAILED, REFRESH_SUCCEEDED, CANCEL_PREVIEW, IDENTITY_CLEARED`。REQUESTED／CONFIRMED 事件帶原 actor／key 或 operation ID；RECEIVED 事件只接受通過 response schema 的資料。PREVIEW_REJECTED 只接受上述已驗證的 400／422，其他不確定結果不可歸類為未寫入。`createAttendanceController` 產生 network effects，reducer 本身不做 fetch／storage；任何不是目前 actor＋operation identity 的回應均忽略，不能清掉新身份的狀態或顯示舊成功。

本頁選取只對目前 roster page 有效；換頁／換場／身份／重新載入資料版本會使未提交 preview 失效。已有 apply-intent／unknown operation 的恢復入口不能被換頁清除；留在獨立狀態區，查完結果才解除限制。取消及關閉 preview 不呼叫寫入；提交後不能用「取消」暗示可撤回交易。

## 7. 權限、資料庫及通知邊界

admin／staff 都可用既有 volunteerManagement／attendance 權限；審核員指派不新增角色或授權，staff 不能因此使用 admin-only reviewer bulk。treasurer、匿名、disabled、banned／unconfirmed 身份按現有 server／RPC 規則拒絕；鎖等待後失去權限不能繼續。

重用 operation table，不新增第二套出席 ledger。新 RPC／internal projection 固定 search_path；只對 app entry RPC grant service_role，internal helper 對 PUBLIC／anon／authenticated／service_role revoke。既有 RLS、attendance event append-only 保護及 audit atomicity 不移除。新 migration 只 forward；不能重播正式 schema 或拿本包 snapshot 覆蓋函數。

本操作不新增 outbox 或呼叫 sender。若既有觸發器有必要的內部候選重算，保留並驗證；任何既有外部發送路徑只能用隔離 stub。queued、provider_accepted、delivered 沿用不同語意；notifications=[] 只代表這個點名 command 沒有新增通知，不聲稱全系統沒有通知。

## 8. 檔案責任與相容回退

| 實際位置                                                                                                                 | 責任                                                                           |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `src/lib/volunteers/pending.ts`、`jobs/tasks.server.ts`                                                                  | 新 pending DTO／q、同頁批次讀取                                                |
| `src/components/admin/volunteers/VolunteerTasks.tsx`、`volunteerTasksCopy.ts`                                            | 待審卡、搜尋、scope／filteredTotal、入口                                       |
| 新 `registrationReturnState.ts`、`useVolunteerReturnPosition.ts`；既有 `activityReturnState.ts`／`activityRouteState.ts` | 安全返回 adapter、名單頁碼、定位；原活動返回相容                               |
| `src/routes/admin/volunteers/tasks.tsx`、`registrations/$id.tsx`、`VolunteerRegistrationDetail.tsx`                      | 接返回 adapter；保留原審批／出席 API                                           |
| `src/lib/volunteers/actionEligibility.ts`；新 `bulk/attendance.ts`                                                       | server action projection、schema／DTO                                          |
| `bulk/service.ts`、`http.server.ts`、`repository.server.ts`、`apiResult.ts`（僅必要 mapping）                            | 新 commands、DI 接線及安全錯誤                                                 |
| 新 `bulk/attendanceRecovery.ts`                                                                                          | preview／apply／status 恢復狀態，無 React／DB 依賴                             |
| `ActivityDetailSheet.tsx`、新 `ActivityAttendancePanel.tsx`、`activityAttendanceCopy.ts`                                 | 同場逐人草稿、預覽、結果、鍵盤及手機                                           |
| `activityWorkspaceTypes.ts`、`VolunteerActivityWorkspace.tsx`、`ActivityOperationPanel.tsx`／copy                        | 新舊 operation 分辨、既有 URL writer、舊結果如實展示                           |
| `queryKeys.ts`、`useListQueryState.ts`（僅新增 key 清理／必要接線）                                                      | attendance invalidation／身份清理，不另開 URL effect                           |
| 新 forward migrations                                                                                                    | pending work projection；roster command／result projection／legacy apply fence |
| fixture／browser 工具及鄰近測試                                                                                          | 本輪 synthetic A–F 與 RED→GREEN 證據                                           |

未有證據需要時不改 `VolunteerDirectory`、`VolunteerReviewBulkPanel` 或整套 router。新增函數／檔案名稱在 implementation plan 固定；實作若發現會改變上述契約，先回設計審閱。

回退以普通 revert 移除新 UI／command 接線，不 reset 歷史、不刪 operation／event／audit。舊 API 保持可用，新 forward migration 可保留；正式 rollback migration／環境操作另須批准。新 UI 只能在確認 backend capability 後開點名，避免版本錯配誤走整場操作。

## 9. 任務驗收、量測及交付

任何真實 client／寫入測試前，先記錄並交叉核對 project/container ID、網絡、Kong upstream、DB／Auth 目標、port mapping、fixture metadata／ownership。56321／56322 只是已觀察線索；gate 不過便不寫入，不能 fallback DATABASE_URL。新 run ID 及精確 manifest 與舊 fixture 分開；只清理本輪擁有且可合法清理的 IDs。append-only 證據不得透過關 trigger／刪歷史強行清理；須保留 manifest 或使用獲准 disposable clone。

| 案例                | admin、staff 各自的可觀察驗收                                                                                                                 |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| DW-A／UC02,03,07,28 | 同名、不同場次、跨兩頁及 upcoming／overdue；辨認指定申請；查看／返回／Back／直接 URL 保留安全範圍與合理定位；q 不外洩                         |
| DW-B／UC31          | approved／waitlisted／cancelled／已有出席／未開始；server actions、逐人 before／target／skip、團體報名單位及本頁 scope 正確                   |
| DW-C／UC31,36       | 同事先改一筆；該筆 conflicted、其他合資格列可成功；原 operation 重送沒有第二個 event／audit                                                   |
| DW-D／UC43,45       | 雙擊、相同／變更 payload、單筆故障、整筆 receipt 故障、response loss、status loss、storage failure、refresh failure；結果未明不猜、不重送全部 |
| DW-E／UC31,45       | 取消沒有業務寫入；correct 理由必填；成功／嘗試 audit 的 actor、對象、before／after、operation 與結果正確，無真實 sender                       |
| DW-F／UC42,49,51    | 1440×900、390×844、300% zoom；全旅程、Tab／Escape／焦點還原、loading／empty／403／error／recovery；切身份不殘留資料或提交前一身份草稿         |

改動前在基線、改動後在最終 SHA 使用同一合成任務／DB cohort，逐案記 clicks、route transitions、document navigations、成功數／嘗試數及 browser monotonic elapsed ms。automation 與真人職員 UAT 分欄；原版無法完成的案例記 failed／blocked，不編造完成時間。沒有真人資料就不宣稱職員節省百分比。

寫入任務的前後比較從本輪 owned disposable snapshot 的兩份相同起點分別執行，先核對初始業務列／event／audit／operation counts 及 hashes；測完各自保留 receipts，不刪 append-only 歷史回到起點。clone 必須有獨立 target proof／manifest，不能只改 env 指向其他 DB。無法取得可證明的相同起點時，寫入任務前後時間維持未量測；唯讀比較仍可繼續。

代表 pending list、q／page2、roster detail 做 first1+warm30；記實際 DB counts、SHA、runtime、process／browser 冷暖條件、p50／p95、payload、錯誤及分段 timing，保留所有慢樣本。read p95≤750ms；若量 mutation p95≤1000ms，使用 31 組獨立可辨識輸入，不能重播同一收據當 31 次寫入。此為本地門檻，非正式 SLA 或 pre-SQL 根因結案。

每項行為先 RED 再 GREEN，保存命令／exit code／log。同一最終產品 commit 重跑 typecheck、unit、lint、build、品牌 gate、適用 DB／RLS、admin／staff 桌面手機角色旅程及截圖。未執行的維持 not-tested／blocked。

本文件不宣稱產品、測試或正式驗收完成。交付須分列程式完成、隔離 integration、合成 staff 任務、真人職員 UAT、正式環境；T10a/b、T11a/b 未全驗收不能關 parent。

## 10. 規格自查與審閱項

已固定：每頁 25／每操作最多 25 人、30 分鐘預覽、q 100 字、correct 理由 1–1000 字、逐人結果、終態不重做、未知結果先 status、舊整場 apply fence、失敗 audit／receipt 原子性、group registration 單位、取消的技術快照與零業務寫入區別，以及前後量測方法。

營運 T09、正式帳戶／資料／通知／發布批准仍屬外部前提，不填入歷史預設。這些前提不阻止獲准後的本地程式與隔離測試。

請與 `docs/superpowers/plans/2026-10-16-volunteer-daily-work.md` 一併審閱；未獲具體文件批准前不進入實作。
