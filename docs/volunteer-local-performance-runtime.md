# 義工後台本地效能量測的 runtime

本輪對應 T08／F05／UC41。此文件只描述隔離 preview 及量測條件，
不構成正式環境、通知、排程或發布授權。

## 已定位的兩個不同等待

2026-10-17 在同一 408 cohort 的同步量測中，Node 24.18.0
內建 Undici 7.28.0 的重用連線會經過 `scheduleIdleSocketValidation`。
實測一筆 client 請求的零延遲 timer 等待 18.7325ms，
event-loop idle 18.5967ms；timer 觸發後 0.0833ms 送出 headers。
這段發生在 benchmark client 送出請求之前，不能歸入後台 API 執行時間。

官方 Node 24.21.0／Undici 7.29.1 保留 idle socket validation，
改用有引用的 `setImmediate`。固定舊 SSR、相同 SQL 前置條件的
client-only ABBA 中，舊 client 的 248 次請求有 49 次送出前等待超過 10ms，
新 client 的 248 次請求沒有同類樣本。這是本地量測 runtime 的修正證據，
不是義工 API 或瀏覽器 ready 改善百分比。

原 39.1596ms headers residual 沒有同步 packet capture 或 Kong proxy timer，
仍不能精確歸因。新捕獲的 19.4127ms support 樣本，Node request-finish
至首個 socket data 為 42.6045ms，Docker bridge 的完整往返為 24.6292ms；
其餘 17.9753ms 尚未拆成 Windows TCP、Docker forwarding 與 Node callback。
不得以這些差額直接宣稱 host busy、packet loss 或上述 Undici timer
就是原 39.1596ms 的根因。T08／F05／UC41 保持部分驗證。

## 明確選擇本地 Node

`scripts/nitro-preview-fast.mjs` 在 `NITRO_PREVIEW_RUNTIME=node` 時，
使用 `NITRO_PREVIEW_NODE_EXECUTABLE` 指定的 executable；未指定時沿用
launcher 的 `process.execPath`。Bun 仍沿用既有的 `BUN_EXECUTABLE`。
這些選項屬於可信本地環境設定，不接受瀏覽器或 API 請求輸入。

PowerShell 範例：

```powershell
$env:NITRO_PREVIEW_RUNTIME = 'node'
$env:NITRO_PREVIEW_NODE_EXECUTABLE = 'C:\path-to-reviewed-node\node.exe'
bun run preview
```

benchmark client 是另一個程序，亦須明確以已核對的 Node executable
執行 `scripts/verify-admin-performance.mjs`，不能假設 server 的選項
會改變 client runtime。只用已通過 target identity gate 的隔離 fixture
及其 manifest／token，不使用正式環境作比較。

本輪 portable Windows x64 Node 24.21.0 的官方 `node.exe` SHA256：

```text
ba4e6d110e8c1592a1ecd390f6b05f3da124b13871a5be62b341a07a853c6c32
```

不把 binary、credentials、fixture 私人欄位或 raw HTTP payload 提交至 repo。
不改系統 Node、PATH、正式 Vercel runtime 或 Node 內建 validation。

## 比較及驗證要求

- 每組記錄 source SHA、完整 build seal、SQL hash、fixture ownership、
  counts／狀態 hash、client／proxy／SSR Node 與 Undici 版本。
- client-only、server-only 及兩者同時變動分開記錄；改變 runtime 的
  量測另立 profile，不與歷史 samples 混算。
- 相同 DB／OS cache 條件、相同 SQL 前置程序、新 preview process、
  stdout readiness、無 HTTP prewarm，按固定次序各跑 first1+warm30。
  first1 不代表清空所有 DB／OS caches。
- 保留全部配對、較慢樣本及失敗分析，不扣除 client wait 後重算原有
  read 750ms／mutation 1000ms 門檻。
- packet 對應須同時驗證完整 socket 生命期、request／response 位元組序列
  及 TCP sequence 聯集。port 重用不是同一連線，retransmission 不能重算
  delivered bytes。缺失的 Kong timer 保留為 missing，不轉成零。
- `headers − upstream − proxy` 只代表兩個 timer 尚未解釋的時間；
  Kong upstream 及 REST 往返都不是純 SQL 時間。

啟動回歸測試：

```powershell
bun test --isolate scripts/nitro-preview-startup.test.ts
```

測試以獨立目錄及本地隨機 port，核對預設 Bun、預設 Node、明確指定
Node executable，並同時檢查 handler-ready、無 HTTP prewarm 及 shutdown。
它不連 DB，也不代表 admin／staff 或正式環境驗收。

官方參考：

- https://nodejs.org/en/blog/release/v24.21.0
- https://github.com/nodejs/undici/pull/5707
