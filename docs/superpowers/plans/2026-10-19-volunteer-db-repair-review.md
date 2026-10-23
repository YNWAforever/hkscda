# Volunteer production DB compatibility repair — review plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task, following the previously selected Native method. Steps use checkbox (`- [ ]`) syntax for tracking. This document authorizes no production action; the current request is preparation and review only.

**Goal:** 修復正式義工頁面已證實的 RPC 能力缺口，並先以最小去敏感查詢辨別 hourly jobs 失敗原因；不把兩者混作同一根因。

**Architecture:** 沿用既有 app、server 權限、SQL commands、CAS、audit 及 operation receipts。先核對現有 schema 能力與既有 migration 的精確相依；正式 DDL、備份存取及營運啟用分開審批。優先重用原始七檔，遇到不相容的實際 definition 就停止，另提具體 forward correction。

**Tech Stack:** Bun、TypeScript、TanStack Start、Supabase Postgres／PostgREST、Vercel；本次僅作離線來源檢查及文件／SQL 草稿。

**Spec:** 本次使用者直接指示及 `docs/superpowers/specs/2026-09-15-operations-release-requirements.md:19–22`。既有診斷為 worktree 下 `.local-policy-test/live-overview-debug-20261019-3f325acf/FINDINGS.zh-HK.md`；直接指示的授權範圍優先於舊文件。

## Global Constraints

- 本輪不執行任何正式 SQL／migration，不改 actor／Auth／Secret／排程，不讀 token，不觸發工作或通知，不部署。
- 保留工作、原始七個 migration、歷史 FAIL、operation ID、unknown 鎖定、CAS、逐人結果、audit 及已儲存但刷新失敗的處理。
- 只建立本機審閱資料；不 push、改 PR、merge、promote 或恢復付費 Preview 佈建。
- 本地 migration／DB／RLS 演練也尚未執行；任何後續寫入演練先證明 project/container/port/DB/Auth/fixture ownership。`56321/56322` 只是舊線索。
- 不用正式個人資料製作測試 fixture；不測真實通知，不發布 T09 政策／場次。
- `PASS_SOURCE` 不等於 `PASS_DB`、角色驗收、Preview 或正式修復完成。

## Review Focus

- 有人手動改過函式、ACL 或 overload，但 ledger 未反映：以新取得的 catalog 為準，拒絕盲套 guard／重跑。
- 最小統計修復只補 M1：新版待辦及點名仍缺 RPC，不能宣稱主流程復原。
- M5 後已有點名 operation／audit／出席事實：回退須保留 lookup 及 receipts，不能回灌舊 DB 或刪除 operation。
- migration 回應遺失／只成功前綴：先核對 catalog 與真實 provider ledger，再決定下一步，不從第一檔直接重試。
- 舊 jobs 只存錯誤文字：只輸出白名單固定標籤；未知內容保持遮罩，不能推定 actor 或 stage。

## 1. 基線、證據及本輪結果

- Worktree：`C:\Users\laich\Documents\HKCSDA\HKCSDA\hkscda\.worktrees\volunteer-admin-20261013`。
- Branch：`codex/volunteer-admin-20261013`；本輪重新讀取 HEAD：`360a4bb4b8897db258fcb8937afeea2d30b6c06c`。
- 開始時 tracked worktree 乾淨。原始程式、七檔 SQL、Auth、Secret 及所有既有證據不變。
- 前輪正式觀測：`2026-10-19 03:41:07 HKT`；三個 public RPC 不存在、最近五筆 hourly failed。這是前輪快照，本輪沒有刷新正式 DB、部署 metadata 或 CI。
- 前輪已核對正式 merge `3f325acfec8fe279bf8db75efee3dad7fb4dc283` 與本機 HEAD 的整個 tree 相同；不可把舊部署紀錄當作持續狀態。
- 純來源檢查：`python .local-policy-test/live-overview-debug-20261019-3f325acf/review-migration-sources.py`，exit **0**，**27/27 PASS_SOURCE**。沒有連線或執行 PostgreSQL。
- 精確檔案 RAW/LF SHA256、Git blob 及逐項結果見同目錄 `MIGRATION-SOURCE-REVIEW.json`；所有原始檔 worktree blob 與 HEAD blob 相同。

27 項只核對來源身分、字串 guard、canonical LF MD5 及 patch 組合；不證明正式 definition、ACL、DDL transaction、ledger、SQL 語法執行或 runtime。

## 2. 七個 migration 的相依與順序

標號按原檔 timestamp。正式完整集合沿用 **M1 → M2 → M3 → M4 → M5 → M6 → M7**；硬相依與建議順序必須分開。

| 檔案 | 實際作用及既有前置 | 與七檔的相依／停止條件 |
| --- | --- | --- |
| **M1** `20261013110248_volunteer_pending_snapshot.sql` | 建立 `volunteer_pending_snapshot(uuid,text,int,int,timestamptz) → jsonb`。讀取 `admin_user`、`auth.users`、registration/activity；檢查 active admin/staff、confirmed/unbanned；scope、page、size、asOf 有界。 | 可獨立修正總覽統計。是 `CREATE FUNCTION`，不是安全重跑；有任何同簽章／未審 overload 就停止。 |
| **M2** `20261015122315_volunteer_workspace_single_projection.sql` | 只 patch 現有 `volunteer_bulk_command(uuid,jsonb)` 的 list：兩次全集合計算變為一次 materialized projection。 | 依賴 Sept bulk command 的精確原 list 字串且只出現一次。不依賴 M1。 |
| **M3** `20261015181456_volunteer_workspace_page_projection.sql` | 新增 candidates/project helpers、替換原 workspace rows 為 full-set adapter；普通 list 先分頁再計算，shortage 仍評估全部候選。 | **硬依賴 M2 的 list 文字**；guard 另要求原 workspace rows `prosrc` MD5=`ab48504596026f742c062cab50c2ca00`、STABLE/DEFINER、指定 search_path，且兩 helpers 不存在。原基線語言 SQL 亦須核對。canonical LF source 已符合；正式 DB 未驗。 |
| **M4** `20261016084636_volunteer_pending_work_snapshot.sql` | 新增 6 參數 pending work snapshot；只 hydrate 所求頁、計算本頁場次 approved/remaining capacity；把 5 參數 snapshot 改為 adapter；給 task command 加入 `include_pending` gate。 | 需要既有 `volunteer_bulk_admin(uuid)`、task command 的原 pending anchor。**覆寫 M1 的最後定義**；`CREATE OR REPLACE` 在沒有 M1 時技術上也可建立 adapter，但本案不跳過原始 migration 歷史。 |
| **M5** `20261016092546_volunteer_roster_attendance_receipts.sql` | 新增 4 個 roster 函式；復用既有 attendance command、bulk operation、audit；patch bulk detail contract/participant_count、舊 apply fence，包裝 bulk result。 | 依賴既有 bulk operation composite、bulk admin、attendance 10 參數函式、bulk result SQL 語言及三個精確 bulk 字串。**不硬依賴 M2/M3**；離線已確認 M2/M3 後三 anchor 仍各一次。 |
| **M6** `20261016112454_volunteer_roster_legacy_read_envelope.sql` | roster result 加 `groups: []`／`selection: []`，舊 reader 可查看新 action，而不能發明舊 apply group。 | **硬依賴 M5**，且指定 notifications 字串只有一次、尚無 selection。是回退讀取相容的一部分，建議與 M5 作同一 atomic 套用單元。 |
| **M7** `20261016191050_volunteer_task_bounded_hydration.sql` | task support 先選 500 個既有 eligible outbox，再 hydrate registration/activity；不改任務上限、完成排除、通知證據或 mutation。 | 需 task command 精確舊 hydration 字串。與 M4 修改不同區塊，**沒有 SQL 硬相依 M4**；本案放最後，保留其 pending gate。離線亦確認 mail delivery evidence 保留。 |

來源組合的精確確認：

- M3 置於 M2 前，其所需 list anchor 為零；M2 後恰為一次。
- Sept workspace rows 的 canonical LF body MD5 與 M3 guard 相同；CRLF／手動改寫的正式 body 仍可能不符，不可修改 guard 遷就。
- M5 的 detail fields、detail return、legacy apply anchor 在 M2/M3 後仍各一次。
- M6 在 M5 result 上恰有一個 patch 位置；新增空陣列保持舊 apply 禁用。
- M7 在 M4 後恰有一個 hydration anchor，並保留 `include_pending`、mail delivery、retry/complete 分支。
- 七檔沒有頂層 table／column／trigger DDL、資料 backfill 或通知呼叫；M5 函式**之後被呼叫時會寫入資料**，不能把函式定義與函式執行混作同一授權。

## 3. 最小範圍選擇與七檔以外的前置

**A — 僅恢復總覽統計：M1 一檔。** 若 fresh catalog 證實該 RPC 仍不存在，原 M1 就是已確認問題的最小既有修復，不需改 app、actor 或營運規則。這不修復新版待辦／點名，不能用作整個義工流程驗收。

**B — 現行來源完整的七檔相容集合：上述 M1–M7。** 其中 M2/M3/M7 是既有查詢優化；M1/M4/M5/M6 才是三個缺少 RPC 及相容 envelope 的功能集合。可作依賴分析的四檔子集不是完整七檔 release 證據，仍不能以它結案效能或同版本完整 gates。

建議先審 A 作有界統計修復；若要恢復現行主流程，審 B 及下列前置。兩者目前都 **DO_NOT_APPLY**。

| 七檔外前置 | 來源證據與意義 | 目前判定 |
| --- | --- | --- |
| `20260914160736_volunteer_bulk_operations.sql` | 建立 bulk table/admin/command/result/workspace rows；M2–M6 直接依賴。 | 已找到 canonical source；**未刷新正式定義／grants**，不能 replay 歷史檔補缺。 |
| `20260913084920_volunteer_operational_tasks.sql`、`20260913113000_mail_delivery_evidence.sql` | task read/mutations 及 delivery read enrichment；M4/M7 只應改其指定片段。 | 離線組合有保留；正式 `mail_delivery_latest` 及 task body 待核對。 |
| `20260913062952_volunteer_atomic_attendance.sql` | 建立 append-only event、原子 audit、10 參數 attendance command、CAS/locks。 | M5 只 facade，不取代它；函式及 trigger/ACL 未新驗。 |
| **`20261010130100_sp5b2_volunteer_registration_reason.sql`** | 現行 `src/lib/volunteers/repository.server.ts:491–499` 在報名審核傳 `p_reason`；需要 7 參數簽章及保留 audit reason。 | **額外 release blocker 待核對**。舊 ledger max 不能證明實際函式未手動更新。七檔不補這項；若缺，另行具名審查／批准，不能擅加進七檔。 |
| `20261006163243_r01_volunteer_atomic_forward.sql` | 其 target 是 public registration idempotent/clone，相依 guard 亦涵蓋大量 catalog。 | **不是七檔的直接 prerequisite，不自動加入**；不能因檔名早或 ledger 缺口便跑全部 R01。 |

`docs/evidence/audit-remediation-20260927/current-migration-runbook-20261001.md` 記錄來源 timestamp 與 provider ledger version 曾不同。因此要按**函式能力＋真實執行證據映射**核對，不以 ledger max 判定所有後續檔均未執行，也不偽造原檔 ledger。

## 4. 安全、既有資料與未知狀態

- M1/M4/M5 對外 RPC：撤銷 PUBLIC/anon/authenticated EXECUTE，只授予 service_role；函式內仍檢查 actor。不得因 service_role 可執行就跳過應用角色驗證。
- M3 workspace helpers、M5 fact/reason/result helpers：包括 service_role 在內撤銷直接 EXECUTE，僅在既有 definer owner context 內調用。
- 所有本次新增 SECURITY DEFINER 均 pin `search_path=public,pg_temp`；M5 fact/reason 本身為 invoker。既有 `CREATE OR REPLACE` 的 owner/ACL 保留是設計意圖，須 fresh catalog 實證；字串 guard 不代替完整安全比較。
- 七檔不新增 table，不改 RLS policy；但 definer 路徑仍必須驗證現有 table RLS、table/column grants、trigger、owner、public/schema privileges及完整原生相依。
- M5 operation action 是既有 text 欄位的新值，存放逐人 preview/results；唯一 `(actor_user_id,request_key)` 及原 attendance audit 保留。舊 UI 相容依賴 M6，不能丟失。
- **`attendance_preview` 也不是正式唯讀 probe**：它使用 locks、在子交易演練 attendance 後 rollback 該人的 fact/audit，最後仍 INSERT preview operation。正式環境不得用它當「只讀驗證」。
- 本次來源分析不證明最後名額、RLS、audit rollback 或通知成功。T08/F05/UC41 及 T09 邊界不變。

## 5. 備份及回退方案

### 套用前的必要備份（全部未做）

1. 由另獲批准的 DBA／owner 確認實際 project/database、PG 版本、連線角色及備份範圍；不讀 Credential Manager token、不把密碼放 argv／Git／本文件。現有 `backup:db` 的 `--db-url` argv 暴露風險已在舊 runbook 記錄，本案不直接照跑。
2. 建立**新鮮、可還原的 schema＋data 一致快照**。可選 owner 已有的合資格 managed restore point，或經批准的 pg_dump custom archive；不得假設目前有 PITR、付費方案或備份服務，也不恢復付費佈建。來源中的舊 data-only backup 與 10月1日分開 schema/data/roles dump 都不能代替本次一致快照。
3. 另保存本次涉及函式的**完整原定義、參數/defaults、return、owner、raw/effective ACL、function settings**，以及必要 table/RLS/trigger/dependency metadata、真實 ledger 和 source→provider 映射。這是受限備份，非公開報告；roles metadata 不含 role passwords，不讀 token 或 secret。
4. 備份只放 owner 指定受限加密位置；記錄 timestamp、加密檔 hash、ACL、大小、操作者及安全的 off-machine copy 完成狀態，不將生產資料貼進 evidence／PR。
5. 分開驗證解密完整性與 restore。受保護 DR restore 演練須另有明確範圍及隔離證明；**不把正式 dump 變成一般測試 fixture**。新 schema 升級／角色測試使用 synthetic data。還原點可用、DR restore、storage bytes 等未證實時逐項標 BLOCKED。
6. 若現有寫入或工作妨礙安全變更，先由 owner 審批必要的有界 maintenance 安排；不自行改排程、Secret 或終止他人 session。

### 回退決策

| 時點 | 最小處理與限制 |
| --- | --- |
| 本單元尚未 COMMIT，或 guard／lock／statement timeout 失敗 | 只 rollback 本次 owning transaction；確認無 schema/ledger 半套用。原錯誤與成功前綴保留，不取消其他 session。 |
| 已 COMMIT，只讀 projection 有問題，尚無新 operation/fact | 以備份精確原定義建立**另審 forward correction**，只還原受影響 projection/ACL。不要直接反向字串替換、DROP CASCADE 或回放古舊整檔。 |
| M5/M6 後已有 operation／attendance／audit | 保留新事實、receipts、M6 安全 envelope 及 lookup 能力。先查明 unknown 結果；只有已驗證相容的 app／forward correction 可用。不能整體撤銷 RPC 以致 lookup 也失效，不能刪 operation 或用舊 DB 覆蓋新出席／audit。 |
| migration API 回應遺失或結果 unknown | 停止；另經批准以唯讀 catalog＋真實 ledger＋provider receipt 對照 named hash，先辨別是否已 COMMIT，再決定重試。七檔多個 `CREATE FUNCTION`／一次性 patch 都不保證可重跑。 |

正式回退也屬正式變更，須另批；本包不提供可直接對正式執行的 destructive down SQL。不預先宣稱任何較舊 app SHA 已與新 roster operations 相容。

## 6. Jobs 白名單診斷契約

草稿：`.local-policy-test/live-overview-debug-20261019-3f325acf/JOBS-WHITELIST-CLASSIFICATION.DRAFT.sql`。

- 一段 SELECT，只讀最新五筆 `volunteer-hourly` 及最後 complete 時間，不執行 application RPC。
- 只回傳 bucket/status/update time、固定 error shape、七個 stage 白名單、固定 safe_code/diagnosis_class、last_success/observed time。
- 現行三種 actor code 分別分類 unconfigured/invalid/ineligible；PGRST202/42883、PGRST203、42P01/42703、42501、timeout/lock/deadlock/serialization/connection codes 各有固定類別。
- 歷史 `b039bba7` service 儲存 `Error.message`，非 Error 則存 `job_failed`；repository 的精確 actor 字串是 `volunteer_job_actor_missing`。本草稿**只精確匹配該來源字串**，返回 `LEGACY_ACTOR_NOT_RESOLVED`，不把它誤譯成已確定「未設定」。
- `job_failed`、`UNEXPECTED` 或任何其他內容都保持未分類；不以 substring/任意 uppercase 字串當可信錯誤碼，不輸出原 error/message/stack/correlationId/actor/lease owner。
- stage 缺少仍是 `unavailable`，不由錯誤文字推測執行階段。
- 若仍未分類，停在 evidence limitation；任何擴大採樣／logs／新 whitelist 都需新審閱，不自動讀完整 error。
- 即使確定 actor 問題，也只回報；不設定 actor、不重試 hourly、不執行生成／補位／評核／通知。

另附 `RPC-PREFLIGHT-METADATA.DRAFT.sql`：最多 50 列函式 metadata，供判定七檔前置及 `p_reason` overload；只列 default 參數數量，不輸出 default 原文，只列 search_path 而不列任意 function config；不呼叫函式。兩份草稿**均未執行**，均不在前輪兩段 SELECT 的批准範圍內。此初步 inventory 不代替套用前完整 catalog/ACL/dependency 備份。

## 7. 後續執行計劃（本輪不執行）

### Task 0: 審閱及 fresh capability admission

**Files:** 本計劃、兩份 `.DRAFT.sql`、原七檔、`MIGRATION-SOURCE-REVIEW.json`。不改 app／migration。

**Interfaces:** 消費前輪快照及本輪 canonical source；產出 scope A/B 選擇、具名 hash、fresh capability/owner/ACL 對照及 jobs 固定分類。

- [ ] Owner 審閱本包；額外批准所選正式唯讀草稿後才各執行一次。
- [ ] 對照每個實際 overload/defaults/owner/security/search_path/grants/body hash，尤其 M3 原 rows hash、M4/M7 task 及 M5 bulk branches。未知 body/ACL/相依一律 HOLD，不取消 guard。
- [ ] 確認 `p_reason` 現行 7 參數 RPC。若缺，提出該具名檔的獨立相容性審閱，不擅自加入或重播歷史 migration。
- [ ] 任何正式 DDL 前完成第5節備份／回退 gate，並取得選定 exact package 的正式批准。Jobs 啟用不包含在此批准。

### Task 1: 隔離 upgrade／rollback 與角色驗證

**Files:** 原七檔；既有測試 `src/lib/volunteers/jobs/tasks.database.test.ts`、`jobs/taskHydration.database.test.ts`、`bulk/listRead.database.test.ts`、`bulk/attendance.database.test.ts`、`supabase/rls-tests/volunteer-roster-attendance.test.ts`。若發現真問題，先另建 regression 再修最小 source。

**Interfaces:** 以已證實屬本案的 disposable DB/Auth、synthetic fixture、明確前置 source schema 為輸入；輸出 upgrade/runtime/rollback receipts，不能沿用不明 container。

- [ ] 核對隔離所有權及可用工具；此主機有 Bun/Python，尚未找到 host `psql/pg_dump`，不下載或換用正式連線。既有 local stack 是否存在未查。
- [ ] 在獨立 fixture 重現缺 RPC／錯序／未知 body 的拒絕，再按 canonical 順序套用選定 source；注入中途失敗，證明整個批准單元及 ledger 是否 atomic。
- [ ] 分開驗證 M1-only 及七檔終態；M1-only 的新版待辦／點名預期仍不可用，不能寫成 PASS。
- [ ] 通過 fixture 環境 gate 後，計劃命令：`bun test --isolate src/lib/volunteers/jobs/tasks.database.test.ts src/lib/volunteers/jobs/taskHydration.database.test.ts src/lib/volunteers/bulk/listRead.database.test.ts src/lib/volunteers/bulk/attendance.database.test.ts supabase/rls-tests/volunteer-roster-attendance.test.ts`。先處理 tests 所需 synthetic manifest，不沿用過時 actor/operation IDs；未啟用而 skipped 不算 PASS。
- [ ] 確認 pending 日期等值／過期／未來及分頁、literal search、capacity 是觀測；list 的 0/1/25/>25 與 shortage/full-set 一致。
- [ ] 驗證 admin/staff允許、其他角色／disabled/unconfirmed/banned／browser roles 拒絕；CAS、雙擊、並行最後名額、逐人 preview/cancel/partial、response-loss lookup、audit rollback、reload failure 及舊 envelope 不可 apply。
- [ ] 若涉及額外 `p_reason` prerequisite，另跑其 migration/body/real DB 測試及兩種競爭順序；上述五檔測試不涵蓋全部報名審核契約。
- [ ] 在同一最終 source SHA 跑 `bun run typecheck`、`bun run test`、`bun run lint`、`bun run build` 及適用 browser/API gates，逐層列 PASS/FAIL/SKIPPED/NOT_RUN。保留原始錯誤，不把離線來源檢查當 RED→GREEN。

### Task 2: 另經批准的正式套用與 postflight

**Files:** 被批准的 exact migration hashes、受限備份／原 definition、provider receipt、fresh pre/postflight metadata。

**Interfaces:** 消費完成的 Task0/1 與 exact production approval；產出 genuine provider ledger→source hash 映射及有界唯讀 postflight。沒有部署或營運啟用。

- [ ] 在已核實的執行器以同一 DB session、明確 transaction 執行，`lock_timeout=5s`、`statement_timeout=30s` 在 DO 前設定；任何 guard/lock/statement 失敗立即 rollback 該單元並停止。
- [ ] **M2/M3、M5/M6 視為成對 atomic 單元**，避免短暫停在中間相容狀態。若要七檔一個 atomic package，保留原檔內容與順序並記錄七個 hashes。執行器若不能證明 DDL＋ledger 同交易，先 HOLD，不假設 SQL editor/API 一定包 transaction。
- [ ] 真實 migration entry 依實際執行單元記錄。若 provider 一次套用七檔 package 只產生一個 version，就如實映射該 version→七檔 hashes，不宣稱有七個 ledger increments；不得手動造原 timestamp ledger。
- [ ] 不執行 folder `db push`、reset、額外 R01 或其他六檔 SP5b2；若實際狀態超出 admitted profile，另作修復審閱。
- [ ] 經批准的唯讀 postflight 確認 exact signatures/defaults/owner/grants/search_path、僅預期 schema 差異、ledger、既有 rows/audit/operation 不變。若 PostgREST 仍失敗，先辨別 catalog/暴露/cache，不自行 `NOTIFY` 或觸發 job。
- [ ] 正式登入 UI/API smoke 的身份、資料及是否允許寫入另行定義；不能用出席 preview、審核或 job 當唯讀 probe。正式三週期 jobs／真人 UAT／實機測試仍獨立。

## 8. 狀態與審閱交付

| 層次 | 本輪結果 |
| --- | --- |
| 本機 HEAD／原檔 hash／27項來源相依檢查 | **PASS_SOURCE**，exit 0；來源證據可重跑 |
| 前輪正式 RPC 缺少／五筆 job failed | **歷史已觀測 FAIL**，03:41 HKT 快照；不是本輪新查詢 |
| 本輪正式 jobs 原因細分／fresh catalog／`p_reason` 實際簽章 | **NOT_RUN**；正式修復 admission **BLOCKED** 等待審閱／額外核對 |
| 新鮮備份、restore／upgrade／rollback、DB/RLS/角色/browser、完整 gates | **NOT_RUN**，沒有借用歷史通過數字 |
| 正式 DDL／actor／Auth／Secret／排程／工作／通知／部署 | **NOT_RUN**，不在本輪執行範圍 |

兩份 SQL 已作來源及輸出範圍審閱；本機沒有 `pglast`，未安裝依賴，SQL parser／DB 執行驗證均為 **NOT_RUN**。`git diff --check` exit 0；新文件另作離線行尾空白檢查，exit 0。

新增一份位於 docs、尚未 stage／commit 的計劃及 ignored 調查草稿／來源檢查證據。既有 tracked 檔案沒有改動，沒有修改原七檔或應用程式，沒有 commit/push，也沒有新增任何雲端副作用。

## 9. 已批准查詢的工具阻礙紀錄

2026-10-19 使用者明確批准兩份已準備 SELECT：jobs 白名單分類及 RPC 前置 metadata。此批准不包含 migration、任何寫入或營運啟用。

- Jobs 查詢經同一 Supabase connector 嘗試兩次，均回報 `Selected model is at capacity`；工具明確表示動作未執行。
- RPC 查詢首次自動審查逾時，沒有 DB 回覆；按工具允許重試一次後，同樣回報容量不足並明確表示未執行。
- 兩者均無正式 DB 結果；jobs 根因細分、七檔正式前置及 `p_reason` 實際簽章保持 **NOT_RUN**，本次執行為 **BLOCKED_AUTOMATIC_APPROVAL_INFRASTRUCTURE**。
- 這不是 SQL 被 DB 拒絕，也不是安全判定；沒有改身份／介面／SQL 去繞過審查，沒有讀 token。
- 原有 exact SQL 批准已記錄；目前所缺是可完成的自動審查，不是要求使用者再次批准相同 SQL。

逐次紀錄見 `.local-policy-test/live-overview-debug-20261019-3f325acf/APPROVED-PREFLIGHT-ATTEMPTS-20261019.json`。先前正式快照仍屬歷史證據，本次沒有刷新或增加根因結論。

## 10. 使用者批准後再次重試：RPC 成功，jobs 仍受阻

本節為 2026-10-19 再次重試的最新結果；第9節保留為上一輪歷史。原兩段 SELECT 本輪各嘗試一次，沒有改查詢或身份。

- Jobs 分類再次因自動審查 `Selected model is at capacity` 而未執行，沒有新 jobs 分類。
- RPC metadata 查詢成功回傳 **16列：8個存在、8個不存在，沒有額外 overload**。只讀 metadata，沒有執行 application RPC。
- 證據為同目錄 `PREFLIGHT-RETRY-RESULTS-20261019.json`；owner/raw ACL 的 connector 遮罩沒有反推，保留 effective-role booleans。完整 owner/raw ACL admission 仍未完成。

### 已確認的相容性阻礙

1. **報名審核缺少 `p_reason`。** `set_volunteer_registration_status_with_audit` 只有 `(uuid,uuid,timestamptz,text,text,boolean)`、default argument count=2，`has_reason_argument=false`。現行程式會傳 `p_reason`，正式 API 與之不相容。這不是出席 RPC：`set_volunteer_attendance_with_audit` 的10參數簽章已包含 `p_reason`、defaults=6。沒有送真實審核請求驗證寫入錯誤。
2. **M3 的正式 hash 不符合 guard。** workspace rows 正式 `prosrc` MD5=`8d70bdb192b27066ed63034323db9a8f`；M3 只接受 `ab48504596026f742c062cab50c2ca00`。即使先完成 M2，M2 也不修改 rows 函式，因此不能解決 M3 這項 guard 阻礙。
3. **CRLF 相容性有具體離線證據。** canonical baseline 的 workspace rows、bulk admin、bulk command、bulk result 各自改成 CRLF 後，MD5 均與本次正式值吻合；mail-enriched task body 則吻合 LF。M2 的 LF 多行 old branch 在 LF 重建版本匹配1次，在與正式 hash 相符的 CRLF 重建版本匹配0次，預期先於 M3 被拒絕。正式 function body 原文未讀，這不是 DB 執行結果。
4. 兩個 pending RPC、四個 roster RPC/helper 及 M3 兩個 workspace helpers 均不存在。八個既有函式均為 definer、查得的 search_path 為 `public, pg_temp`，PUBLIC/anon/authenticated EXECUTE 均false；外部 command 的 service_role EXECUTE 為true，內部 bulk/admin/rows/result helper 為false，不能為了修復而擴大 helper grants。

因此，第3節 B 的七檔順序仍是**邏輯相依順序**，不是目前正式 DB 可直接執行的 package。第1節27項 PASS_SOURCE 僅涵蓋 LF 基線，不能升格成正式前置全通過。

### 修訂的最小下一步（未執行）

- M1-only 仍是補回總覽統計的最小候選，但仍須完成備份、exact scope admission 及另行正式批准。
- 完整工作流程先在已證實隔離 DB，以本次吻合的 CRLF bulk/workspace＋LF task 基線重現 M2/M3 拒絕，及六參數 registration RPC 對現行 `p_reason` 呼叫的不相容。
- 然後才提出具名最小 source/release correction：只接受完整 metadata 證實等價的 LF／CRLF 來源，讓 patch anchor 使用對應換行，保留無關 body／owner／ACL／authorization／mutation；不在正式現場刪 guard、接受任意 hash或全域重寫函式。
- 報名審核的七參數 reason migration 是額外具名依賴，須另審既有資料／audit／相依，不能擅自加進七檔或盲 replay。
- Jobs 根因仍待原白名單 SELECT 成功；不以 actor 設定缺口取代實際失敗分類，不設定 actor、不重試工作。

`PREFLIGHT-SOURCE-LINE-ENDINGS-20261019.json` 記錄離線 hash／anchor 比較。正式 migration、資料寫入、DB/RLS/browser tests、完整 gates、actor/Auth/Secret/排程變更、token、工作／通知及部署均未執行。

## 11. 隔離重現授權後：DB preflight 受阻；jobs 原查詢成功

使用者其後批准本機 synthetic DB 的 RED→GREEN 及最小修正。本輪先檢查隔離：

- `.local-policy-test/supabase/config.toml` 的 project 為 `hkscda-volunteer-20261013`、API 56321、DB 56322；這只是設定，不是目前 DB 所有權證明。
- Docker context 為 `desktop-linux`，endpoint 為本機 named pipe。sandbox 內 `docker ps` exit 1／permission denied。
- 兩次經原 exec 工具申請唯讀容器清單的擴權檢查，都因自動審查模型容量不足而未執行。之後將清單縮至上述已知 project，再經同一審查重試，仍審查逾時；沒有取得容器／label／port binding 資料。
- port metadata 未返回上述常用 stack ports 的 listener；主機亦未找到可用的 PostgreSQL executables 或已安裝 PGlite。沒有下載工具、改用其他 Docker 介面或使用不明 localhost DB。
- 因 container/DB/Auth/fixture 歸屬尚未核實，**沒有任何本機 DB 寫入、DB RED/GREEN 或 SQL 修正**；不把離線 hash 比較充當真實 DB 回歸。

阻礙紀錄：`SYNTHETIC-DB-PREFLIGHT-BLOCKED-20261019.json`。最小解除條件是原 exec 工具的自動審查可完成，從而執行該 project 的唯讀 Docker metadata 核對；不是增加正式 DB 授權。

另一方面，原 jobs 白名單 SQL 本輪一次成功。觀測時間 **2026-10-19 13:03:52.288206 HKT**，最新五筆（08:15–12:15 HKT）全部 `failed`／stage=`preflight`／code=`VOLUNTEER_JOB_ACTOR_UNCONFIGURED`。這五筆的根因已確認為 actor 未設定；不倒推較早 legacy rows 的具體錯誤。`last_success_at` 仍null，表示保留表內未找到 complete。

結果見 `JOBS-CLASSIFICATION-RESULTS-20261019T050352Z.json`。這次只讀 SELECT，未 claim／重試／觸發工作，也未改 actor、Auth、Secret 或排程。工作啟用仍是獨立營運決定。

## 12. Docker 核對恢復後的本機實作

其後按使用者批准重試原工具，Docker 唯讀核對成功。實際 source stack 為 `hkscda-volunteer-perf-20261015`，四個 DB/Auth/REST/Kong 容器 labels/workdir/network 與原 worktree 相符；來源 Auth users 全為 synthetic domain。原 cohort 保留，另建本輪空 DB，只複製 schema metadata，於其中以回退交易取得真實 RED→GREEN。

最小實作為 `src/lib/volunteers/repair/prepare.server.ts` 及兩個回歸檔，**不改寫原七檔／reason migration**。準備器只產生具名 reason＋M2/M3 repair payload；只接受 pinned source hashes／已知舊 status body 及 LF/CRLF rows body，跨兩種換行的 anchor 合計必須恰好一次，保留原 metadata/grant/非列表分支。沒有新增 API、路由、通知或自動 migration。

實際原問題 RED：3 pass／6 fail、exit1；獨立 M2/M3 分別拒絕，命名 `p_reason` 為42883。補強混合 anchor 及 defaults drift 的安全 RED 後，本機 GREEN 為17 pass／0 fail。TypeScript 初次型別錯誤已修正，前置 typecheck exit0；完整同 commit gates 另保留 receipts，不將 skipped DB/RLS 當 PASS。

審閱摘要：`docs/evidence/volunteer-db-repair-20261019.md`。完整 ignored 證據在 `.local-policy-test/volunteer-migration-compat-20261019/`。來源及新 DB postflight counts 已核對；沒有正式 migration、actor/Auth/Secret/排程變更、token、真實工作／通知、push、merge 或部署。
