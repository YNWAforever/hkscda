# Volunteer Daily Work Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在既有待審及場次名單完成找申請、返回及逐人點名，逐項顯示真實結果並可安全恢復未知結果。

**Architecture:** 沿用 tasks 分頁投影、ActivityDetailSheet、現有 API 分層及 atomic attendance RPC。只為明確 registration IDs 新增相容 commands，重用 volunteer_bulk_operation 保存預覽與逐人收據；舊場次 bulk 維持原交易語意。

**Tech Stack:** repo lockfile 的 TypeScript strict、React 19、TanStack Start／Router／Query、Bun、Supabase Postgres、Playwright、現有雙語 admin primitives。

**Spec:** `docs/superpowers/specs/2026-10-16-volunteer-daily-work-design.md`。

## Global Constraints

- **狀態：本計劃與具體 spec 均待使用者審閱；本文件沒有已執行的產品實作或測試結果。**
- 文件基線 `7d70df5d18457728ca149c990e8211e4b901e73b`、原分支 `codex/volunteer-admin-20261013`、原隔離 worktree；實作開始時重新核對 dirty／HEAD／remote，不覆蓋既有工作。
- UI 每頁 25／每個逐人 operation 最多 25 人；預覽 30 分鐘；q trim 後最多 100 字；correct 理由 trim 後 1–1000 字。
- TypeScript strict／零手寫 any、server-only 邊界、fresh Auth／角色、RLS、atomic audit RPC、雙語 copy 及共享 formatter／StatusBadge／LoadFailure／ConfirmActionDialog 全部保留。
- 保留 `7d70df5d` 單一 URL writer、admin-me 60 秒 query、300ms／IME／AbortSignal／keepPreviousData、身份切換及 operation 恢復。
- 不新增批次批准報名、跨頁點名、候補政策、自動通知、日曆重做或 route-loader 重構；不改容量、資格、截止時間及角色範圍。
- T09 仍待營運核准；T08／F05／UC41 的 PostgREST pre-SQL 等待保持 PARTIAL。
- 真實 client／寫入前完成 target identity gate；不得 fallback production DATABASE_URL；只管理本輪 manifest 可證明的資料／資源。
- 不 push、建立 PR、merge、deploy、改正式設定、啟動排程或通知；本地 ordinary commits 可供 review，發布需另行批准。

## Review Focus

1. 微秒 timestamp 不可經 JS Date 失去精度；舊畫面與 DB 不等時顯示衝突，不能默認當前版本。由 Task 3、4 測試。
2. status 的 not_found／previewed 與 storage 失效不等於原寫入未送達；只能核對原 identity，不建立替代 operation。由 Task 5、6 測試。
3. 一列失敗與整筆 receipt／audit 失敗的交易邊界不同；不可同時回 applied 又回滾其資料。由 Task 4 測試。
4. 搜尋後 counts 與 filteredTotal 不同、待審項消失或 page2 變空，返回不能跳錯列／越界／外洩 q。由 Task 1、2、6 測試。
5. 團體報名是一筆 registration；取消場次上的 correct 與 attended→completed 必須保持既有 RPC 邊界，不能因新 UI 限制而改營運規則。由 Task 3、4、6 測試。

---

## 檔案結構與執行方法

沿用原 worktree；建議以 **Native／superpowers:executing-plans** 逐項執行，因 tasks、返回、operation DTO 及恢復狀態共享介面。未獲准前不啟動實作或 subagents；執行方法隨文件一併審閱。

| 單位               | 修改                                                                                                                                                         | 新增                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| pending read       | `src/lib/volunteers/pending.ts`、`jobs/tasks.server.ts`、`VolunteerTasks.tsx`、`volunteerTasksCopy.ts`                                                       | 新 forward migration；`jobs/tasks.server.test.ts`                                                      |
| 返回               | `tasks.tsx`、`registrations/$id.tsx`、`VolunteerRegistrationDetail.tsx`、`activityReturnState.ts`、`activityRouteState.ts`、`VolunteerActivityWorkspace.tsx` | `registrationReturnState.ts`、`useVolunteerReturnPosition.ts` 及各測試                                 |
| action／command    | `actionEligibility.ts`、`bulk/service.ts`、`http.server.ts`、`repository.server.ts`、`apiResult.ts` 及相關測試                                               | `bulk/attendance.ts`、`attendance.test.ts`、`attendance.database.test.ts`；新 forward migration        |
| UI／恢復           | `ActivityDetailSheet.tsx`、`activityWorkspaceTypes.ts`、`ActivityOperationPanel.tsx`／copy、`VolunteerActivityWorkspace.tsx`、`queryKeys.ts`                 | `ActivityAttendancePanel.tsx`、`activityAttendanceCopy.ts`、`bulk/attendanceRecovery.ts` 及各測試      |
| isolation／journey | 保留現有 fixture／驗收工具的預設行為，只共用已適用的 helpers                                                                                                 | `scripts/fixtures/volunteer-attendance-work.ts`、`.test.ts`、`scripts/verify-volunteer-daily-work.mjs` |

未註明完整路徑的 TSX／copy／返回 helper 均在 `src/components/admin/volunteers/`；route 均在 `src/routes/admin/volunteers/`；bulk 均在 `src/lib/volunteers/bulk/`。不順手改 VolunteerDirectory／reviewer bulk。所有新增檔案與測試使用上述確定名稱；SQL 檔由 CLI 產生真實 timestamp，不在文件虛構未建立的 migration filename。

## Task 0：隔離與改動前任務基線

**Files:**

- Read：`AGENTS.md`、本 spec、`scripts/test-isolated-acceptance.ts`、`scripts/fixtures/volunteer-daily-work.ts` 及現有 runtime／fixture manifest。
- Create：`scripts/fixtures/volunteer-attendance-work.ts`、`scripts/fixtures/volunteer-attendance-work.test.ts`、`scripts/verify-volunteer-daily-work.mjs`。
- Evidence：`docs/evidence/volunteer-daily-work-20261016/`；秘密／sessions 留 ignored `.local-policy-test/volunteer-daily-work-20261016/`。

**Interfaces:**

- `verifyVolunteerAttendanceTarget(evidence: unknown): VerifiedVolunteerAttendanceTarget`：純驗證器，核對 container／network／API／DB／Auth／gateway／worktree／owned run；失敗前不能 import 有副作用的 setup。
- `createVolunteerAttendanceWorkFixture(target: VerifiedVolunteerAttendanceTarget, options:{runId:string;now:Date}): Promise<VolunteerAttendanceFixtureManifest>`。
- manifest 包含 exact actor／profile／activity／registration／operation IDs、兩頁以上 pending／roster、期望狀態、通知 stub 證據及資源 ownership；不輸出 token／密碼。
- `verify-volunteer-daily-work.mjs` 接受 `--mode baseline|candidate`、`--manifest`、`--out`；本輪固定 manifest 為 `.local-policy-test/volunteer-daily-work-20261016/manifest.json`，輸出分別為同目錄 `baseline/`、`candidate/`。同一腳本記 DW-A–F、角色、viewport、clicks／routes／documents／elapsedMs／completion／API counts，未完成步驟不填成功。

- [ ] **Step 1：寫隔離驗證器 RED。** `rejects localhost without container proof`、`rejects mismatched Auth or gateway`、`rejects production project and fallback DATABASE_URL`、`rejects another worktree/run manifest`。用純 fake evidence；斷言 client factory 呼叫為 0。
- [ ] **Step 2：執行 RED。** `bun test --isolate scripts/fixtures/volunteer-attendance-work.test.ts`；預期上述驗證器／行為尚缺而 FAIL。記原 exit code，不能將 import／Docker 存取故障當產品 RED。
- [ ] **Step 3：完成純驗證器及精確 manifest。** 通過 proof 後才建立 client；setup 保存每次 dispatch 前的 identity，未知結果先 reconcile，不能盲重建帳戶。
- [ ] **Step 4：執行 GREEN。** 同一命令必須 PASS，並核對拒絕情境均零連線。
- [ ] **Step 5：唯讀核對實際環境。** 檢查 Docker labels／IDs／網絡、Kong upstream、DB identity／Auth metadata、解析後所有測試 env；56321／56322 只作線索。核對 client import 與 fixture cleanup 不會觸及其他 target。gate 不過只停止依賴寫入的步驟。
- [ ] **Step 6：建立新合成任務及基線。** admin、staff A／B、treasurer、disabled；至少 26 筆 pending 與同場至少 26 筆 roster，含三同名、不同場次、不同出席／資格狀態及團體 registration。固定測試時鐘或相對邊界，不依賴營運 T09 預設；原版不支援的新行為記 fail／not-supported。
- [ ] **Step 7：保存可重複的起點。** 對寫入前後比較使用本輪可丟棄資源的初始 snapshot／clone，保留原 stack 及歷史資料。baseline／candidate 均從同一合成起點開始；不刪 append-only events 湊數。若無法證明 clone ownership，先只量唯讀任務，寫入計時記 blocked。
- [ ] **Step 8：提交可獨立 review 的 fixture／量測工具。** `test: add isolated volunteer daily work task baseline`。證據記 actual paths／SHA／commands／exit codes；這不等於產品 A–F 已通過。

## Task 1：分頁待審判斷資料與 body 搜尋

**Files:**

- Modify：`src/lib/volunteers/pending.ts`、`src/lib/volunteers/jobs/tasks.server.ts`、`src/components/admin/volunteers/VolunteerTasks.tsx`、`volunteerTasksCopy.ts`。
- Test：`pending.test.ts`、`jobs/tasks.database.test.ts`、新 `jobs/tasks.server.test.ts`、`VolunteerOperationsTasksEnglish.test.tsx`。
- Create migration：執行 `bunx supabase migration new volunteer_pending_work_snapshot`，在本 task ledger 記 CLI 回傳的實際 `supabase/migrations/` 路徑；不修改 20261013110248 舊檔。

**Interfaces:**

- 保留 `readPendingSnapshot` 的五參數 RPC adapter 給 overview。
- 新 `readPendingWorkSnapshot(execute:(args:PendingWorkRpcArgs)=>Promise<unknown>, actor:string, raw:unknown, now=()=>new Date()):Promise<PendingWorkSnapshot>`，args 對應 spec 六個 SQL 參數。
- `pendingWorkSnapshotSchema`／`PendingWorkSnapshot` 包含 spec 的附加欄位與 filteredTotal。
- `volunteer_pending_work_snapshot` 六參數；舊五參數 RPC 委派新投影空 query，grants／actor fence 保留。

- [ ] **Step 1：新增 RED。** `returns page-only applicant and session decision fields`；`uses filteredTotal for searched pagination while preserving global pending counts`；`literal query treats percent and underscore as text`；`pageSize zero does not hydrate capacity`；`missing capacity is not zero`。同名短 ID 碰撞、participant_count>1、asOf 相等歸 overdue 亦固定。
- [ ] **Step 2：跑 pure／component RED。** `bun test --isolate src/lib/volunteers/pending.test.ts src/lib/volunteers/jobs/tasks.server.test.ts src/components/admin/volunteers/VolunteerOperationsTasksEnglish.test.tsx`；只接受缺實際欄位／行為的 FAIL。
- [ ] **Step 3：最小 SQL／server 實作。** 先 pending IDs／count／page，再聚合當頁活動 approved participant_count；q100 字、pageSize0–100。handler 不再讀一份全量 pending 再由 browser 篩選；舊 contact／notification 區域行為不變。
- [ ] **Step 4：接待審卡與搜尋。** 共用 hook、POST body、AbortSignal／keepPreviousData；資料更新中暫停過時入口操作。手機主入口 44px；狀態／時間／copy 用既有元件；counts 與 filteredTotal 標籤分開。
- [ ] **Step 5：同命令 GREEN，再通過 isolation gate 後跑 DB。** 用專用 wrapper 設定並執行 `bun test --isolate src/lib/volunteers/jobs/tasks.database.test.ts`。比較 1 列／25 列請求數不隨列數增長，確認 pageSize0 不做列投影；保存新舊 RPC 相容及 role 拒絕。
- [ ] **Step 6：提交。** `feat: show paginated volunteer application decision data`；不宣稱已批准申請或預留名額。

## Task 2：安全返回、Back、頁碼與定位

**Files:**

- Create：`src/components/admin/volunteers/registrationReturnState.ts`、`.test.ts`、`useVolunteerReturnPosition.ts`、`.test.ts`。
- Modify：`VolunteerTasks.tsx`、`VolunteerRegistrationDetail.tsx`、`VolunteerActivityWorkspace.tsx`、`activityReturnState.ts`、`activityRouteState.ts`、`src/routes/admin/volunteers/tasks.tsx`、`registrations/$id.tsx`。
- Test：`activityReturnState.test.ts`、`activityRouteState.test.ts`、`src/lib/admin/workspaceUrl.browser.test.ts` 及既有 fixture。

**Interfaces:**

- `RegistrationReturnState` 及四個 pure helper 名稱／allowlist 完全依 spec §4.3；`ActivityReturnState` 繼續只接受 activities／calendar。
- `useVolunteerReturnPosition({listKey,actorUserId,scopeKey,ready}):{remember:(recordId:string)=>void;restore:()=>void;clear:()=>void}`，只用 DOM／session，不寫 history。
- `detail_page` 只接受 1–100000；舊 URL 缺此欄位預設 1；既有活動 list page 與 roster detail_page 各自獨立。

- [ ] **Step 1：新增 RED。** tasks?pending*scope=overdue&page=2 → 正確申請 → 返回仍 page2；legacy `activity_return*\*` 可往返且不串錯頁；外站／q／actor／token 被剔除；直接網址、無 storage、返回列消失與瀏覽器 Back 有明確 fallback。
- [ ] **Step 2：執行 RED。** `bun test --isolate src/components/admin/volunteers/registrationReturnState.test.ts src/components/admin/volunteers/useVolunteerReturnPosition.test.ts src/components/admin/volunteers/activityReturnState.test.ts src/lib/admin/workspaceUrl.browser.test.ts`。
- [ ] **Step 3：實作 adapter／定位。** 在資料 ready 後還原，不用 timeout 猜資料完成；記 scope／actor，列消失時焦點轉 heading。詳情保留原 mutation，不新增第二套審批。
- [ ] **Step 4：擴充既有 writer。** detail_page、selected、operation、view、filters 同一 writer；刪 q 的原行為不改，禁止第二條無條件 URL effect。
- [ ] **Step 5：同組 GREEN。** 加跑 `activityRouteState.test.ts`；browser contract 斷言一次 mount 正規化最多一次 history 寫入，Back 不產生同步循環；列相同但頁碼／分類不同不可共用錯誤定位。
- [ ] **Step 6：提交。** `fix: preserve volunteer task and roster return context`。

## Task 3：server action projection 與新 command schema

**Files:**

- Modify：`src/lib/volunteers/actionEligibility.ts`、`.test.ts`、`bulk/service.ts`、`service.test.ts`、`activityWorkspaceTypes.ts`。
- Create：`src/lib/volunteers/bulk/attendance.ts`、`attendance.test.ts`。
- Create／extend database tests：`src/lib/volunteers/bulk/attendance.database.test.ts`。

**Interfaces:**

- `attendanceActionCapabilities(input:AttendanceCapabilityInput, now=()=>new Date()):AttendanceActionCapability[]`；`AttendanceCapabilityInput` 含 status、attendance_status、starts_at、ends_at、activity_status，均來自 server 查得資料。
- `AttendanceActionCapability` 為 `{command:"record"|"correct";attendance_status:AttendanceTarget["attendance_status"];allowed:boolean;reason:string|null;requires_reason:boolean}`，reason 使用 spec allowlist。repository 僅在 SQL 回 `attendance_contract:1` 時，以同一 asOf 呼叫此函數；舊 DB 不自行開 capability。
- `attendancePreviewCommandSchema`／`attendanceApplyCommandSchema`／`attendanceLookupCommandSchema`，以及 spec 的 `AttendanceTarget`／`AttendanceFact`／`AttendancePreviewRow`／`AttendanceItemResult`／`RosterAttendanceOperation`。
- `parseRosterAttendanceReply(raw:unknown):RosterAttendanceOperation` 必須 schema 驗證每列 ID、results 集合及 applied event／audit IDs，不接受只回總數的假成功。

- [ ] **Step 1：新增 RED。** 0／26 entries、duplicate UUID、跨 schema 欄位、無 expected timestamp、2000 字 reason、新 key 改 payload、微秒字串、同 target／unchanged、缺 capability、缺 result ID／重複 result ID。
- [ ] **Step 2：執行 RED。** `bun test --isolate src/lib/volunteers/actionEligibility.test.ts src/lib/volunteers/bulk/attendance.test.ts src/lib/volunteers/bulk/service.test.ts`。
- [ ] **Step 3：最小 schema／projection 實作。** 舊 action union 維持相容；新增三種 action 並 normalize request hash。record／correct 邊界及 denial reason 依現行 RPC，不以 profile 級別或新候補政策擅增資格限制。
- [ ] **Step 4：執行 GREEN。** 同一命令通過；斷言時間用 injectable clock、expected_updated_at 原字串未重編碼；正規化 entry 排序後同 payload hash 相同。
- [ ] **Step 5：建立 DB parity RED 清單。** 對 record／correct 每個 target、未開始／已開始／已結束、approved／waitlisted／cancelled、活動取消、既有 attended／no_show，逐個比較 projection 與實際 RPC 的允許／拒絕。先保留尚缺 server projection 的 FAIL，Task 4 接 SQL 後 GREEN。
- [ ] **Step 6：提交 pure 契約切片。** `feat: define scoped volunteer attendance contracts`。未接 backend capability 前 UI 仍不可執行新流程。

## Task 4：逐人 CAS、部分結果及原子收據

**Files:**

- Modify：`src/lib/volunteers/bulk/repository.server.ts`、`http.server.ts`／`.test.ts`、`apiResult.ts`／`.test.ts`（必要的精確新 code mapping）；新增 repository 接線測試 `bulk/repository.server.test.ts`。
- Test：新 `bulk/attendance.database.test.ts`；既有 `attendance.database.test.ts`、`bulk/bulk.database.test.ts`、`bulk/mandatoryScenarios.database.test.ts`。
- Migration：`bunx supabase migration new volunteer_roster_attendance_receipts`，記下產生的真實路徑。
- RLS：新增 `supabase/rls-tests/volunteer-roster-attendance.test.ts`；沿用既有 suite target wrapper。

**Interfaces:**

- `public.volunteer_roster_attendance_command(p_actor uuid,p_command jsonb) returns jsonb`，只承接三個新 action，保存於原 operation table。
- 新內部 `public.volunteer_roster_attendance_result(p_operation public.volunteer_bulk_operation) returns jsonb`，回 spec DTO。
- 舊 `volunteer_bulk_result` 僅對 roster_attendance 分派新 projection；status 仍使用原 operation_id。舊 bulk apply 對 roster action 拒絕，不改其他 branch。
- 新／舊 repository 都只執行一次對應 RPC；HTTP 混合結果為 200／逐人 kind，輸入 400／422、身份 401／403、無 operation 404、payload mismatch 409、fatal transaction 500，全部 no-store。

- [ ] **Step 1：寫 DB／HTTP RED。** `only selected page registration IDs are applied`；`concurrent stale row conflicts while another row applies`；`replayed operation returns identical receipt after later correction`；`legacy apply cannot execute roster operation`；`foreign actor cannot read lookup/status/apply`。
- [ ] **Step 2：跑 RED。** pure HTTP／repository：`bun test --isolate src/lib/volunteers/bulk/http.server.test.ts src/lib/volunteers/bulk/repository.server.test.ts`；通過 target gate 後以 wrapper 跑 `bun test --isolate src/lib/volunteers/bulk/attendance.database.test.ts`。不得以未知 DB／migration 未準備的連線失敗充當 CAS RED。
- [ ] **Step 3：新增 forward migration。** 核對當前函數而非還原舊全文，保留 7d70df5d 及兩次 workspace projection 修復。detail 只增 `attendance_contract:1`／asOf／participant_count；repository 加純 action projection。依 spec §5.4 執行鎖順序、鎖後 actor recheck、同 actor preview key、page 子集、30 分鐘、每列 subtransaction 與整筆 receipt commit。
- [ ] **Step 4：補故障注入。** A success／B stale／C 僅成功 attendance audit insert 被 synthetic trigger 拒絕：A applied、B conflicted、C failed，attempt audit 可保存；另一測試令 receipt 或 attempt audit 故障，斷言 A 亦 rollback、沒有 partial-success response。trigger 只在本輪 owned clone／transaction，用 finally 核對移除，不能作用其他 fixture。
- [ ] **Step 5：補冪等／取消／安全矩陣。** 同 operation 並行 apply 只一組 event／audit；completed 逾期仍回原收據；未執行逾期無 event；preview／取消業務表 hash 不變；跨場／跨頁／非 owner／停用／鎖等候時撤權均拒絕；event append-only、PUBLIC／anon／authenticated 無新 RPC grant。
- [ ] **Step 6：執行 GREEN 及舊 SQL 回歸。** wrapper 跑 `bun test --isolate src/lib/volunteers/bulk/attendance.database.test.ts src/lib/volunteers/attendance.database.test.ts src/lib/volunteers/bulk/bulk.database.test.ts src/lib/volunteers/bulk/mandatoryScenarios.database.test.ts`；記 actual pass／skip／fail。依此輪 verified target 執行新增 RLS 檔，不能從 unit 的 role stub 推定 RLS 通過。
- [ ] **Step 7：提交。** `feat: persist per-registration attendance outcomes atomically`。保存 migration 前後定義／grants、舊 commands 相容及不發 sender 證據。

## Task 5：側板草稿、逐人預覽及斷線恢復

**Files:**

- Create：`src/lib/volunteers/bulk/attendanceRecovery.ts`／`.test.ts`、`src/components/admin/volunteers/ActivityAttendancePanel.tsx`／`.test.tsx`、`activityAttendanceCopy.ts`。
- Modify：`ActivityDetailSheet.tsx`、`VolunteerActivityWorkspace.tsx`、`activityWorkspaceTypes.ts`、`ActivityOperationPanel.tsx`／`activityOperationCopy.ts`、`src/lib/volunteers/queryKeys.ts`／`.test.ts`。
- Extend：`VolunteerActivityWorkspaceEnglish.test.tsx`、`src/lib/admin/actorBoundRequest.test.ts`、`workspaceUrl.browser.test.ts`。

**Interfaces:**

- `AttendanceRecoveryState` 固定 draft／previewing／previewed／applying／outcome_unknown／results／saved_refresh_failed；保存原 actor、preview key、operation ID 及 apply intent。
- `reduceAttendanceRecovery(state:AttendanceRecoveryState,event:AttendanceRecoveryEvent):AttendanceRecoveryState` 是 pure reducer；event union 依 spec §6 的固定事件及 identity fencing，不新增自動重送事件。
- `createAttendanceController({send,savePointer,readPointer,invalidate,onState})` 不 import DB／Supabase server，依賴固定為：
  - `send(command:AttendanceCommand, expectedActorUserId:string):Promise<unknown>`。
  - `savePointer(pointer:AttendanceOperationPointer):Promise<"session"|"url"|"memory">`；必須核對保存／URL readback 完成後才 resolve。
  - `readPointer(actorUserId:string):AttendanceOperationPointer|null`；URL pointer 仍需 server status 驗 owner。
  - `invalidate():Promise<void>`；直接使用會 throw 的集中 invalidation，不能用吞掉錯誤的 refresh helper。
  - `onState(state:AttendanceRecoveryState):void`。
- `AttendanceOperationPointer` 為 `{actorUserId:string;previewKey:string|null;operationId:string|null;phase:"previewing"|"applying"|"outcome_unknown"}`。memory 模式只可做沒有業務寫入的 preview；apply 前必須有 session 或安全 URL 的 operation ID，否則停止確認。
- `ActivityAttendancePanel` 以目前 activity／page rows、server asOf／capability、actorUserId、恢復 controller 及單一 writer 的 onOperationChange 作 props。資料讀取不每列請求，沒有新的 query-provider。

- [ ] **Step 1：寫 reducer／component RED。** 本頁最多25、逐人不同 targets、group人數、disabled原因、correct理由、取消無 apply、double click1次、版本 refetch使preview失效但unknown pointer不丟失。applying／outcome_unknown 收到 CANCEL_PREVIEW 不能清空原操作或退回可重送的 draft。
- [ ] **Step 2：寫恢復 RED。** preview400／422保留草稿、409先lookup且5xx不得當作輸入拒絕；dropped preview→lookup原key；lookup not_found不得新keyapply；dropped apply→status原ID；status previewed只能人工同ID重試；status失敗保持unknown；同ID重試原call仍在途不產生第二event；storage拒絕時保留URL恢復；身份切換不能送舊actor。
- [ ] **Step 3：執行 RED。** `bun test --isolate src/lib/volunteers/bulk/attendanceRecovery.test.ts src/components/admin/volunteers/ActivityAttendancePanel.test.tsx src/lib/volunteers/queryKeys.test.ts src/lib/admin/actorBoundRequest.test.ts`。
- [ ] **Step 4：實作 controller／panel。** 每列 before／target／skip 顯示在確認前；結果逐人顯示。單人同樣走一列 operation；results schema 驗證失敗視為 unknown，不能 toast success。HTTP 200 不代表全成功。
- [ ] **Step 5：接 operation restore／identity／query。** 新舊 operation 以 action及schema分辨；同一 writer 放 operation UUID，不加 URL effect。attendance 用既有集中 invalidation；receipt 優先於 refetch 狀態，refresh失敗重試只讀。舊 bulk 如顯示逐人結果，只呈現 SQL實際回傳的 ID／kind／reason，不推測姓名／成功名單。
- [ ] **Step 6：同組 GREEN，補中英文及 browser regression。** 加跑 `VolunteerActivityWorkspaceEnglish.test.tsx`、`workspaceUrl.browser.test.ts`；缺 backend capability 時只可開原詳情，不能走 legacy 整場apply；檢查 loader／空／錯／部分成功各有獨立狀態與焦點。
- [ ] **Step 7：提交。** `feat: record and recover attendance within the session roster`。

## Task 6：同版本 admin／staff 任務、效能及完整 gates

**Files:**

- Extend：Task 0 的 fixture／`scripts/verify-volunteer-daily-work.mjs`。
- Evidence：`docs/evidence/volunteer-daily-work-20261016/` 的 receipts、DW-A–F ledger、同版本桌面／手機截圖、benchmark、rollback 說明。
- 保留所有 RED／失敗重跑／慢樣本；證據不含 credentials、session、完整 compiled runtime 或舊 evidence ZIP 的重包。

**Interfaces:**

- 每案輸出 `{caseId,role,sha,environment,fixtureId,viewport,expected,actual,status,command,exitCode,artifactPath}`；只有執行過才有 exitCode。
- baseline／candidate metrics 另含 `clicks,routeTransitions,documentNavigations,elapsedMs,completed,attempts,requestCounts`；無法完成的原版案例不得填造 elapsed completion。
- 操作結果證據以原 operation ID join DB event／audit，報告只放必要 synthetic IDs／安全原因。

- [ ] **Step 1：檢查 A–F browser assertions 在 baseline 失敗。** 讓同一腳本保留所有可完成／無法完成案例，失敗必須是實際缺口，不是 timeout／fixture設定錯誤；不弱化 assertion。
- [ ] **Step 2：在 candidate 完成 admin 及 staff A–F。** 使用真實隔離 Auth／HTTP／DB；staff B 製造 C 競態。桌面1440×900、手機390×844、300%zoom；兩個角色都要全旅程，不用admin身份假裝staff。單獨列自動化合成staff與真人職員UAT。
- [ ] **Step 3：注入 D／E。** browser／local transport 丟失指定 response、延遲status、單筆及receipt failure；核對DB沒有重複events、取消零業務寫入、correct需reason、成功與failureattempt audit正確；所有外部sender為stub。保留unknown與saved_refresh_failed畫面。
- [ ] **Step 4：驗請求及效能。** pending／q／page2／roster各first1+warm30，固定同一合成起點、runtime／冷暖條件，記真實counts及所有慢樣本；read p95≤750ms。mutation若量則31組獨立輸入與1000ms，否則明示未量。對比1／25列無N+1、無重複request或整頁reload，300ms／IME／signal／返回保護仍在。
- [ ] **Step 5：執行 targeted GREEN 並固定產品 candidate commit。** 修復可重現問題；每次 source 改動後重跑適用測試，不引用前次SHA。記實際commit及worktree clean狀態。
- [ ] **Step 6：同產品 SHA 完整 gates。** 以已核實環境及private wrapper依次跑下列命令，記exact command／env檔指紋／exitCode／log；禁止印出secret：

  ```text
  bun run typecheck
  bun run test
  bun run lint
  bun run build
  bun run test:acceptance:db
  bun run test:acceptance:rls
  bun run verify:brand
  node scripts/verify-volunteer-daily-work.mjs --mode candidate --manifest .local-policy-test/volunteer-daily-work-20261016/manifest.json --out .local-policy-test/volunteer-daily-work-20261016/candidate
  ```

  上述是通過 Task0 target gate 後才可執行的命令，**不是已跑 receipt**。完整 unit run 明確禁止未知 DB／外部 provider；DB／RLS 的固定56321目標與任何新clone不同時，先核對wrapper，不改目標後直接跑。只讀 performance manifest 仍受 endpoint＋strict schema allowlist 控制；新 preview／apply 絕不因 caller 宣稱 read 而降級，新增 body 欄位亦須跑既有 `scripts/verify-admin-performance.test.ts`。

- [ ] **Step 7：核對 build provenance 及重跑最終旅程。** CI brand fixture build 與真實local Auth build分開封存／記來源；手機及桌面截圖必須同產品SHA，不能用上一輪brand圖。完整gates改動DBcounts後不沿用先前效能cohort宣稱同條件。
- [ ] **Step 8：交付證據與回退。** `docs: record volunteer daily work isolated acceptance` 如只增證據，註明產品tested SHA及證據commit，並驗證兩者產品tree相同；若交付SHA含任何產品改動，重新跑全部必要gates及角色journey。任何新故障不藏在docs提交。

## 審閱、完成標準與停止位置

本次文件審閱重點為：明確本頁registration選取、逐人CAS／結果、成功項目終態冪等、preview取消的技術快照區別、部分失敗與整筆receipt失敗、未知結果的原ID恢復，以及不擴大權限／營運規則。

本輪程式完成須有全部對應 RED→GREEN、同版本 source gates、適用 DB／RLS 及兩角色桌面手機證據；真人staff UAT、正式環境及發布仍各自分欄，不由合成角色結果代替。

在使用者審閱並批准本 plan／spec 及執行方法前停在文件階段。普通程式／測試問題在實作獲准後自行診斷，無需逐步問 continue；遇真正 target identity、權限或營運衝突，只停依賴該問題的部分，給具體證據與最小下一步。

## 文件自查

- spec §4 → Task1／2；§5.1／5.2／5.3 → Task3／4；§5.4 → Task4；§6 → Task5；§7 → Task0／4／6；§8／9 → Task6。
- Review Focus 五項均有具名測試歸屬；新 helper／schema／RPC／DTO 名稱在前後 task 一致。
- 新 migration filename 由CLI建立時記錄；沒有預先產生SQL或執行migration。所有產品步驟維持未勾選。
- 本文件與 spec 是供審閱的設計；沒有把 expected PASS、測試範例、gate 命令或歷史數字當成實際執行。
