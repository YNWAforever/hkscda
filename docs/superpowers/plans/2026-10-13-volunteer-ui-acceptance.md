# HKSCDA Volunteer UI and Acceptance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 13個頁面對齊、同名身份可辨、admin／staff可完成每日工作，並有可信的發布驗收。

**Architecture:** 在現有VolunteerAdminShell及共用工作台收斂頁首與狀態；保留既有政策／bulk規則，營運啟用由核准版本驅動。角色驗收透過專用fixture完成，不借admin權限假裝staff。

**Tech Stack:** 遵循主計劃及repo lockfile；沿用已安裝Playwright與既有browser fixture模式，不為本輪加入新UI測試框架。

**Spec:** 主計劃、F08／F11／F13、Page_Implementation_Matrix.csv、User_Cases_Combined.csv。

## Global Constraints

主計劃Global Constraints全部適用。UI文案雙語、品牌token、LoadFailure／ConfirmActionDialog／StatusBadge及日期formatter保持一致。T09營運核准與T13正式發布有獨立外部前提；不影響其他本地程式修復繼續完成。

## Review Focus

同名身份、手機失去主操作、未儲存草稿、跨頁bulk選取、舊預覽與通知accepted／delivered分別由T11／T12驗收。

## T12 隔離角色與每日工作fixture（可在A批開始）

**Files:** 沿用`scripts/test-isolated-acceptance.ts`及既有CI Supabase fixture／browser fixture；新增`scripts/fixtures/volunteer-daily-work.ts`及`.test.ts`、`scripts/verify-volunteer-workspace.mjs`、對應fixture HTML／Vite入口（如現有registry尚未提供）。業務測試延伸既有volunteer database／RLS suites。

**Interfaces:** `createVolunteerDailyWorkFixture(client, {prefix, now})`只能接已驗證local／批准private staging；回傳`fixtureId, actorIds, profileIds, activityIds, registrationIds, cleanupManifest`，不回token進報告。`cleanupVolunteerDailyWorkFixture(client, manifest)`只清理由該manifest建立的隔離行；先驗origin／project與prefix。

- [ ] 先測production origin或production project ref被拒絕；清理不能接受任意table／全表條件。專用stack為API56321／DB56322，不重用其他worktree。
- [ ] 建admin、staff A、staff B、treasurer、disabled及anonymous；使用synthetic .invalid聯絡資料及AUDIT前綴。帳戶由local fixture建立，非正式後台邀請。
- [ ] 最小情境：3同名不同ID、26個跨頁身份、過期／未來pending、容量最後1位、已批准／候補、不同出席、政策衝突、3通知狀態。1001選取壓測另獨立fixture，免每個unit test都建千筆。
- [ ] 固定注入now；只對真正業務時鐘測跨日，不能把所有測試綁定執行當日。設定sandbox通知sender，禁止live Resend寄送。
- [ ] 執行UC25–UC39、UC44–UC46及UC47；每案記期望、實際、actor、DB／audit結果與清理。讀取角色、HTTP角色及RLS角色分開留證據。
- [ ] 提交`test: add isolated volunteer daily work acceptance fixtures`。無Docker／private staging時記blocked及確切缺項，不改腳本目標以使用production。

## T11a 十三頁頁首與內容對齊（F11）

**Files:** 修改`VolunteerAdminShell.tsx`、`volunteerWorkspaceCopy.ts`、`volunteer-workspace.css`、`src/routes/admin/volunteers/people.tsx`及13頁相關元件；保留`adminNav.ts`作單一導航來源。既有`volunteerWorkspace.test.ts`及`VolunteerShellOverviewEnglish.test.tsx`加入回歸。Page Matrix列每頁主元件及操作。

**Interfaces:** 新增`VolunteerPageHeading({pageId, actions?, description?})`（放`src/components/admin/VolunteerPageHeading.tsx`）：pageId為現有`VolunteerWorkspacePageId`，標題／預設description來自雙語pages copy，輸出同一`.vw-page-header`。各leaf頁使用這個元件，承接自己的refresh/create等actions；shell繼續管理導航。people原shell intro模式需同步改為leaf heading，避免雙h1；person等動態詳情保留既有title/intro行為。

- [ ] 先選overview、activities、people作三種pilot；每個頁面loading／error／ready都恰好1個h1。不要一邊保留shell intro，一邊又新增leaf header。
- [ ] 把其他10頁逐頁遷移，header後保留本頁workflow section anchors。共用頁首採32px桌面／16px手機容器邊界，主表／filter和頁首對齊；移除雙層padding來源，而非不斷添加全域CSS override。
- [ ] 保留現有sidebar的1199px切換及44px目標；只在觀察到擠壓處採現有全站收合。不要在13頁複製導航清單或重寫routeTree.gen.ts。
- [ ] 活動／月曆仍使用同一workspace；settings基本欄位先行，PolicyAdvancedFields按需展開，草稿資料不因收合卸載而丟失。operations空狀態分publicMode/adminMode，不再暗示管理員只能看自己電郵。
- [ ] 對sources／simulation／daily-settings保留前置阻礙及具體下一步；F14評核區的loading/error由T10b處理，不能讓統一版面吞掉狀態。
- [ ] 跑既有workspace、shell、各頁English及adminCopyGuard；local browser完成UC42與UC48，記390×844／1440×900、300%zoom、Tab／Escape／focus復位及整頁overflow結果。
- [ ] 提交`refactor: align volunteer workspace page headings and controls`。可分pilot及remaining兩個可獨立review提交，不附帶改業務規則。

## T11b 同名身份選擇（F13）

**Files:** 修改`VolunteerQualifications.tsx`、`QualificationProfileSearch.tsx`及相應copy／既有`QualificationsAssessmentsEnglish.test.tsx`、`VolunteerPeopleEnglish.test.tsx`。

**Interfaces:** 沿用`QualificationProfileSearch({onSelect(id), disabled})`，所有寫入仍以profile UUID、revision及證據驗證；清楚呈現同名的次要識別。現有已授權email可顯示或依產品慣例遮罩，另加短ID保證遮罩後仍能區分；姓名不是唯一key。

- [ ] 測3個同名、同tier、同status身份的選項可區分；同樣email／遮罩字樣時以短ID補足，不自動合併。
- [ ] 將模糊下拉改為使用既有搜尋器或補足每項識別；從people/$id進入會選中正確profile。切身份清除未提交的資格draft／舊證據。
- [ ] 與T07共用body搜尋及identity清理。核實確認顯示待核對身份、證據來源及預期revision，不能因自填Remark自動授權。
- [ ] 執行UC12／UC32／UC51及中英文測試；提交`fix: distinguish volunteer profiles during qualification review`。

## T09 營運啟用（F08）

**Files:** 沿用PolicySettings、Sources、DailySettings、Simulation、bulk generation及`sessionCoverage.server.ts`；啟用清單放`docs/volunteer-operational-launch.md`（新增），必要UIcopy回既有模組。這不是再造政策引擎。

**Interfaces:** `LaunchEvidence`記approvedPolicyVersion、effectiveFrom、scope、businessOwner、previewId、generatedActivityIds、publicCheck、rollbackOwner；記錄ID只放受控營運證據，不公開。

- [ ] 先由負責人確認場地、時段、容量、資格、報名窗口、團體／新手規則及例外日；原9個draft不視為批准。若未核准，程式修復可繼續，但本任務保持blocked。
- [ ] 在隔離環境以核准規則完成政策→source→四星期日期→預覽→生成；UC35／UC44驗重複執行冪等、版本衝突及已存在場次處理。
- [ ] 13個歷史活動及測試標題先列分類建議，不能自動刪除、套政策或批准逾期pending。每筆有報名的活動需保留歷史與稽核。
- [ ] 若另獲正式啟用授權，才按同一版本逐步發布；驗公開可見、合資格可預約、不合資格有原因、staff可跟進。public空狀態消失不等於預約流程已驗收。
- [ ] 保存營運簽核及UC13／UC14／UC35／UC44結果；程式改動如有提交`feat: guide volunteer operational launch`，資料操作不得藏在seed或migration裡。

## T13 整合及發布驗收

**Files:** 更新本計劃task ledger、`docs/evidence/volunteer-admin-20261013/`（實作時新增）及repo既有CI對應證據；不直接修改舊輪證據。

**Interfaces:** 每項證據至少`taskId, caseId, sha, environment, command, exitCode, expected, actual, status, artifactPath`；未執行command不得填exitCode=0。

- [ ] 核對13主T、16個F、13頁及52案映射；T10a/b及T11a/b全部完成才可關閉其parent task。對尚blocked者寫具體角色／資料／批准前提。
- [ ] 完整repo執行typecheck→test→lint→build及CI品牌gate；專用DB／RLS另驗。若某gate失敗，診斷同版本影響後修復，不以舊green結果代替。
- [ ] 依admin每日開工、staff審批／出席、主管分派、admin四星期排班、維運故障恢復五條完整journey做UAT。停在中途的case維持未通過。
- [ ] T05／T08按13頁代表API交付同條件before/after，沒有獨立頁面樣本者明示未量測，不複製bulk中位數到每頁。
- [ ] 形成可review分支／PR：問題、修改、資料migration影響、測試、剩餘阻礙、回退。此步不包含merge；repo要求明確release approval，main merge會自動部署。
- [ ] 如後續獲准部署，同SHA檢查readiness、3個連續cron週期、待辦數量、角色、public預約與通知證據；未達標回退批准配置／版本，不drop資料表或刪報名。
- [ ] 最後報告精確區分「程式完成」「隔離驗收完成」「正式營運完成」。沒有正式授權／fixture的部分維持blocked，其餘完成物照常交付。
