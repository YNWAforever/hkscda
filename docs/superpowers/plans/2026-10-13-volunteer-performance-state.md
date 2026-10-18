# HKSCDA Volunteer Performance and State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 有效量測13頁API，減少整頁載入及多餘讀取，同時保持身份、容量與跨頁資料正確。

**Architecture:** 先統一query key及mutation影響，再換站內導航與安全搜尋；量測按指令的業務語意分類，沿用現有server timing和專用fixture工具。

**Tech Stack:** 遵循主計劃及repo lockfile。

**Spec:** 主計劃、F05–F07／F12／F15／F16、Page_Implementation_Matrix.csv。

## Global Constraints

主計劃Global Constraints全部適用。所有POST都保持授權及no-store；private response不得進共享CDN快取。效能結果必須與同版本、同fixture及同測量來源比較。

## Review Focus

POST read偽裝mutation、未知command偽裝read、身份切換、中文組字、過期query回應及已儲存但refetch失敗，由T05–T07測試；region收益未證明前不得直接切production。

## T05a 修正效能工具（F16）

**Files:** 修改`scripts/verify-admin-performance.mjs`及`.test.ts`、`scripts/fixtures/admin-performance.ts`、`artifacts/performance/README.md`；新增`scripts/fixtures/volunteer-performance-manifest.ts`及測試。

**Interfaces:** manifest v2新增`dataset: { domain: "supporters" | "volunteers"; counts: Record<string, number> }`，保留舊supporterCount格式的相容讀入；報告保留真實counts。scenario新增`operationType: "read" | "mutation"`及read `requestBody?: unknown`；mutation仍用31個不同`requestBodies`。`classifyScenario({path, method, operationType, requestBody})`只有GET或已核對的POST command allowlist可分類read；缺欄位的舊POST維持mutation。

- [ ] 在既有工具測試加入POST bulk `action:list`用相同body31次、warmSamples=30、targetMs=750；unknown／apply／preview／select標read必須在fetch前拒絕。保留GET、same-origin與production alias拒絕測試。
- [ ] 保留mutation沒有旗標即拒絕、31個獨立body、targetMs=1000；不要因POST read例外而放寬所有POST。handler外形用路徑正規化處理現有尾斜線，不接受跨origin或任意route。
- [ ] 建allowlist：bulk=list/templates/detail；tasks=list；settings/sources/daily-settings/operations/qualifications/simulation=list；assessments使用`kind:list`。新people及group-enquiries body搜尋待T07 schema確定後加入。未知指令不推測為read。
- [ ] 跑`bun test --isolate scripts/verify-admin-performance.test.ts`先看新增案失敗，再修分類、body發送及門檻；確認31個實際相同read body，而非偽造不同filter。
- [ ] 擴充manifest fixture builder與格式測試，volunteer counts用實際建立數量；可以由小資料集起步並明記，不能硬填supporterCount=1000。報告不保存body／姓名／email／token。
- [ ] 提交`fix: benchmark volunteer POST reads by command semantics`。UC50由目前fail轉為修復後通過須保留新測試結果；本包現有probe只是故障重現。

## T05b 分階段timing（F05）

**Files:** 修改`src/lib/volunteers/telemetry.server.ts`、`src/lib/admin/session.server.ts`及既有測試、相關volunteer HTTP／handler／repository，新增`src/lib/volunteers/telemetry.server.test.ts`。

**Interfaces:** `VolunteerTimingStage = "auth" | "role" | "rpc" | "serialize"`；`createVolunteerTiming(now: () => number)`回`measure<T>(stage, operation): Promise<T>`及安全snapshot。`getAdminUserFromRequest`現有options新增可選`observeTiming(stage: "auth" | "role", durationMs: number)`及測試clock；`requireAdmin`新增向後相容可選options並傳入。絕不改`activatePendingInvite`預設及授權順序。

- [ ] 用fake clock驗成功及丟錯仍有duration、無負值；action只允許靜態schema枚舉，raw q／actor／payload不進log。observer自身故障不改業務結果。
- [ ] 對auth.getUser、admin_user lookup、domain RPC及JSON serialization分段；現有總duration保留。bulk用`bulk_list`／`bulk_templates`／`bulk_detail`等常數；驗證失敗用固定invalid label，不拿request字串作label。
- [ ] 401／403／409／500保持原status，response headers維持no-store。Server-Timing合併既有欄位；response body只建立／傳送一次。
- [ ] 跑`bun test --isolate src/lib/volunteers/telemetry.server.test.ts src/lib/admin/session.server.test.ts`及受影響HTTP測試；保存每一代表API的stage欄位，不在production批量壓測。
- [ ] 提交`perf: add scoped volunteer request stage timings`。

## T06 集中query key及失效集合（F12）

**Files:** 新增`src/lib/volunteers/queryKeys.ts`及`queryKeys.test.ts`；修改13頁相關queries／mutations，以及`VolunteerRegistrationDetail.tsx`、`VolunteerPersonDetail.tsx`和ReviewerBulkPanel。

**Interfaces:** `volunteerQueryKeys`提供現有prefix的readonly tuple及完整key factory；至少覆蓋overview、tasks、workspace、workspaceDetail、workspaceTemplates、calendarSummary、directory、person、registration、qualifications、operations、policySettings、policySources、dailySettings、simulation，新增assessments及assessmentJobs。`invalidateVolunteerQueries(client, change: VolunteerChange): Promise<void>`採明確change union：registration、attendance、qualification、reviewerAssignment、activity、policy、source、dailyQuota、assessment、notification。

| Change | 必須刷新 |
|---|---|
| registration／attendance | registration、workspace、workspaceDetail、calendarSummary、overview、tasks、directory、person；影響operations的預約資料時一併刷新 |
| qualification | qualifications、directory、person、overview、simulation資格候選 |
| reviewerAssignment | directory、person及實際包含責任人的待辦 |
| activity／policy／dailyQuota／source | 對應設定、workspace／detail／templates、calendarSummary、overview coverage、simulation；按SQL實際影響分支 |
| assessment | assessments、assessmentJobs、qualifications、directory、person、overview |
| notification | 對應notification list、tasks；不順便更改身份／資格 |

- [ ] 用實際QueryClient seed目前`volunteer-workspace`與detail／calendarSummary keys，registration成功後確認相關資料invalidated；包含舊`volunteer-activities`未命中的回歸，不能只測函數回傳同一陣列。
- [ ] 保留prefix相容逐頁替換，不同filter/page/detail/history不得混key；月曆路由與活動共用workspace，總覽calendarSummary仍是不同API。
- [ ] 只有server成功才觸發成功流程；409／validation fail不optimistic顯示批准。已寫入成功但refresh失敗顯示「已儲存，重新載入失敗」，不要讓使用者誤以為寫入未完成而重送。
- [ ] 用UC43測同一QueryClient內多個已掛載視圖。跨瀏覽器／跨裝置需獨立同步策略，本輪不能把client invalidation冒稱跨裝置即時同步。
- [ ] 驗UC51身份切換：取消正在飛行的前一身份讀取、移除受保護query及分頁搜尋狀態；既有expectedActorUserId mutation防護不得移除。
- [ ] 跑新key測試、既有registration／directory／actorBoundRequest測試；提交`fix: unify volunteer query invalidation`。只有這步成立才在T08增加staleTime。

## T07 站內導航及安全搜尋（F06、F07、F15）

**Files:** 修改Overview、Directory、PersonDetail、GroupEnquiryManagement、QualificationProfileSearch、PolicySources、PolicySimulation內部連結；`directorySearch.ts`、`useListQueryState.ts`、directory HTTP／schemas／tests及people API route。團體查詢的新POST搜尋由`src/lib/groupEnquiries`既有handler factory承接，路由為`src/routes/api/admin/volunteers/group-enquiries.ts`。

**Interfaces:** people新增POST讀取，body使用既有`DirectoryQuery` schema，與GET保留同等authorize/read/no-store；GET繼續服務不含q的安全filter/detail。group-enquiries的POST僅接受`{action: "search", query: { q, status, page }}`，沿用既有query驗證及最小回傳DTO；PATCH仍只做原有更新。部署相容期先保留舊GET q，UI停止產生它，日誌立刻剔除q，再按使用量淘汰。

- [ ] 將原Directory GET form改受控submit／300ms共用列表狀態；中文composition期間不查詢；clear回第1頁及清除本分頁q。group查詢接相同state與AbortSignal。
- [ ] 所有API自由文字搜尋改body，連結不包含q。session搜尋按登入身份隔離，登出／切換清除；storage不可用時維持記憶體模式。不得把session中的q轉回分享URL。
- [ ] 改應用內a為TanStack Link／navigate；mailto、下載及跨站連結保留適當原生行為。頁內anchor保留，不將它們當成整頁載入問題。
- [ ] 對people新POST測匿名401、staff/admin可讀、treasurer403、invalid body400、oversized body413；使用既有readAdminJson上限及log allowlist，不把raw body寫入console。
- [ ] 測查詢變化300ms只發一次、IME0次、signal aborted、慢舊請求不污染新結果、filter更換使選取及page失效。keyboard submit與clear都可用。
- [ ] 跑既有Directory、GroupEnquiryManagement、directory HTTP及共用list狀態測試；local browser驗UC09–UC11／UC43／UC51／UC52，記document導航次數及可操作時間。
- [ ] 提交`perf: preserve volunteer workspace navigation and safe search state`。將新POST read schema登記到T05a allowlist，不為GET相容期承諾已清除所有歷史日誌。

## T08 根據量測調整（F05）

**Files:** 僅依T05證據修改有瓶頸的repository／RPC／SQL migration；可能使用的部署配置為`vite.config.ts`、`vercel.json`及Nitro產物，不能預設這些檔一定需要改。低變動client queries由T06統一配置。

**Interfaces:** 量測輸出沿用T05 v2 schema；每個候選有baselineCommit、candidateCommit、fixtureId、sourceLocation、actualFunctionRegion及至少31個樣本。

- [ ] 先把13頁分成首屏必需、展開後才需、共用低變動資料，按Page Matrix量測。settings的source與list、overview的stats與calendar可平行，但禁止先執行需上一個結果的寫入。
- [ ] 若auth／role為主因，優化可重用的request內資料而非跨request繞過驗證；若RPC主因，讀EXPLAIN並測索引／範圍／pagination；若payload主因，保留摘要和按需詳情，不能把缺少字段當0。
- [ ] 初次只允許低變動sources／templates考慮30秒client staleTime；需要的mutation invalidation及身份測試先通過。容量／資格／審批決策每次server驗證，不用client TTL批准。
- [ ] 對region候選核對實際function配置，在獲准private preview用同SHA與DB比較香港及第二來源；沒有顯著且穩定收益就保留目前配置。此任務不是預先授權deploy。
- [ ] 執行`node scripts/verify-admin-performance.mjs <已生成的隔離manifest檔>`，以實際shell路徑代入，記read/mutation門檻、錯誤率、首次及warm。token透過本地安全環境注入，報告不打印。
- [ ] 同一版本再跑UC41及UC43；每個有實際收益的獨立改動才commit `perf: ...`。未達標時提交剩餘瓶頸及證據，不能填造改善百分比。
