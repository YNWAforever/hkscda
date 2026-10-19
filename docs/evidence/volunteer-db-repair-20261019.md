# 義工 DB 相容性修正：本機審閱紀錄

日期：2026-10-19 HKT。來源基線 `360a4bb4b8897db258fcb8937afeea2d30b6c06c`，原隔離 branch `codex/volunteer-admin-20261013`。

## 本次交付

新增 server-only、無 DB／網絡副作用的 `src/lib/volunteers/repair/prepare.server.ts`。它只準備三段具名 SQL，不執行：

1. 既有 `20261010130100_sp5b2_volunteer_registration_reason.sql` 的 prerequisite guard＋原檔，補齊命名 `p_reason` 簽章。
2. 既有 M2 的 LF／CRLF 精確 branch patch。
3. 既有 M3 的已知 LF／CRLF body hash 及精確 branch patch。

原七檔 migration 與 reason migration 都沒有改寫。準備器限制三個輸入的 canonical-LF SHA256；未知輸入直接拒絕。這是既有正式 schema 的具名修復候選，不是 folder `db push` 或自動發布機制。

完整七檔的邏輯順序仍是 M1→M2→M3→M4→M5→M6→M7；reason 是額外 prerequisite。本候選只包含 reason＋M2/M3，沒有宣稱其他缺少 RPC 已在正式建立。

## 問題、根因、修正

| 問題 | 真實 PostgreSQL RED | 最小修正及保留條件 |
| --- | --- | --- |
| M2 canonical LF payload 對 CRLF bulk body | `P0001`：exact unmodified list branch 不符 | 只辨認既有 branch 的 LF／CRLF 形式；兩形式合計必須恰好一次。不全域轉換 live function body。 |
| M3 對已觀測 CRLF rows body | `P0001`：workspace projection definition 不符 | 只增加已知 CRLF hash `8d70bdb192b27066ed63034323db9a8f`；原 LF hash、definer／STABLE／search_path guards 保留。其 list patch 同樣要求跨換行形式恰好一次。 |
| 舊六參數 status RPC 不接受 `p_reason` | `42883`：命名參數找不到函式 | 使用既有七參數 reason migration，不改名額／資格／候補規則。套用前檢查已知舊 body、defaults、owner/executor、language、return、settings、raw/effective grant 條件，拒絕未知 body、放寬 ACL 或已存在的新簽章。 |

準備器保留既有 bulk command 的 owner／ACL／settings，以及後續加入的非列表分支。測試以額外 SQL 分支實際回傳 sentinel，並驗證 admin/staff 可用、treasurer 拒絕。新 workspace helpers 仍不可由 PUBLIC／anon／authenticated／service_role 直接執行。

## 隔離環境證據

- Docker context `desktop-linux`，endpoint `npipe:////./pipe/dockerDesktopLinuxEngine`。
- 實際來源 project 是 `hkscda-volunteer-perf-20261015`，不是舊 `.local-policy-test/supabase/config.toml` 的 `hkscda-volunteer-20261013`。以 DB/Auth/REST/Kong 的 labels、network、port bindings 及 workdir 確認；來源 workdir 指向原 worktree 的 `node_modules/.codex-volunteer-perf-20261015`。
- 原 stack API/DB ports `56321/56322`；DB image `17.11.0.004`，實際 PostgreSQL `17.11`。
- 唯讀 aggregate：Auth users 1,267，全部 `example.invalid`；profiles 863，pending registrations 56。未讀 email 原值、token、password 或正式 credentials。
- 本輪建立 `hkscda_compat_20261019_b7e198982637`，從 template0 建空 DB，僅還原 synthetic schema metadata；沒有複製來源 Auth／業務資料。補齊來源已有的 citext、pg_trgm、pgcrypto、uuid-ossp、pg_stat_statements extension。
- DB regression 執行前重新核對 Docker context、完整 container ID、project/workdir/running 及新 DB 身份／空資料。只在本輪 DB 的 rollback 交易建立合成 actor／活動／報名。
- 測後新 DB 的 Auth、profile、registration、outbox、audit、jobs 都為0；來源上述 counts 不變。保留此空 fixture 與所有證據，不清理其他資源。

Ownership、來源 schema-only、setup logs、postflight counts 均保留於 ignored `.local-policy-test/volunteer-migration-compat-20261019/`。未使用現成測試 helper 的 production/CLI capture 路徑，未讀 Credential Manager token。

## RED→GREEN

回歸檔：

- `src/lib/volunteers/repair/prepare.database.test.ts`
- `src/lib/volunteers/repair/prepare.test.ts`

實際首次完整 RED：**3 pass／6 fail，exit 1**。M2、M3、`p_reason` 各有獨立的 PostgreSQL 失敗；未知 workspace body／弱化 definer 仍被拒絕。

加入「混合 LF/CRLF duplicate anchor」案例後，先得到 **0 pass／1 fail，exit 1**；當時修正仍錯誤接受兩個等價 anchor。其後收緊成兩種形式合計恰好一次，未刪除原 guard。

本機 GREEN：**17 pass／0 fail**，涵蓋14個實際 DB 案例及3個來源 allowlist 單元案例：

- LF/CRLF body、CRLF payload transport、獨立 M3 stage。
- 0／1／25／27 筆、第二頁／空頁及正反排序。
- 命名 `p_reason`、audit reason、舊六參數 caller、舊版本 conflict。
- 未知 projection/status body、弱化 definer、broadened grant／變更 defaults 拒絕。
- 重跑拒絕及已套用簽章保留、整個 package savepoint rollback。
- 非列表分支保留、admin/staff／treasurer、helper/RPC grants。

保留的其他失敗不算產品 RED：setup ownership receipt 的 PowerShell 布林錯誤；schema restore 的空 public 已存在及缺 citext（均回退後修正）；首次 GREEN 的 audit timestamp 同值排序假設；首次 typecheck 的 TransactionSQL／回傳型別標註錯誤。相應原 logs 沒有覆蓋。

Defaults 保護亦先在真實 DB 取得獨立 RED：舊 body hash 不變、default 改為 false 時，早期候選仍會接受；其後增加完整 default expression guard，拒絕覆蓋該變更。

## 同版本驗證及重現

最終 commit 的 typecheck、全 repo test、lint、build 由下列命令產生 receipt；每份記錄 HEAD、時間、exit code、log hash 及是否 HEAD 不變：

```text
bun --no-env-file .local-policy-test/volunteer-migration-compat-20261019/run-gate.ts typecheck
bun --no-env-file .local-policy-test/volunteer-migration-compat-20261019/run-gate.ts test
bun --no-env-file .local-policy-test/volunteer-migration-compat-20261019/run-gate.ts lint
bun --no-env-file .local-policy-test/volunteer-migration-compat-20261019/run-gate.ts build
```

Runner 只傳平台 path 類環境，禁載 `.env`，不繼承 provider／production credentials。Full test 實際執行 `bun --no-env-file test --isolate`；只啟用本輪14個 owned DB cases，其他未啟用的 DB/RLS fixtures 保持 skipped。Skips 不算 PASS。Typecheck 前置已 exit0；同 commit 最終結果以 ignored `*-final.json/log` 及最終交付為準。

同一 fixture 的 RED 可用 `HKSCDA_COMPAT_TEST_ALLOW_OWNED_DB=1` 加 `HKSCDA_COMPAT_TEST_BASELINE=1` 重播原 M2/M3 payload，在不放寬 assertions 的情況下重現；GREEN 只設前者。此旗標僅在 test，production preparer 沒有 baseline 模式。

Review SQL 由本機 `prepare-review.ts` 產生，含 BEGIN、5s lock timeout、30s statement timeout、三段具名 SQL 及 COMMIT。輸出名稱綁定生成時 HEAD，manifest 另記 preparer／三個原檔／SQL hash。**只產檔，不執行**；任何正式套用仍須另批 fresh catalog、備份、升級／回退及角色驗收範圍。

## 驗證邊界及回退

- **本機程式＋實際 synthetic SQL regression：**已取得 RED→GREEN；最終同 commit gates 另有 receipt。
- **正式 schema、PostgREST HTTP、已登入 admin/staff 桌面／390px、真人 UAT、實機：**本輪沒有執行，不能寫成 PASS。
- **Jobs：**沿用上一輪 2026-10-19 13:03:52 HKT 的五筆 `preflight/VOLUNTEER_JOB_ACTOR_UNCONFIGURED` 證據；本輪不讀 token、不改 actor、不觸發 jobs 或通知。
- **T08／F05／UC41：**runtime/event-loop/PostgREST tail 沒有新效能量測，不整體結案，不宣稱提速。T09 規則不變。
- 正式 DB 沒有被改動，因此沒有正式回退動作。本機修正可在另一個 reviewed commit 撤回三個新 source/test 檔；原 migrations 及所有已存在出席／audit／operation 保留。
- 若日後批准並套用候選：失敗回退 owning transaction；response unknown 先讀 catalog／真實 ledger，不盲重送。已 commit 的事實／receipts 不得用舊 DB 覆蓋；正式回退仍需新審閱。
- 沒有 push、改 PR、merge、promote 或部署。
