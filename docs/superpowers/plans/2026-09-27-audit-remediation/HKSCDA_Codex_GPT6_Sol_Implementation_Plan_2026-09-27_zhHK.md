# HKSCDA Audit Remediation Implementation Plan

> **For agentic workers:** 使用 `superpowers:executing-plans`（如環境提供）逐項執行，以 `- [ ]` 追蹤。執行者：Codex GPT‑6 Sol。本交接不要求多代理；沒有該技能時沿用本文件的任務、驗證及提交規則。

**Goal:** 修復兩輪審核中的服務相容性、付款一致性、onboarding、後台資料正確性及維護效率問題，保留 #130／#132／#133 已完成的保護。

**Architecture:** 沿用 TanStack Start 的薄 route → HTTP handler → 純 service → Supabase repository。需要交易保證的修改和 audit 在同一 RPC 內完成；公眾讀取、管理操作及背景工作分開授權。先修復既有系統，再以現有義工 bulk executor 為基礎改善批量體驗。

**Tech Stack:** TypeScript strict、React 19、TanStack Start／Router／Query、Vite 7、Nitro、Bun、Supabase Postgres／Storage、Tailwind v4、shadcn/Radix、Stripe／PayPal／COD AlipayHK、Resend、pdf-lib。安裝依 repository lockfile；本次 CI 設定使用 Bun 1.3.14。

**Spec:** 完整輸入附於 `references/`：`HKSCDA_Audit_2026-09-27_zhHK.md`、同名 `.html`、`HKSCDA_Reaudit_PR130_PR132_2026-09-27_zhHK.md`、同名 `.html`。MD 是問題與驗收規格；HTML 用來檢查對應畫面與證據。兩者是同一輪報告的不同呈現，不重複計算問題。

**日期／範圍:** 2026-09-27，Asia/Hong_Kong。這是實作交接計劃；本次沒有修改應用程式、migration、正式內容或付款設定。

## Global Constraints

- Repository：`https://github.com/YNWAforever/hkscda`；正式站：`https://hkscda.vercel.app/`。先讀當前 `AGENTS.md`、`CLAUDE.md` 及適用的子目錄指引。
- 手寫 TypeScript 不使用 `any`；`*.server.ts` 不進入 client bundle；`VITE_*` 一律視為公開資料。
- 新管理 mutation 經 API、`requireAdmin`、角色檢查及原子 audit；不要仿效舊動物管理元件直接從 browser 寫 Supabase 的例外。
- 每張新增 table 開 RLS；security-definer function 固定 search_path；依本 repository 架構，app RPC 位於 public，明確 revoke PUBLIC/anon/authenticated 的預設 execute，再按用途授予 service_role，不能藉 SECURITY DEFINER 解決權限錯誤。安全函式內亦驗可信 actor／用途，不信任 client 自報身份。
- 不手改 `routeTree.gen.ts`；不手改 shadcn primitives；沿用 `brand/design-tokens.*`、`docs/brand-guidelines.md` 及語意 CSS token。
- zh-HK 為主；保留協會已核准文案及真實相片。不得生成假領養動物、假救援故事、付款帳戶、資助目標或自行改條款。
- 保留 idempotency、request fingerprint、single-use Turnstile＋signed upload intent、commit 後才公開媒體、容量鎖、409 本機草稿保護及角色權限。
- 與時間相關的邏輯注入 `now: () => Date`；香港業務日期明確使用 `Asia/Hong_Kong`，資料庫 instant 保留 UTC。
- 本計劃可供後續執行者開分支、修改程式、隔離測試及準備 PR；不等同批准 merge main、正式 migration、公開 preview、付款啟用、真實付款／退款或對外寄信。`AGENTS.md` 明確要求 release approval，且 main push 會自動部署。
- 先完成可審閱的 migration 清單、dry-run、測試與回復方案，才就具體正式操作取得所需批准；沒有憑證或內容批准時，繼續其餘可完成工作並記錄唯一受阻項，不反覆詢問一般實作選擇。

## Review Focus

1. 新部署遇到落後或部分套用 schema：T01／T02 要識別真實能力，不以 migration ledger 或 HTTP 200 代替可用性。
2. 付款已成功，但設定撤回、callback 重播或收條失敗：T03–T06 保留既有交易，零重複計款，付款成功不倒退。
3. 職員有未儲存文字，同事又更新同一筆資料：T10–T13／T15 用版本衝突與 dirty guard，不能靜默覆蓋。
4. 使用者在共用裝置續填、storage 被禁或舊同意版本過期：T08／T09 不洩露或錯誤沿用敏感資料；仍可完成申請。
5. 批量選取跨頁、preview 已過期、worker 中斷或永久失敗：T17／T19／T23 逐筆重驗、fencing、可恢復、只重試失敗。

---

## 1. 基線及已修正項目

| 證據 | 固定版本／狀態 | 實作時的處理 |
|---|---|---|
| 原審核 | `b77e4cde6c90d52d2f9ceeb48c8857d264d34694`；23 項 | 歷史基線，不當成最新部署狀態 |
| PR #130／#132 再審核 | `aa280ed59e1496767e2579c91501ea6330fd62ae`；新增 11 項 | 和原報告逐 ID 合併 |
| #133 後續核對 | `f8d5e5d5840d1775efb7d7f4ae2768f6557096b5` | 本計劃檢查 source 的基線；執行時再 fetch 最新 main |
| OPS-01 | 再審核 SHA 的五個 CI jobs 已成功 | 已關閉的歷史事故；T00／T24 對新 release 繼續設 gate，不重開成未修 bug |
| R01 公開領養需知 | #133 後正式 HTTP 200，實際費用／規則／屋苑／指南 section 已顯示 | **公開頁可用性已修復**；CMS／其他 schema 相容性仍須 T01 核對 |
| #133 fallback | 只對 revision read 的 `PGRST205`／`42P01` 回 approved seed copy；其餘資料仍查原表 | 10 項隔離 source 檢查通過，並非完整 Bun／後台 E2E；保留並補入正式 regression suite |
| SPON-04 | 已有特定 409 提示，仍缺自動存草稿／其他錯誤細節 | 只修未完成部分，不刪掉 fingerprint／409 保護 |

#133 不是「migration 全完成」的證據。本計劃沒有重新執行正式 catalog 審核；8 tables、14 RPC、1 column 缺漏是再審核時的觀察，T01 必須更新。也不能用 R02 的舊 missing-table 故障測試要求 #133 再次令公開頁失敗：現在應是 **copy fallback 可讀、服務準備度 degraded、CMS 未就緒**；permission／unexpected error 才保留不可用狀態。

## 2. 問題覆蓋與關閉條件索引

| ID | 本計劃狀態 | 主責任務 |
|---|---|---|
| PAY-01 | 待修未啟用體驗；正式開通待營運批准 | T03、T24 |
| PAY-02 | 待修 server payment gate | T03 |
| PAY-03 | 待統一付款資料來源 | T04 |
| PAY-04 | 待區分 unavailable／not_configured | T02、T04 |
| PAY-05 | 待分拆付款與後續處理狀態 | T05 |
| CONTENT-01 | 未能關閉；需再核對正式內容 | T18 |
| CONTENT-02 | 待補相片工作流及助養卡資訊 | T18、T21 |
| VOL-01 | 待提供覆蓋率／批准场次與空狀態 | T16 |
| VOL-02 | 待修共用容器 | T16 |
| SPON-01 | 待修付款選項反向 | T08 |
| SPON-02 | 待提供可閱讀版本化條款 | T08 |
| SPON-03 | 待明確總額／偏好／月付性質 | T08 |
| SPON-04 | 部分改善；補草稿及錯誤處理 | T08、T09 |
| ADOPT-01 | 待修本機草稿保存界線 | T09 |
| ADOPT-02 | 待完善準備、恢復與七步流程 | T09、T24 |
| CRM-01 | 產品缺口；先安全找回，再中心 | T22 |
| ADMIN-01 | 待修匯出狀態與錯誤 | T14 |
| ADMIN-02 | 待修 supporter dialog 同步／衝突 | T15 |
| ADMIN-03 | 待統一列表搜尋 | T15 |
| ADMIN-04 | 待改善現有安全 bulk UI | T17、T23 |
| PERF-01 | 待 DB 篩選與分頁 | T21 |
| OPS-01 | 再審核版本已關閉；保留 release gate | T00、T24 |
| SEC-01 | 條件風險；未證實正式 secret 缺失 | T02、T07 |
| R01 | 公開需知已修；其餘相容性待查／修 | T01、T02 |
| R02 | 待保留 error cause 與內容監控 | T02 |
| R03 | 待防 CMS tab 切換丟草稿 | T10 |
| R04 | 待 CMS history 分頁及直接查版本 | T11 |
| R05 | 待修屋苑 stale state／重用 ID | T12 |
| R06 | 待原子排序 | T13 |
| R07 | 待修 null Turnstile token | T07 |
| R08 | 待媒體 retry／queue 公平性 | T19 |
| R09 | 待量測同區 server execution | T20 |
| R10 | 待收條香港日期 | T06 |
| R11 | 待字型載入與收條大小優化 | T06 |

## 3. 波次、相依關係及 PR 切法

| 波次 | 任務 | 完成後可交付的結果 |
|---|---|---|
| A：相容性與觀測 | T00 → T01 → T02 | 已核對 schema manifest、隔離 migration 演練、readiness、#133 回歸 |
| B：金流正確性 | T03 → T04 → T05；T06 依 T05 | 單一付款政策與資料來源、可靠對帳／收條；仍不自行開啟 live 支付 |
| C：公眾申請 | T07；T09 → T08；T16、T18 | 可恢復且清楚的助養／領養／義工旅程、真實內容維護 |
| D：後台資料正確性 | T10、T11、T12、T13、T14、T15 | 不丟文字、不覆寫狀態、原子排序、可理解匯出／搜尋 |
| E：營運批量 | T16 → T17；T19；T23 依 T14／T15／T17／T19 | 可預覽、可恢復、逐筆結果的日常工作 |
| F：效能 | T20、T21；T06 | 相同環境的 before/after，而非未證實加速百分比 |
| G：支持者服務 | T22 依 T02／T04／T05／T09 | 驗證身份後找回，角色隔離的支持者中心 |
| H：release | T24 | 所選波次全鏈路驗收、具體發布包及回復方案 |

T00 後可在隔離環境並行開發獨立任務；任何正式 release 都依賴 T01/T02 的相容性 gate。不要把全部工作包成一個大 PR。T15 的 dialog 與搜尋、T06 的日期與字型、T23 的不同領域 bulk 可各開獨立 PR，避免容易修復的問題等大型功能。每 PR 對應具名 task／issue ID；migration 和依賴它的程式一起審查，但按相容的先後次序部署。

## 4. 執行規則與共同測試方式

每個未修缺陷：先加能重現的測試 → 確认於目前 source 失敗 → 最小修改 → 同一測試通過 → 相關 integration／UI 驗證 → Conventional Commit。已修項只加回歸證據，不為製造紅燈刻意破壞程式。純文案及容器可用 screenshot／DOM 驗收，不需大量鏡像測試。

所有下列「新增」路徑及介面均為**計劃設計**，不是聲稱 repository 已有。對已存在檔案用現有型別；命名改動時同步所有 consumer／tests，並更新此計劃。先核對 Supabase CLI 版本／help 及當時官方文件；用 `supabase migration new <task_suffix>` 建立唯一 timestamp 檔案，suffix 按任務指定；不得重寫已套用 migration。任何 schema 迭代只在隔離 DB，正式環境採經審閱的 migration runbook。

基礎命令（按最新 lockfile／CI 核對）：

```bash
bun install --frozen-lockfile
bunx tsc --noEmit
bun test
bun run lint
bun run build
bun run test:acceptance:all
```

DB acceptance 必須使用腳本允許的 isolated local DB，絕不把 production URL 傳給 fixture 或 reset。brand／a11y／performance 依 `.github/workflows/ci.yml` 的 fixture server 設定執行 `bun run verify:brand`、`bun run verify:a11y`、`bun run verify:performance`；它們不等同 live smoke。build 不包含 typecheck。每 PR 跑相關 targeted tests；交付 review／release 前跑既有必需 gates，保留 exit code、SHA、環境及 skipped 原因。

---

## 5. 依賴有序實作任務

### T00 — 建立最新基線及可追蹤修復清單

**對應／依賴：** 全部 ID、OPS-01；無。

**Files:** 讀 `AGENTS.md`、`CLAUDE.md`、`package.json`、`.github/workflows/ci.yml`、`vercel.json`；新增 `docs/evidence/audit-remediation-20260927/baseline.md`、`tracker.csv`。將本計劃及 references 放入 `docs/superpowers/plans/2026-09-27-audit-remediation/`。

**Interface:** tracker 每 ID 記 `status, task, currentSha, evidencePath, pr, testResult, releaseState, ownerBlocker`；status 用 open／partial／verified-fixed／blocked-external，不以 PR merge 代替現場驗收。

- [ ] `git status --short` 後 fetch 最新 main，在獨立分支／worktree 工作，保留 unrelated changes；比較 `f8d5e5d...HEAD`。
- [ ] 核對 GitHub main、Vercel production alias 對應 SHA 及 CI；記時間和來源，不輸出 secret。
- [ ] 每項先查最新 source；已修則記具體測試，尤其 #133／OPS-01／SPON-04。
- [ ] 建測試環境及角色 fixture，跑 baseline gates。既有失败與新失敗分開，不任意放寬斷言。
- [ ] 提交 `docs: establish audit remediation baseline`；驗收：34 個 ID 均有狀態及主責 task。

### T01 — 修復 release／資料庫相容性

**對應／依賴：** R01；T00。

**Files:** `supabase/migrations/`；新增 `scripts/check-release-schema.ts`、`src/lib/operations/releaseSchema.ts`、`src/lib/operations/releaseSchema.test.ts`、`docs/evidence/audit-remediation-20260927/migration-runbook.md`。既有 CMS migration：`20260926152438_adoption_instruction_page_cms.sql`；另外 22 項須按實際 diff／catalog 列出。

**Interface:** `checkReleaseSchema(port, manifest): Promise<SchemaCompatibilityReport>`；manifest 每項含 object kind、schema/name、column type 或完整 RPC arg/return signature、RLS/grants、feature group、required/optional。report 含 compatible／degraded／incompatible 及 missing/mismatched items；不得只比較檔名。

- [ ] 寫測試：table 有但 column type 錯、RPC 同名但參數錯、grant 缺、RLS 關、ledger 有而 object 無，均不得 compatible；正確 catalog 通過。
- [ ] 將再審核的 8 tables／14 RPC／1 column 作最低清單，從當前 source 找出**全部** release 新依賴，包含 published CMS seed、constraints／indexes／storage policies。只讀正式 catalog；記錄歷史 migration 分歧。
- [ ] 在 sanitized、隔離 DB 重現落後狀態，按相依順序演練變更；新 DB 也要完整重建成功。必要修正用新 migration，不能假填 ledger、盲目 db push 或回退至非原子寫入。
- [ ] 演練領養與助養 submit/retry、animal publish、public/staff proof、internship attachment、group enquiry edit、manual issue/void、refund/denial。核對 mutation＋audit 同成同敗。
- [ ] 產出每項 SQL／checksum、影響表、預估鎖與 backfill、前後斷言、backup/restore 證據及「哪個 app SHA 可回退」。優先 roll-forward；付款新資料產生後不可直接 restore 舊 DB 抹掉交易。
- [ ] 驗證 `bun test src/lib/operations/releaseSchema.test.ts` 及 isolated acceptance；提交 `fix: establish release schema compatibility`。正式執行是 T24 的獨立批准項。

最低待核對表：`adoption_instruction_pages`、`adoption_instruction_revisions`、`animal_publication_media_copy`、`animal_publication_publish_receipt`、`animal_draft_image_upload_intent`、`sponsorship_proof_upload_intent`、`sponsorship_staff_proof_upload_intent`、`internship_attachment_upload_intent`。

最低待核對 RPC：`create_public_sponsorship_pledge`、`update_group_enquiry_with_audit`、`issue_receipt_with_audit`、`void_receipt_with_audit`、`void_donation_receipts_with_audit`、`claim_due_animal_publication_media_copies`、`claim_due_content_public_assets`、`reserve_animal_draft_image_upload`、`reserve_staff_sponsorship_proof_upload`、`publish_animal_publication_once`、`ensure_adoption_instruction_draft`、`publish_adoption_instruction_page`、`refund_provider_payment_atomically`、`fail_pending_provider_payment`。另查 `public_status_token.submission_fingerprint`；此最低清單不是所有依賴的完整宣稱。

### T02 — Readiness、錯誤可觀測性及 #133 保護

**對應／依賴：** R01/R02、PAY-04、SEC-01；T01 manifest。

**Files:** 修改 `src/lib/adoptionInformation/publicPage.server.ts`、`publicPage.loader.ts`、`src/lib/routing/resilientLoader.ts`、`src/lib/security/turnstile.server.ts`、`rate-limit.server.ts`；新增 `src/lib/operations/readiness.server.ts`、同名 test、`scripts/verify-live-readiness.ts`；保留 `src/lib/adoptionInstructions/repository.server.ts` 的精確 fallback 類型。

**Interface:** `ReadinessState = "ready" | "degraded" | "unavailable"`；`checkReadiness(deps)` 回安全 feature summary。內部細節含 error code／cause／release SHA／correlation ID；公眾只收狀態、可重試提示及 support reference。

- [ ] 把 #133 10 個案例納入正常 Bun tests：兩種缺表碼 seed＋live fees/rules/care/estates/guides；42501/XX000/PGRST116、無 published revision、invalid content 均拒絕；正常 CMS 優先；原表／guide 錯誤不可 fallback。
- [ ] missing CMS table：公開頁保持可讀，內部 CMS readiness degraded／blocked 並告警；permission/timeout：保留可操作不可用頁、error cause。重要 SSR 故障設定正確 503/no-store；若框架限制，必須由獨立 readiness＋內容 synthetic 發現，不能只測 200。
- [ ] production 的整組缺失防濫用設定不再無聲放行：public form 提交 fail closed 並使 readiness 不通過；local/test 用依賴注入。保留 webhook signature 與 native CSP report 各自適用規則，不把所有 POST 強行 Turnstile。
- [ ] degraded/readiness log 去除 email、地址、token、完整 payload／query。重複告警限頻，恢復可見；不在 public health 洩露 catalog。
- [ ] 跑相關 security/routing/adoptionInformation tests；加 live GET 的內容斷言及 release gate。提交 `fix: surface readiness failures without masking CMS errors`。

### T03 — 單一 server 付款政策及未開通體驗

**對應／依賴：** PAY-01/PAY-02；T01/T02。

**Files:** `src/routes/api/donations.ts`、`src/lib/donations/service.ts`、`src/routes/donate.tsx`；新增 `src/lib/donations/checkoutPolicy.ts`、`checkoutPolicy.server.ts`、對應 tests；延伸 `paymentPublicConfig` 與新 SQL（suffix `checkout_policy_gate`）。

**Interface:** `authorizeNewCheckout({method, purpose, expectedConfigVersion}, policy): CheckoutAuthorization`；purpose 為 donation／sponsorship。純政策檢查不做 IO，server loader 供權威狀態。authorization 帶 config ID/version；建立交易的 DB command 原子重驗此版本和開關，過期為 409，停用為 503／method unavailable 為 422。

- [ ] 寫 `disabled_policy_has_zero_side_effects`：全局停用／method 隱藏、未 published 或 archived 時，supporter、donation、provider call 均為 0。
- [ ] 寫設定變更 race：讀政策後、建立前撤回，必須拒絕。以原子 admission 作接受時點；admission 後撤回視為既有交易，仍允許安全完成／對帳。
- [ ] server 控制為權威；移除前台 build flag 作獨立業務真相，前台使用同一公開 projection。舊 flag 可保留部署級保險，但不能令 server 更寬鬆。
- [ ] 未啟用顯示簡潔說明及核實聯絡方式；全站 donation CTA 同步。後台提供供應商模式、核准版本、webhook、callback、對帳、收條／通知驗證清單。
- [ ] 測既有 checkout 在停用後仍可 webhook/reconcile；sandbox 成功／取消／延遲返回。`bun test src/lib/donations src/routes/api/donations.test.ts`；提交 `fix: enforce checkout approval on the server`。不得以通過測試自動打開 live 開關。

### T04 — 統一付款設定、指示與版本快照

**對應／依賴：** PAY-03/PAY-04；T03。

**Files:** `src/lib/paymentPublicConfig/{types.ts,public.server.ts,public.functions.ts,repository.server.ts}`、`src/lib/sponsorship/emailTemplates.server.ts`、`submission.server.ts`、`src/lib/donations/service.ts`；相關 tests／新 SQL suffix `payment_instruction_snapshots`。

**Interface:** `PaymentAvailability = {state:"ready",methods:PublicPaymentMethod[]} | {state:"not_configured"|"unavailable",methods:[]}`；新增 `PaymentInstructionSnapshot` 含 configId/version、purpose、method、已核准 public details、capturedAt。`resolvePaymentInstructions(input): Promise<PaymentInstructionSnapshot | null>` 只回用途適用的已核准設定。

- [ ] 寫測試：DB timeout ≠ 真正零配置；兩者都不能新 checkout，UI 原因不同。已核准但 malformed record 不可被默默略過為正常 ready。
- [ ] 移除 email／manual API 寫死帳戶與連結，網頁/API/email 共用 resolver。無配置只發核實安排及 reference，不 fallback 到舊帳戶。
- [ ] 為新交易存快照；設定更新後新的指示採新版，歷史保留舊版證據。重發舊信時若帳戶已撤回，不盲目重寄失效付款要求；顯示核實安排並保留原快照。
- [ ] 測撤回、用途不符、缺值、重發、頁面/API/email 一致性；`bun test src/lib/paymentPublicConfig src/lib/sponsorship/emailTemplates.server.test.ts src/lib/donations/service.test.ts`。
- [ ] 提交 `fix: derive payment instructions from approved configuration`。

### T05 — 付款、收條、通知分離及可靠恢復

**對應／依賴：** PAY-05、R01 financial paths；T01/T03/T04。

**Files:** `src/lib/donations/publicStatus.server.ts`、`publicStatus.ts`、`reconcile.server.ts`、`reconciliation.ts`、`src/routes/api/donations/$donationId/status.ts` 及實際狀態頁 consumer；先定位並重用現有 delivery/retry 工作及 repository，缺失部分才新增 durable job migration。

**Interface:** 公開回應保留既有 `status` 相容欄位，同時提供 `paymentStatus`、`receiptStatus`、`notificationStatus`；status 是 committed payment 狀態，不因副作用失敗降級。每個副作用用穩定業務 key 保證重试不產生另一有效收條。

- [ ] 寫 `succeeded_payment_survives_receipt_failure`：payment succeeded＋PDF/email throw → 仍 succeeded、receipt pending/failed；重試後有效 receipt=1、交易=1。
- [ ] durable 工作在 transaction 內排隊，付款 GET polling 不再是唯一恢復觸發；claim/lease/fencing、有限重試、人工重试入口、去重通知。
- [ ] sandbox 測 duplicate/out-of-order webhook、bad signature、金額／幣別不符、provider timeout、denial after success、partial refund 與 receipt void。依現有 provider 狀態機，不自行把 partial refund 算全額。
- [ ] 公眾清楚分辨「付款成功／收條處理中」；內部辨別排隊／provider accepted／delivered，沒有送達事件不可聲稱 delivered。
- [ ] 跑 donations lifecycle/reconcile/status suites 及 isolated DB atomicity；提交 `fix: recover receipts without reverting successful payments`。

### T06 — 收條香港日期與字型成本

**對應／依賴：** R10/R11；T05 的 receipt lifecycle，日期修正可獨立先交。

**Files:** `src/lib/donations/receipt-pdf.server.ts`、同名 test；新增 `src/lib/donations/receiptFont.server.ts`、同名 test；benchmark 放 `scripts/benchmark-receipts.ts`。

**Interface:** `formatReceiptDate(issuedAt: string): string` 固定香港 timezone；`loadReceiptFont(): Promise<Uint8Array>` process-level single-flight bytes cache，失敗清空 promise 可重試，PDFDocument/嵌入字型物件不跨 document 共用。

- [ ] 午夜測試：`2026-09-26T16:30:00Z` 必須顯示香港 27/9/2026；跨年及重發使用原 issuedAt，UTC／不同 runtime TZ 輸出一致。編號年度沿用經核准規則，不推斷稅務年度。
- [ ] 優先 bundle／本機載入授權字型，或固定來源快取 bytes，並行請求只取一次；避免每張重新 fetch 7.07 MB。
- [ ] 比較 subset 或替代字型之前，測繁中罕字、長名、中英混合及換行。原碼已有 subset 缺字提醒，不能直接把 `subset:false` 改 true 宣稱完成。
- [ ] 同環境產出 before/after PDF，檢查渲染、文字、bytes、CPU、fetch 次數及 100 張批次恢復。以測得結果決定字型方案；若無安全縮小方案，交付 caching 並把檔案大小子項保持 open，列明原因。
- [ ] `bun test src/lib/donations/receipt-pdf.server.test.ts src/lib/donations/receiptFont.server.test.ts`；提交日期與字型兩個可獨立 review 的 commits。

### T07 — Proof upload token 相容與安全模式

**對應／依賴：** R07、SEC-01；T02，DB 路徑依 T01。

**Files:** `src/components/site/sponsorship/pledgeProofUpload.ts`、`PledgeWizard.tsx`、`src/routes/api/sponsorships/pledges/proof-upload-url.ts`、相關 route/helper tests。

**Interface:** client 無 token 時不序列化該欄位；server schema 可 normalize null→undefined，實際允許與否仍由 verifier 決定。已有 proof intent 的最終提交驗 signed intent，不再用同一 challenge 第二次驗證。

- [ ] token normalize 測試：local disabled 無 token 可走 intent；enabled 無／無效 token 拒絕且無 upload intent；有效 token 僅消耗一次。
- [ ] 四組 UX：有／無 proof × challenge enabled／local disabled；production 缺設定仍按 T02 fail closed，不能藉 disabled 測試打開正式 bypass。
- [ ] 測 forged、expired、already-consumed intent 及 upload retry；保留 body size、MIME／bytes、expiry、owner binding。
- [ ] 跑 upload helper／route／submission tests；提交 `fix: normalize absent proof upload challenge tokens`。

### T08 — 助養付款選項、條款及確認摘要

**對應／依賴：** SPON-01/02/03/04；T04/T07/T09。

**Files:** `src/components/site/sponsorship/PledgeWizard.tsx`、`PledgeStatusPage.tsx`、`src/lib/sponsorship/schemas.ts`、`submission.server.ts`、email templates；新增條款 public reader／route 前先重用既有版本化 documents/content model。

**Interface:** `paymentChoice: "later" | "proof_uploaded"` 映射現有提交 contract；條款 consent 必須 `termsVersionSeen === currentPublishedTermsVersion`。月額是現有單一 amount_cents 的整份承諾，偏好不是保證配對；精確分配／取消政策由協會核准 copy 提供。

- [ ] 寫穩定 radio 文案：「稍後按核實安排付款」／「已付款，上載證明」；later 不要求 proof；proof 分支完整驗證金額、日期、檔案，aria-invalid/description 與頁首 error summary 連動。
- [ ] 無登入可讀已發佈條款，顯示版本／日期，返回保留表格；提交時 server 重驗版本。未有核准條款時顯示未就緒，不能以自行撰寫條款代替。
- [ ] 確認頁明示總月額、1／多隻偏好、職員確認配對、首月及續期、修改／停止方式；沒有 provider agreement 就寫手動每月支持，不能稱自動扣款。
- [ ] 使用 T09 草稿契約；400 顯示欄位原因，409 保留本機資料，413／429／network 有可行下一步。retry 保留同一 idempotency key，payload 改變不得當成同一請求靜默接受。
- [ ] 測無偏好／最多 schema 容許的偏好、兩付款分支、條款更新、重整、重試及 status 狀態差異。`bun test src/components/site/sponsorship src/lib/sponsorship`；提交 `fix: make sponsorship commitments and proof steps explicit`。

### T09 — 領養／助養安全草稿及完成流程

**對應／依賴：** ADOPT-01/02、SPON-04；T00；提交驗證依 T01。

**Files:** `src/lib/publicAdoption/draft.ts`、`draft.test.ts`、`src/lib/sponsorship/draft.ts`、`src/components/site/adoption/ApplicationWizard.tsx`、test；新增 `src/lib/forms/localDraft.ts`、test，供兩個 wizard 共用。

**Interface:** `DraftEnvelope<T>={schemaVersion:2,savedAt:string,expiresAt:string,step:number,data:T}`；`readDraft(storage,key,now): {state:"none"|"expired"|"invalid"}|{state:"available",draft:DraftEnvelope<T>}`。本計劃預設保存 7 天、預設不勾選「在此裝置保存」；屬產品實作預設，並非協會已核准保存政策，發布前由負責人確認。

- [ ] opt-in 後 debounce 500ms 保存白名單欄位；排除 File、photos、proof blob、status/access token、OTP、身份文件及 consent。照片需重選；舊 v1 無期限草稿不可靜默回填，提供明確清除／重新開始。
- [ ] available 草稿恢復前確認；過期立即移除；清除、成功提交、取消 opt-in 都刪除；storage throw／quota/full、malformed JSON 不阻止流程。
- [ ] 七步前加所需資料／相片 checklist，合理完成時間待真實 UAT 量測才上文案；顯示完成／目前步驟，前後切換不丟資料，錯誤定位首欄，主語言清楚。
- [ ] 測 TTL 前後邊界、跨日、被禁 storage、舊草稿、新條款、返回、photo reselect、最多三隻候選、動物已不適合領養、double submit、token expiry。最後 review 有偏好、費用、後續聯絡安排。
- [ ] `bun test src/lib/publicAdoption/draft.test.ts src/lib/forms/localDraft.test.ts src/components/site/adoption/ApplicationWizard.test.tsx`；提交 `fix: add explicit expiry and recovery for application drafts`。

### T10 — CMS 未儲存變更保護

**對應／依賴：** R03；T00。

**Files:** `src/components/admin/content/AdoptionInstructionsManagement.tsx`、`AdoptionInformationManagement.tsx`、各 test；只在可共用時新增 `src/lib/admin/unsavedChanges.ts`。

**Interface:** child 對 parent 提供 `onDirtyChange(dirty:boolean)`；parent 的 guarded navigation 回 `"save"|"discard"|"cancel"`。save promise 成功後才執行 pending navigation；不可從背景 refetch 自動覆寫 dirty draft。

- [ ] 改 hero.title→切 tab→取消仍留原內容；選保存且失敗不離開；保存成功後返回看新版本；捨棄回最新 server 值。
- [ ] route/tab 用三選項 dialog；browser reload/close 用原生 beforeunload（瀏覽器不支援自訂三按鈕，不作虛假承諾）。保留焦點和鍵盤操作。
- [ ] 測 409 保留本機文字、重新讀取／比較後才明確採用他人版本。
- [ ] `bun test src/components/admin/content/AdoptionInstructionsManagement.test.tsx src/components/admin/content/AdoptionInformationManagement.test.tsx`；提交 `fix: guard unsaved adoption CMS changes`。

### T11 — CMS 修訂摘要分頁與直接查詢

**對應／依賴：** R04；T01。

**Files:** `src/lib/adoptionInstructions/{types.ts,repository.server.ts,service.ts,http.server.ts}`、tests、`src/components/admin/content/AdoptionInstructionsManagement.tsx`；新增 `src/routes/api/admin/adoption-instructions/history.ts` 及 revision detail route。

**Interface:** `getRevision(id): Promise<AdoptionInstructionRevision|null>`；`listHistory({cursor,limit}): Promise<{items:RevisionSummary[],nextCursor:string|null}>`，default 25/max 100；summary 不含 content。cursor 用 revisionNumber＋id 穩定排序。getAdminPage 以 page state 的 draft/published ID 讀實際版本，history 僅供顯示。

- [ ] 1／100／1002 個版本 fixture；published 在 1000 筆之外仍可管理，首頁最多 25 summaries；點開／restore 任意合法舊 ID 成功。
- [ ] restore 直接驗 revision ID、page key、角色及最新 expected page version；不以當前 history 頁是否包含作授權／存在性判斷。
- [ ] 前後翻頁無重複，新增修訂不把先前頁內容錯配；無權限 history/detail 同样 401／403/no-store。
- [ ] `bun test src/lib/adoptionInstructions`；量測 payload；提交 `perf: page revision summaries and fetch active revisions directly`。

### T12 — 屋苑新增及發佈狀態正確性

**對應／依賴：** R05；T01/T10。

**Files:** `AdoptionInformationManagement.tsx`（完整路徑同 T10）；`src/lib/adoptionInformation/{schemas.ts,types.ts,service.ts,repository.server.ts,http.ts}`、tests、`src/routes/api/admin/adoption-information.ts`；SQL suffix `estate_versioned_commands`。

**Interface:** 分拆 `createEstate(input)`、`updateEstate({id,expectedVersion,fields})`、`setEstatePublication({id,expectedVersion,isPublished})`；內容 fields 不含 publication。沿用 actor／audit contract；新增 version 欄位及 guarded RPC，如現有未提供。

- [ ] 發佈→server refetch→修改名稱仍 published；取消發佈可反覆；連續新增甲／乙產生兩個 ID，刷新均存在。
- [ ] create 成功才清空表格／換 ID；失败 retry 保留同一 create request identity。每次成功用 server canonical row 更新；dirty row 遇他人修改顯示衝突，不強行 useEffect 覆蓋。
- [ ] expectedVersion 舊值回 409，mutation/audit 同 transaction；保留現有角色矩陣。
- [ ] 跑 adoptionInformation unit＋DB conflict tests；提交 `fix: separate estate edits from publication state`。

### T13 — 領養費用原子排序

**對應／依賴：** R06；T01。

**Files:** `src/components/admin/content/AdoptionInformationManagement.tsx`、`src/lib/adoptionInformation/{service.ts,repository.server.ts,http.ts,schemas.ts}`；新增 SQL suffix `atomic_adoption_fee_reorder` 及 database test。

**Interface:** `reorderFees({firstId,secondId,expectedVersions},actor): Promise<AdoptionFee[]>`；一個 `reorder_adoption_fees_with_audit` RPC，按 ID 固定順序 lock，驗證同一排序集合和版本，原子交換及 audit。schema 若 unique sort constraints 需 transaction-safe 交換策略，不在外部保留 temporary order。

- [ ] 在每個更新點注入 DB failure，必須全部回復；並行排序其中一個衝突而非錯亂；跨 animal type／非相鄰或越權 pair 拒絕。
- [ ] 移除三次 POST；pending 停用上下箭頭，成功及錯誤均重新讀 canonical rows。double click 只進一次。
- [ ] DB test 查無臨時 sortOrder、audit 不重複；`bun test src/lib/adoptionInformation src/components/admin/content/AdoptionInformationManagement.test.tsx`。
- [ ] 提交 `fix: reorder adoption fees in one audited transaction`。

### T14 — 匯出錯誤、進度及大批匯出

**對應／依賴：** ADMIN-01、原報告 bulk matrix；T00；背景匯出 DB 依 T01。

**Files:** `src/components/admin/crm/ExportBar.tsx`、新增 `ExportBar.test.tsx`、`src/lib/crm/readModel.server.ts`、`src/routes/api/admin/exports/supporters[.]csv.ts`、`donations[.]csv.ts`。

**Interface:** 即時匯出 `idle/exporting/error/success`；保留 5,000 筆上限。大批使用後台 export job，綁 actor、角色、filter snapshot，artifact 短期授權下載；若現有無 job，新增 `src/lib/crm/exportJobs.server.ts` 及私有儲存 migration。

- [ ] 5,001 rows → 413，显示縮小篩選／建立背景匯出的選項，零截斷 CSV；401/403/500/network 分別顯示，重試保留條件，pending 禁止重點。
- [ ] CSV 做 formula injection 防護、正確 escaping/UTF-8；資料與畫面 filter/sort snapshot 一致。
- [ ] 背景 export 分頁讀、可取消、最多保存 24 小時（本計劃預設），download 時再驗角色／actor，角色撤回後不可下載；清理過期 artifact。
- [ ] 跑 readModel／ExportBar／job tests；即時 UI 可先獨立提交 `fix: expose CRM export failures and progress`；背景匯出另 PR，未完成不可標記 large export 子項通過。

### T15 — Supporter 表單同步及共用列表查詢

**對應／依賴：** ADMIN-02/03；T00，DB version mutation 依 T01。

**Files:** `src/components/admin/crm/SupporterFormDialog.tsx`、`SupporterList.tsx`、`src/components/admin/sponsorship/PledgeReviewLane.tsx`、`src/components/admin/adoptions/CaseList.tsx`、`src/components/admin/content/ContentManagement.tsx`、`src/components/admin/volunteers/VolunteerActivityWorkspace.tsx`；新增 `src/lib/admin/useListQueryState.ts`、tests；CRM service/repository 按需延伸 expected version。

**Interface:** `useListQueryState({routeState,debounceMs:300})` 管 query/filter/sort/page；IME composition 完成才搜尋，queryFn 接 AbortSignal，保留前次資料但標示 refreshing；filter 改變將 page reset 並清空 selection。dialog 每次 open 讀最新 server row，save 帶 expectedVersion。

- [ ] dialog 測取消 A→重開是 server 值、外部更新 B→重開是 B、dirty close guard、409 不覆寫、重開另一 supporter 不殘留前人資料。
- [ ] 列表測快速輸入合併、中文 IME、slow old response 不蓋新結果、back/forward 保留 URL state、error 不當 0 rows、filter 改動提示清 selection。
- [ ] 不把私人 query／token 放 analytics；含敏感自由文字的 URL state 應避免分享及 log，若需保密改 session state，其餘非敏感篩選仍可 URL。
- [ ] targeted component tests＋瀏覽器驗證；分別提交 `fix: refresh supporter edits with version protection`、`perf: unify debounced cancellable admin searches`。

### T16 — 義工可服務狀態及版面

**對應／依賴：** VOL-01/02；T02。

**Files:** `src/routes/volunteer.tsx`、`src/components/site/volunteer/VolunteerSessionBrowser.tsx`、`src/components/admin/volunteers/VolunteerActivityWorkspace.tsx`、`src/routes/api/admin/volunteers/overview.ts` 及其既有 service/repository；新增 coverage unit tests。

**Interface:** `getSessionCoverage({from,to,centre},now)` 回 14／30 天摘要、未發佈／政策不適用原因；排休日不當成缺場次，unknown 與 0 分開。訂閱通知重用已驗證身份／consent，不能擅自把申請人加入 marketing。

- [ ] 修 `section-container` 為既有標準容器；390／768／1366px screenshots、200% zoom、無水平溢出。
- [ ] 空狀態說明真實開放安排；有核准日期才顯示日期，無安排時提供聯絡或明確 opt-in 開放通知，不杜撰場次。
- [ ] 後台顯示覆盖率、publish blocker 及進入既有 generate/preview 的入口；在 isolated DB 建已批准 policy fixtures。
- [ ] 測新／舊義工、group lock、48 小時邊界、候補／取消、兩個同時預約及每日跨場次配額。09:30–12:30、10 人、新義工 5 人要核對現行已批准政策，不硬編碼取代可調規則。
- [ ] 提交 `fix: explain volunteer availability and align page layout`。正式發佈真實場次列外部工作，不以建立假資料關閉 VOL-01。

### T17 — 既有義工 bulk 的職員操作流程

**對應／依賴：** ADMIN-04；T16/T15/T01。

**Files:** `src/components/admin/volunteers/VolunteerActivityWorkspace.tsx`、`src/lib/volunteers/bulk/{service.ts,http.server.ts,repository.server.ts}`、既有 bulk tests；必要時拆同目錄 `VolunteerBulkReview.tsx`、`VolunteerBulkResults.tsx`。

**Interface:** 沿用現有 snapshot／preview／operation/group IDs 與 apply contract；UI 三步「選範圍→預覽差異及例外→執行結果」。不得在 server 外把多個 POST 當作原子交易。

- [ ] 以政策名稱、日期、容量、受影響人數為主；UUID、template_key、transaction detail 收於詳情。
- [ ] 明示本頁／全部符合 N 筆、快照時間、before/after、eligible/skipped/conflict。低風險合格組一次審閱後順序排程；取消、容量／政策變更保留高風險審閱。
- [ ] 測 4／8 週模板、例外日、series edit、close/cancel、attendance；30 天排班可在同一 workspace 完成。stale preview 重驗，double apply 冪等，partial results 可只 retry failed。
- [ ] 資料修改與通知分開批准；顯示 queued/provider accepted/delivered/failed。用測試 sink 驗通知，不寄真實義工。
- [ ] `bun test src/lib/volunteers/bulk` ＋既有 mandatory DB scenarios；提交 `feat: simplify volunteer bulk planning and recovery`。

### T18 — 真實內容、相片與內容維護隊列

**對應／依賴：** CONTENT-01/02；T01/T15。

**Files:** `src/lib/content/publicStoriesPage.server.ts`、同名 test、`src/components/admin/content/ContentManagement.tsx`、動物現有 `missingPhoto` 管理入口；public card consumer 先由 listing 追出；新 SQL suffix `content_publication_eligibility`。

**Interface:** 共用 `isPubliclyEligibleContent(record,now)`／對應 SQL predicate，包含核准狀態、demo 分類、有效期；精選、故事、地圖、推廣均同一條件。既有內容未分類先列待審，不把所有 unknown 當 demo 大量下架。

- [ ] 只讀產出 demo ID／標題／公開位置／建議 action 清單；不得用字串「示範」一刀刪除，也不得自動 unpublished 全部正式內容。
- [ ] 測 featured 不繞過 eligibility、過期活動顯示已結束、真實舊文章仍可存檔閱讀；來源、負責人、有效期可維護。
- [ ] 補圖隊列按編號配對，上載前顯示 file→animal，重用 commit-before-public 和 draft preview；缺圖保留誠實 placeholder，不生成替代動物。
- [ ] 助養卡顯示核准照顧需要／用途／近況；缺資料不編造。搜尋／物種／有相片 filter 和總數由 T21 支援。
- [ ] 測內容 reader／publish 邊界及 desktop/mobile card；提交 `feat: enforce verified content eligibility and maintenance queues`。正式下架／補圖／文案發布按具體清單取得內容批准。

### T19 — 媒體修復 queue 公平性與背景執行

**對應／依賴：** R08；T01/T02。

**Files:** `src/lib/animals/publicationMediaRepair.server.ts`、`src/lib/content/publicationMediaRepair.server.ts`、各 test、`src/routes/api/jobs/public-uploads.ts`；新增 `src/routes/api/jobs/public-media-repair.ts`、test；`vercel.json` 及 SQL suffix `media_repair_retry_schedule`。

**Interface:** job metadata `attempts,nextRetryAt,lastErrorCode,leaseToken,status`；claim 依 nextRetryAt/createdAt/id，保留 fencing。計劃預設退避 1m/5m/15m/1h/6h，最大 8 次後 failed/manual review；所有值集中設定，測試注入 clock。

- [ ] 500 jobs＋最早 50 個永久失敗：其餘 450 都能前進，單次 worker 有時間／batch 預算，不能 while-loop 超時丟進度。
- [ ] 分開每日 orphan cleanup 與高頻 repair；先核實 hosting schedule 支援，建議每 5 分鐘 repair，若方案不支援則配置受保護 scheduler／queue，不無限提高每次 limit。
- [ ] 測 worker crash、lease 過期、舊 worker 回寫被拒、重播冪等、pending publication 未 commit 絕不可公開。
- [ ] 後台呈現 backlog、oldest age、逐項原因、retry failed；人工 retry 需先修原因，audit 不消失。cron auth 不能以 public URL 任意觸發。
- [ ] 跑 repair/job/isolated SQL tests；提交 `fix: prevent failed media repairs from starving the queue`。

### T20 — Server execution region 與往返量測

**對應／依賴：** R09；T00/T01。

**Files:** `vercel.json`、`vite.config.ts`；新增 `docs/evidence/audit-remediation-20260927/region-benchmark.md`；優先 instrument 現有 server repository，避免 blanket rewrite。

**Interface:** telemetry 僅記 route/operation、release、duration、DB roundtrip count、cold/warm，不帶 PII；比較讀取相同 fixture 的基線與候選配置。

- [ ] 重新核對 deployment metadata 與 DB region；先前是 iad1／ap-southeast-1，不當成永久配置。
- [ ] 在 preview/isolated environment 測試靠近 DB 的 execution region（如 sin1，須核對當時 Vercel 支援及專案限制），檢查 Nitro output functions 實際配置，不只看 vercel.json。
- [ ] 每條關鍵 route 至少 30 個受控樣本，分冷暖、香港與另一地區；記 p50/p95/error rate。減少 sequential round trips 可在依賴正確時採並行或原子 RPC。
- [ ] 比較同樣資料、network、SHA；DB 不搬遷，provider callback／字型／檔案 access 回歸；若無收益或有錯誤保留原區。
- [ ] 提交 `perf: validate server region placement against database latency`，正式 region 切換列 T24 批准及可回退設定。

### T21 — 公眾動物 DB 分頁與相片載入

**對應／依賴：** PERF-01、CONTENT-02；T01/T18。

**Files:** `src/lib/animals/publicListing.server.ts`、`publicListing.functions.ts`、`publicListing.ts`、各 test；SQL suffix `public_animal_listing_page`；實際 sponsor/adoption card 元件按 callsite 修改。

**Interface:** `listPublicAnimals({purpose,species,query,hasPhoto,ageBand,sort,page,pageSize},now): Promise<{items:PublicAnimalSummary[],total:number,page:number}>`。沿用現有公開資格條件、穩定 sort＋id，所有 count/filter/paging 在 DB 完成。不可直接把原全量查詢加 limit 而令過濾後結果漏失。

- [ ] 1k／10k fixture 對照舊純函式結果，頁序／total 一致、無重複遺漏，public/sponsor eligibility、撤回／archived 不曝光。
- [ ] age 自由文字先定義可重現 normalization，保留 unknown；採 additive backfill＋dry-run counts，不依粗略 regex 把未知年齡誤分類。
- [ ] 只回 summary；在相同環境測 p50/p95、rows、EXPLAIN、bytes。20–25 筆 summary API 壓縮前 <50KB 作目標；warm search <1s 作待量測目標，不宣稱已達。
- [ ] 相片設 width/height、responsive sizes、合適 thumbnail，首屏主圖不盲目 lazy，其餘 lazy；private draft 圖不能走 public cache。保留清楚缺圖、編號搜尋及物種 filter。
- [ ] `bun test src/lib/animals/publicListing` ＋isolated SQL tests；提交 `perf: paginate public animal summaries in the database`。

### T22 — 安全找回與支持者自助入口

**對應／依賴：** CRM-01；T02/T04/T05/T09。

**Files:** 重用 `src/lib/supporters/publicIdentity.server.ts`、義工既有 verified identity flow 及領養／助養 status access；新增 `src/routes/supporter/index.tsx`、`src/routes/api/supporter/recovery.ts`、`src/lib/supporters/recovery.server.ts`、`portal.server.ts`、tests，URL 最終按現有 route 命名一致。

**Interface:** `requestRecovery(email): Promise<{accepted:true}>` 對存在／不存在 email 同回應；`listMyRecords(verifiedPrincipal)` 由 server verified identity linking 決定，不接受 client supporterId 作授權。

- [ ] 第一 PR：找回申請／助養／收條，經 rate limit＋challenge，使用現有短效驗證能力；沒有現有可用 token 時新增 purpose-bound、hashed、單次、15 分鐘 expiry 的 token（本計劃預設）。寄信只測試 sink。
- [ ] 測不存在 email 不洩露 membership、錯 email、過期／重播連結、停權／撤回權限、同 email 未驗證不能合併歷史、錯誤 token 不讀 records。
- [ ] 第二 PR：驗證後按身份顯示安全摘要／既有 status links／授權 receipt download；通訊偏好與交易通知分開；不默認合併不確定身份。
- [ ] UI 對沒有紀錄、連結到期及需職員協助有下一步；敏感回應 no-store、登出清 query cache、跨使用者無資料殘留。
- [ ] `bun test src/lib/supporters` ＋role/browser tests；提交 recovery 與 portal 兩個 PR。只交 recovery 時 CRM-01 標 partial，不宣稱完整中心已完成。

### T23 — 待辦入口及跨模組批量維護

**對應／依賴：** 原報告 §6、再審核 §7、ADMIN-04；T14/T15/T17/T19。

**Files:** 保留 `src/components/admin/adminNav.ts` 六區；新增 `src/components/admin/operations/TaskOverview.tsx`、`src/lib/operations/taskOverview.server.ts`、tests；共用 `src/components/admin/bulk/BulkReview.tsx`、`BulkResults.tsx`。各領域 command 保留在自己的 service/repository；可共用 UI/result contract，不做可寫任意 table 的萬用 endpoint。

**Interface:** `TaskMetric={state:"ready",count,oldestAt}|{state:"unavailable"}`；`BulkItemResult={entityId,status:"succeeded"|"skipped"|"conflict"|"failed",reasonCode}`。server snapshot 含 actor/action/filter hash/IDs/versions/expiresAt（預設 15 分鐘）；apply 每筆重驗角色／版本。大任務狀態 queued/running/partial/done/failed，durable checkpoint＋idempotency。

- [ ] task overview 按角色顯示待核實、待跟進、缺圖、場次缺口、付款待核實、收條失敗、内容待審／過期、media queue、schema/worker readiness。讀取失敗顯示未知，不能 0。
- [ ] 每個職員角色提供 3–5 項任務導覽；所有卡片連去保留篩選的既有 workspace。
- [ ] 共用 bulk UI：本頁／全部符合 N、selection snapshot、before/after、eligible/skipped/conflict、confirmation、進度、下載逐筆結果／只重試失敗。filter 變更清 selection；refresh 可找回 operation。
- [ ] 按下表每個領域分獨立 PR，重用現有能力；缺 command 才新增 guarded/audited RPC。每項都有權限、stale preview、double apply、partial failure 的測試，不能只交 generic modal。

| 領域 | 要交付的安全操作 | 不做的高風險捷徑 |
|---|---|---|
| 義工身份 | 批量標籤／分派審核者／補資料草稿 | 不批量跳過資格核實 |
| 領養申請 | 按階段及等待時間分派／跟進任務／補資料草稿 | 不一鍵批准領養或覆寫配對 |
| 動物內容 | file→animal 對應預覽／分類／送審／可回復封存 | 不刪除已關聯個案或直接公開 draft |
| 助養 | 分派跟進／proof 審核隊列／到期提醒草稿 | 不把 proof uploaded 當 payment confirmed |
| 財務 | 對帳檔 dry-run／候選匹配／逐組確認／收條補發 jobs | 不盲批退款／void；重複 reference 不入帳 |
| CRM | 批量標籤／分派／格式清理預覽／受限匯出 | 不自動 merge identity 或授予 marketing consent |
| CMS | demo／過期／缺來源隊列、批量送審 | 正式上下架需具體公開影響及版本審閱 |

- [ ] 通知草稿、recipient preview 及資料 mutation 分開；正式發送需要既有適當角色與具體授權，不因 bulk 完成而自動寄出。
- [ ] 測 25／1,000 選取、權限中途改變、過期快照、部分失敗、worker crash/retry，逐項結果總數吻合；提交 `feat: add role-based task queues and auditable bulk workflows` 的領域分批 PR。

### T24 — 全鏈路驗收及具體發布包

**對應／依賴：** 所有納入本次 release 的 tasks；尚未執行的波次在 tracker 明示，不可全關。

**Files:** 新增 `docs/evidence/audit-remediation-20260927/release-checklist.md`、`uat-results.md`、`operations-handoff.md`；CI gate 變更放 `.github/workflows/ci.yml`，沿用既有 test scripts。

**Interface:** release manifest 綁 `appSha,schemaManifestHash,configVersions,migrationChecksums,ciRun,evidencePaths,rollbackTarget`。每項標 pass/fail/blocked/not-run，未測不寫 pass。

- [ ] 跑 typecheck、全測試、lint、build、isolated DB/RLS、brand/a11y/performance 必要 gates；保留同一 SHA 的結果。staging 用接近正式 schema/config 的設定，不只有 fixture 站。
- [ ] 跑下節角色／旅程矩陣；真實 provider sandbox 而非僅 mocked SDK。未有 sandbox access 則記 blocker、仍交其餘完工範圍，不宣稱付款全驗收。
- [ ] 私有 review 環境附 before/after、migration dry-run、SQL checks、seed/copy diff、provider模式、rollback與 event replay。依 repository 指引，公開 preview／正式 migration／merge／付款啟用各須適用批准。
- [ ] 授權後依序：核實 backup→套已審 migration→catalog/grants/RLS/seed gate→部署已測 SHA→GET 真實內容 smoke→sandbox或獲准驗證→啟用特定付款方式。沒有 gate 時不自動 promote。
- [ ] 停新 checkout 不停舊事件接收／對帳；event durable 保存／供應商重送機制先驗證。不相容舊 app 不作 rollback target；遇 schema fault 先按核准兼容策略停受影響新提交，避免丟歷史交易。
- [ ] 發布後核對 alias SHA、真實內容、worker 最後成功／backlog、error rate／payment pending／receipt failures；交職員操作指引與 owner 清單。提交 `docs: record remediation acceptance and release evidence`。

## 6. 必跑 UAT 矩陣

| 旅程／角色 | 成功情境 | 必測失敗／競爭情境 | 證據 |
|---|---|---|---|
| 公眾領養 | instructions→最多三隻 shortlist→七步→上載→submit→後台收件／分派 | missing CMS fallback、permission error、expired draft、動物撤回、photo retry、duplicate submit、status token expiry | browser steps＋DB/audit assertion；只測試資料 |
| 助養 | 無／多偏好→條款→稍後付款或 proof→職員核實→配對／續期 | 四種 challenge/proof、stale terms、null token、replay intent、409、partial/duplicate payment、refund | pledge／proof／payment 各狀態及無重複紀錄 |
| 義工 | email verify→資格／條款→可見場次→booking→候補／取消／出席 | total/new quota、group lock、48h HK boundary、suspended user、two concurrent bookings、stale bulk preview | 權威 DB capacity assertions＋UI |
| 支持者 | recovery→verified records→receipt／preferences | unknown email、expired/reused token、email mismatch、logout/cache、身份衝突 | 無跨帳戶資料、無 enumeration |
| 財務 | 每個準備啟用的 provider sandbox 成功→callback/webhook→receipt | cancel、timeout/uncertain、invalid signature、duplicate/out-of-order、amount/currency mismatch、partial refund、PDF/email fail | provider event＋local txn＋audit 對帳 |
| CMS／內容職員 | 編輯→save→preview→授權發布／歷史還原 | dirty tab、409、1002 revisions、create twice、atomic reorder fail、demo／expired visibility | screen recording／targeted DB tests |
| Admin roles | 依 `src/lib/admin/access.ts` 每個實際角色可完成允許任務 | 匿名401、越權403、直接 API/export/file access、角色撤回、cache 殘留 | UI與server/RLS雙層證據 |
| Bulk/worker | 30天排班、1k選取、500媒體jobs、100收條 | permanent failure starvation、partial retry、crash/lease fencing、通知重複 | 逐筆結果、audit、queue counters |
| Responsive/a11y | 390/768/1366px、keyboard、200% zoom | menu／sticky donation／shortlist／assistant互相遮擋、modal focus、error定位 | screenshots＋a11y結果 |

## 7. 必须保留的既有成果

- 動物後台 server paging／missingPhoto；AnimalForm dirty/preview 保護。
- 助養 review 鍵盤及焦點；實習列表分頁及按需详情；六區導航與身份 cache。
- 義工 DB authoritative booking、共享容量及 bulk snapshot/preview/group transaction。
- 捐款 fingerprint/provider idempotency/COD uncertain recovery；PR #130 原子 audit、body limit、停權再驗證。
- PR #132 修訂、preview、restore 及 409 保留文字；#133 只在 CMS revision table missing 的 seed copy fallback。
- signed proof intent 避免重用 challenge；媒體先 commit 再公開及 cleanup intent。

## 8. 需要外部決定／操作的事項

| 項目 | Codex 必須先完成的可審閱結果 | 最後需要誰提供／批准 |
|---|---|---|
| 正式 migration | 完整差異、dry-run、catalog assertions、backup/restore及 app 相容表 | 有 DB 發布權限的人 |
| 付款開通 | policy gate、每個方法 sandbox evidence、版本化指示、rollback、readiness | 協會財務／發布負責人核准帳戶及啟用 |
| 真實故事／相片／下架 | 明確 IDs、公開影響、diff、預覽與可回復清單 | 內容負責人 |
| 義工正式場次 | 已批准政策下的 14/30天覆蓋／preview／exceptions | 義工統籌 |
| 助養條款／分配與取消說明 | 版本化展示與 consent 機制、待核准 copy 清單 | 協會內容／相關負責人 |
| 本機草稿／下載保存預設 | 7天 opt-in draft、24h export 設定及行為證據 | 協會資料管理負責人確認營運政策 |
| 正式通知／退款／void | recipient/event preview、逐筆原因、audit／重試結果 | 適用角色的具體授權 |
| 部署／region | 同SHA CI、性能比較、相容性 gate、rollback | repository release approval |

這些外部事項不阻止程式、隔離驗證、文件及 PR 的完成；也不能以缺批准為由把未完成程式標作完成。

## 9. 每個 PR 的交付格式

```text
Problem IDs / Tasks:
Base SHA / Head SHA:
Why this change is needed:
Changed behavior and files:
Regression protected (#130/#132/#133):
Schema / config / content dependencies:
Tests actually run (command, exit code, environment):
Before/after UI or performance evidence:
Security / concurrency / failure recovery results:
Operational actions still required:
Roll-forward / rollback limits:
```

Done 的定義：targeted 與必需 gates 通過；UI/API/DB 狀態一致；有 issue→task→PR→test→release 追蹤；未驗證與外部待辦明示。程式完成、正式 schema 完成、公開部署完成、付款啟用完成是四個不同狀態。

## 10. 計劃本身的核對紀錄

已讀四份指定文件的當前內容，核對兩份 HTML 對應問題章節；覆蓋原審核 23 項、再審核 11 項及兩份報告的批量維護要求。檢查 #133 基線 source、AGENTS／CI/scripts／主要修改路径。#133 公開頁與10項隔離檢查來自本對話前一輪驗證；不是本計劃新執行的完整測試。

本交付沒有再次審核所有 live 流程，沒有登入後台 UAT 或跑完整 Bun suite；T00/T24 明確要求執行者補齊。所有新 API／保留期限／retry 次數均標作設計，不偽裝成現有功能。此計劃不修改或覆蓋四份歷史審核報告。
