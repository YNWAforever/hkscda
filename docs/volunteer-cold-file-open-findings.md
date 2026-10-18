# 9e4f8752 冷請求與 Windows／Docker 邊界續查（2026-10-17）

狀態：T08／F05／UC41 **仍未結案**。本輪沒有保留新的應用效能 patch；
只提交已取得的證據及可審閱的 ETW 方案。benchmark client timer 改善
不計作後台加速，沒有 push、PR、merge、deploy 或管理員擷取。

## 版本、資料與程序

起點 `9e4f8752bfc22c0dfc6d5368e80e57daa3ba0727`，原隔離 worktree／branch。
remote main 重新核對仍為 `b039bba7df2ab2c9d579624379dee35c370c7e58`。
Docker Desktop 在本輪開始時停止；只啟動現有 engine，原 container IDs、
network、56321／56322、Kong／Auth／REST／DB upstream 及 fixture ownership
重新通過核對，沒有重建／reset／production fallback。

engine 重啟後另立量測 group，不與先前資料混算。每次保留原
old207＋oldSQL 的 first1+warm30 前置，還原 SQL946，再以新 preview process、
stdout readiness、無應用 HTTP prewarm，按相同四情境各跑 first1+warm30。
CPU／檔案 probe 另標為 diagnostic，不拿來直接推算效能改善。

```json
{ "admin": 408, "profiles": 863, "activities": 9274, "registrations": 3228, "outbox": 6090 }
```

自有報名 state hash：`4a1757510ce03878e4f4c2c51be6a798`。
SQL 定義 SHA256：
`946d3223e040e5d1c1da74bb74acbd903b27fb8ce4081e2d348379eff2bf2858`。

## 1,437ms 的既有樣本：已拆出的邊界

原 `server-runtime10/candidate-trace-pair1-1792187248625/tasks_p1_0`：

| 項目                               |                  實測 |
| ---------------------------------- | --------------------: |
| client first1                      |          1,437.2699ms |
| SSR API duration                   |          1,419.6601ms |
| API 開始至第一個 Auth HTTP request |          1,359.9616ms |
| Auth 完整消費                      |             10.2370ms |
| role 完整消費                      |             11.4962ms |
| support RPC 完整消費               |             24.1814ms |
| SSR event-loop idle／active        | 30.4448／1,389.1710ms |

support／pending 並行，不能相加作總耗時。大部分冷等待在 Auth 前，
不能歸入 Auth、SQL、Kong 或 benchmark client timer。

## 本輪重現與 CPU／檔案證據

同一份 9e4 artifact、Node 24.21、原 SQL 前置的 diagnostic first1
重現為 **1,599.3140ms**；SSR 1,585.7191ms，process CPU user／system
分別為 281／219ms。取樣 profile 約 1,240ms 的 weighted wall time
落在 native `open` stack；這不是「CPU 正在執行了 1,240ms」的證明。

呼叫鏈：

```text
TanStack loadEntries → ESM ModuleJob/link → getSourceSync
→ readFileSync → openSync → native open
```

後續兩個檔案 metadata probes 在同一份 artifact（Node 24.21／24.18）
各記到 515 個檔案操作；first1 為 273.2182／280.7611ms，單次檔案操作
最大約 0.91ms。它們是較熱的檔案樣本，不能當作原 1,437ms 已消失。
沒有證據將阻塞再分配到防毒、檔案系統 driver、scheduler 或特定檔案。

## 已試但否決的兩種打包做法

### 完全 inline dynamic imports

實際 build 後在啟動時提前執行 Resend 的可選
`@react-email/render` 匯入，server 無法啟動。失敗 artifact／stderr 保留；
沒有安裝可選套件來掩蓋錯誤，也沒有保留此設定。

### 合併實體 server modules、保留 virtual／可選邊界

一般 `manualChunks` 在 pinned Nitro beta 被預設值覆蓋（產物 entry hash
未變）；改用其 `rollup:before` hook 後，真實 artifact 回歸測試通過：
首個未登入 API 仍回 401、零外部請求、request 期間零 JS source-read。
同一測試在原 artifact 為 RED；沒有放寬 assertion。

但整體 pilot 沒有足夠證據支持採用：

| ABBA 次序 | 版本     | launch→ready | API first1 | before Auth | tasks_p2 warm p95 |
| --------- | -------- | -----------: | ---------: | ----------: | ----------------: |
| A1        | 原 9e4   |        655ms | 572.3900ms |  465.3416ms |         33.4413ms |
| B1        | 合併候選 |      3,454ms | 100.4000ms |   15.1780ms |         31.5635ms |
| B2        | 合併候選 |        986ms | 132.7701ms |   21.6255ms |         80.5845ms |
| A2        | 原 9e4   |        548ms | 324.1999ms |  244.8316ms |         35.6335ms |

B1 是新 artifact 路徑，資產 sidecar cache 與舊路徑不相等；這批是
**pilot，不是滿足等同 cache 條件的正式配對驗收**。launch→first response
另包含 fixture preflight／login，亦不能直接當作使用者載入時間。
不能只看 API first1 變短就宣稱啟動加速。候選、測試及所有樣本保留在
ignored 診斷目錄；`vite.config.ts` 已逐字還原至 9e4，沒有保留打包變更。

## Windows／Docker 18–77ms

先前已驗證的 bridge 兩側合成差額仍未分配到單一方向或 Windows 機制。
本輪沒有管理員 ETW，所以不能將 CPU／檔案結果套到 warm TCP 殘餘。
不改 timeout、重試、TCP 設定或必要授權檢查來掩蓋差額。

最小方案見
[2026-10-17-volunteer-minimal-etw.md](superpowers/plans/2026-10-17-volunteer-minimal-etw.md)。
它只提議一次最長 20 秒／32 MiB、九個 TCPIP metadata event IDs；
不收 HTTP payload、stack、FileIO，不自動提權。raw ETL 可能包含其他程序的
IP／port／PID metadata，只留本機 private 目錄，排除交付與分享。
schema／event filter 不符或出現 lost events 即標記不完整，不能退回全 provider。

## 本輪證據位置

- `.local-policy-test/perf-5ed-residual-20261017/continuation-preflight/`
- `.local-policy-test/perf-5ed-residual-20261017/9e4-cpu/`
- `.local-policy-test/perf-5ed-residual-20261017/9e4-module-pilot/`
- `.superpowers/perf-9e4-residual-20261017/`（包含被否決 prototype）

全部原樣本、較慢樣本、錯誤及 rejected artifacts 均保留。
先前 sealed delivery 不修改。正式環境、通知、點名寫入及 T09 規則未驗證。
