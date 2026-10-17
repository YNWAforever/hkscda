# HKSCDA Volunteer Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 恢復可診斷的排程，接通待辦／報名，保留日期範圍並顯示真實通知工作。

**Architecture:** 以現有job repository、task RPC、活動工作台及readiness為基礎；新增向後相容欄位及集中資料讀取，不建立第二套審批或通知系統。

**Tech Stack:** 遵循主計劃及repo lockfile。

**Spec:** 本包根目錄主計劃、原F01–F04／F09／F10及補充F14。

## Global Constraints

主計劃Global Constraints全部適用。修改舊migration無法更新已部署DB：以新的timestamp migration替換函數。下列「新增」路徑為本計劃設計，尚未存在；執行時若已有同責任模組，合併到現有位置並更新此計劃。

## Review Focus

以actor缺少／停用、過期pending、香港午夜、通知API局部失敗及未儲存草稿為重點；分別由T01、T02、T04及T10測試。

## T01 actor preflight及readiness（F01）

**Files:** 修改`src/lib/volunteers/jobs/{service.ts,repository.server.ts,service.test.ts}`、`src/routes/api/jobs/volunteers.ts`、`src/lib/operations/readiness.server.ts`及其既有測試、`docs/background-jobs-runbook.md`；新增`src/lib/volunteers/jobs/config.ts`及`config.test.ts`。

**Interfaces:** 新增`parseVolunteerJobActorId(raw: string | undefined): string`，缺少／空白／非UUID拋出有固定code的配置錯誤；不把raw值放訊息。擴充`VolunteerJobRepository.preflight(): Promise<void>`，用既有actor查詢驗證active admin。service先claim，再preflight，再業務階段；claim／finish屬run記錄，preflight失敗不得進generate。readiness加入`volunteerJobs` feature，讀取設定及actor資格，不claim、不執行任務。

- [ ] 寫`config.test.ts`：undefined、空字串、空白、`not-a-uuid`均拒絕；合法fixture UUID通過。錯誤序列化不得包含提供的raw字串。
- [ ] 擴充service測試：preflight拒絕時只出現claim、preflight、finish(failed)，generate／release／promote／assess／defer全部0次；duplicate claim仍不執行任何業務階段。
- [ ] 跑`bun test --isolate src/lib/volunteers/jobs/config.test.ts src/lib/volunteers/jobs/service.test.ts`，先確認測到缺失介面／行為，再完成最小實作及更新所有fake repository。
- [ ] 在repository沿用active admin查詢及資料庫授權，不找第一個可用admin、不省略actor。readiness對配置缺少／無效／不存在／停用回明確feature code，維持CRON_SECRET及no-store。
- [ ] 跑上面兩檔及`src/lib/operations/readiness.server.test.ts`；專用DB驗證actor存在／停用／非admin，確認業務表零寫入。
- [ ] 提交`fix: validate volunteer job actor before domain work`。runbook列出配置只由發布負責人核對、更新需redeploy；本地測試不讀production秘密。正式3週期驗收留T13。

## T02 統一pending計數與清單（F02）

**Files:** 修改`src/lib/volunteers/{overview.ts,overview.server.ts,overview.test.ts}`、`src/lib/volunteers/jobs/tasks.server.ts`、`VolunteerOverview.tsx`／`VolunteerTasks.tsx`及各copy；新增`src/lib/volunteers/pending.ts`、`pending.test.ts`、`jobs/tasks.database.test.ts`及新SQL migration。

**Interfaces:** `PendingScope = "upcoming" | "overdue" | "all"`；`PendingCounts = { upcoming: number; overdue: number; total: number; asOf: string }`。新增RPC `volunteer_pending_snapshot(p_actor uuid, p_scope text, p_page integer, p_page_size integer, p_as_of timestamptz) returns jsonb`，回`{counts, registrations, page, pageSize}`；overview用pageSize=0只取count，task list用25。scope為上述enum、page≥1、pageSize限0–100。server提供asOf且mutation仍用當前server時間驗證；讀取snapshot不能作批准憑據。已驗證actor的共用SQL投影依同一asOf定義：upcoming為starts_at>asOf，overdue為starts_at≤asOf，total為兩者和。保留原`pendingRegistrations`欄位相容；新增breakdown，null代表讀取失敗。task list新增scope／page，舊`{action:"list"}`保持接受。

- [ ] 固定時間fixture：1筆已過期pending、1筆未來pending、1筆恰好asOf、1筆approved。測upcoming=1、overdue=2、total=3；已過期不可直接消失，取消／已拒絕不計pending。
- [ ] 用新migration集中共用pending投影，overview計數及task list讀同一predicate，保留現有RLS／actor check／search_path及grants。若原函數還處理contact／outbox，保留其行為。
- [ ] 總覽卡改導向`/admin/volunteers/tasks?pending_scope=all`，待辦提供即將開始／逾期未處理；每筆顯示可到報名詳情的下一步。不要再用不支援的activity registration_status假裝已篩選。
- [ ] 舊`activities?registration_status=pending`作明確相容導向至待辦all，保留其他安全返回狀態；不默默丟參數。時間分類由server snapshot主導，跨兩次不同asOf或有併發寫入時不要求數字永不變，UI需顯示更新時間。
- [ ] 跑`bun test --isolate src/lib/volunteers/pending.test.ts src/lib/volunteers/overview.test.ts`，再於專用DB跑`bun run test:acceptance:db`；UC02／UC03／UC28用同fixture核對。
- [ ] 提交`fix: align volunteer pending counts and task scope`。回退UI不刪申請；新欄位與舊呼叫保持相容。

## T03 報名入口、狀態標籤及返回（F03、F09）

**Files:** 修改`ActivityDetailSheet.tsx`、`activityOperationCopy.ts`、`VolunteerRegistrationDetail.tsx`、對應路由`src/routes/admin/volunteers/registrations/$id.tsx`；既有`src/lib/volunteers/labels.ts`、`volunteerFormatCopy.ts`；新增`activityReturnState.ts`及測試。

**Interfaces:** `ActivityReturnState = { from: "activities" | "calendar"; safeSearch: Record<string, string> }`；`readActivityReturnState(params: URLSearchParams): ActivityReturnState`只接受內部activities／calendar目的地與T04已知安全filter/date_scope/page/view/selected；禁止任意return URL與q。`buildActivityReturnHref(state: ActivityReturnState): string`回同站相對路徑。DTO不傳auth或聯絡資料作URL狀態。此任務依T02及T04，T04可在A批先完成。

- [ ] 測側板每筆報名都產生對應詳情Link，UC06／UC07可找到正確ID；zh的approved／waitlisted／not_marked使用現有formatter及StatusBadge語意，未知狀態顯示可核對fallback。
- [ ] 測外站return URL被忽略、安全page/filter保留、q被剔除；實作使用TanStack Link，不新增另一套status mutation。
- [ ] 在既有`VolunteerRegistrationDetail.test.tsx`及`VolunteerActivityWorkspaceEnglish.test.tsx`加入中英文對應；跑兩檔與return state測試，檢查零中文硬編在元件。
- [ ] 用隔離staff打開活動→報名→核對→返回；驗證過期／無權限動作仍由server拒絕，不能為接通入口而放寬既有規則。
- [ ] 提交`fix: connect volunteer activity registrations to review`。data invalidation由T06集中，這裡不要新增另一組散落key。

## T04 日期狀態round-trip（F04）

**Files:** 修改`VolunteerActivityWorkspace.tsx`；新增`activityRouteState.ts`及`activityRouteState.test.ts`。必要時擴充既有`useListQueryState`介面，不改其其他模組語意。

**Interfaces:** `ActivityDateScope = "future" | "history" | "all" | "custom"`；`ActivityUiFilters = ActivityFilter & { date_scope: ActivityDateScope }`；`readActivityRouteState(params, today)`及`writeActivityRouteState(params, state)`為pure函數；`toActivityApiFilter(ui): ActivityFilter`移除date_scope。RPC filter是strict schema，不能直接送新增UI欄位。

- [ ] `all→write→read`維持from/until undefined；未提供scope的舊URL且有兩日期為custom；完全無日期／scope才採原future30day預設。
- [ ] 測invalid date、from>until、未知scope、page<1／過大、香港午夜及閏日；history截止前一個香港日，custom不被日曆翻頁覆蓋。
- [ ] 執行`bun test --isolate src/components/admin/volunteers/activityRouteState.test.ts`先見失敗，再實作／接回initial與ACTIVITY_ROUTE，消除兩套解析規則。
- [ ] 測API body不含date_scope；既有bulk schema、中文IME及選取失效測試仍通過。UI驗UC05／UC49：reload、新分頁、back／forward保留範圍，切篩選仍清空bulk selection。
- [ ] 提交`fix: preserve volunteer activity date scope in URLs`。

## T10a 排程診斷與健康（F10，依T01）

**Files:** 修改jobs `service.ts`及測試、`telemetry.server.ts`、overview讀取／copy；新增`jobs/errors.ts`及測試、`jobs/health.ts`及測試。

**Interfaces:** `VolunteerJobStage = "preflight" | "generate" | "release" | "promote" | "assess" | "defer" | "finish"`；`safeJobFailure(error: unknown, stage, correlationId): { code: string; stage; correlationId: string }`只允許安全code，未知轉UNEXPECTED。`readVolunteerJobHealth(actor): Promise<{lastSuccessAt: string|null; lastFailureAt: string|null; consecutiveFailures: number; state: "healthy"|"degraded"|"unknown"}>`不回raw provider／SQL訊息。

- [ ] 測plain object `{code:"22P02",message:"private"}`保留22P02／stage而不保存private；finish自身失敗時仍記錄原階段，不讓cleanup錯誤蓋過首個錯誤。
- [ ] 測兩次連續失敗或超過兩個排程週期沒成功為degraded；查詢失敗為unknown而非healthy；恢復成功保留歷史。
- [ ] 保留現有runtime run記錄及lease，加入安全diagnostic和overview健康投影。staff只見工作受阻及找管理員，配置詳情admin才可見。
- [ ] 跑jobs/errors、health及service tests，再驗UC15／UC16／UC40；提交`fix: expose safe volunteer runtime job health`。

## T10b 評核通知首次載入（F14，依T06）

**Files:** 修改`VolunteerAssessments.tsx`、`assessmentsCopy.ts`、`QualificationsAssessmentsEnglish.test.tsx`；使用T06 `assessment`及`assessmentJobs` keys；新增`assessmentQueries.ts`及測試。

**Interfaces:** `assessmentListingQueryOptions(fetcher)`呼叫POST assessments `kind:list`；`assessmentJobsQueryOptions(fetcher)`呼叫現有GET jobs。兩者獨立結果／錯誤，jobs不觸發retry mutation。沿用現有`AssessmentListing`／`AssessmentJob`型別，不將runtime runs混入notification outbox。

- [ ] 測兩個queryFn可各自成功／失敗，清單3筆如實顯示，jobs失敗不轉[]；initial props仍支援既有預览／測試用途。
- [ ] 改為平行讀取，頁面首次掛載即啟動兩項；重試單筆成功只失效jobs。保留admin-only API及送達語意。
- [ ] 草稿用dirty與loaded revision分離：首次成功hydrate一次；dirty期間query更新只提示新版本，明確重載才替換。不得在每次refetch useEffect中setP覆蓋使用者。
- [ ] 跑assessmentQueries新測試與既有中英文測試；用local browser完成UC47／UC48：首次jobs讀取、單區500、未儲存欄位及版本衝突。
- [ ] 提交`fix: load assessment notifications without replacing dirty drafts`。本輪沒有實作或執行此UAT。
