# 義工後台 ETW pilot 執行與 cold first1 續查（2026-10-17）

T08／F05／UC41：**partial**。本次提交是有測試的本地診斷工具及證據紀錄，
沒有保留新的應用效能修改，沒有宣稱解決 Windows／Docker 等待或 cold first1。

## 版本與隔離

- 原 worktree：`hkscda/.worktrees/volunteer-admin-20261013`；
  branch：`codex/volunteer-admin-20261013`；起點
  `39e9b623239a25204639a0958690b6e80c838f4b`，起始 tracked tree 乾淨。
- remote main 唯讀重新核對為
  `b039bba7df2ab2c9d579624379dee35c370c7e58`。
- 原 `hkscda-volunteer-perf-20261015` 的 DB／Kong／Auth／REST container IDs、
  network、56321／56322、實際 upstreams 及 fixture ownership 均先核對。
- 固定 counts：admin 408、profiles 863、activities 9,274、registrations 3,228、
  outbox 6,090；78 筆自有報名 state hash
  `4a1757510ce03878e4f4c2c51be6a798`。
- frozen 9e4 artifact 全部 544 個檔案及 preview scripts 對 seal 核對；entry SHA256
  `96ed817caeb4a92a5a821e3e93f400e80a96c0f6464b5dbc7a6325737272cc40`。
- target client／SSR Node 24.21.0，proxy／coordinator Node 24.18.0。
  每輪 old207＋oldSQL 前置，再還原 SQL946、新 preview、stdout readiness、
  無應用 HTTP prewarm、四情境各 first1+warm30；保留既有 DB／OS cache，
  不清 cache、不重啟 engine、不建立另一套 fixture。

## 已批准的一次 ETW：沒有開始

使用者批准的範圍為最長 20 秒／32 MiB、九個 TCPIP metadata IDs。
實機唯讀核對了全部 11 個 event schema versions；
schema hash `d7e1eea30449bf08f48525a87c17164b04a4f1dcbb00c04191175a48ceb791f4`，
FilterIn bytes `01000900090431043204840485048604930497049A04`，
QPC frequency 10,000,000。

ordinary-user preview 在 03:33:59 UTC（香港 11:33:59）準備好後等待 collector。
UAC launcher 的 `Start-Process -Verb RunAs -WindowStyle Hidden` 被 Windows
回報「操作被使用者取消」，沒有取得管理員 process。其後的 PowerShell
non-terminating errors 令 launcher shell 最終返回 0；**這個 0 是無效成功碼，
不算 collector 通過**。workload waiter 120 秒逾時，exit 1。

沒有 `attempt-once.json`、`ready.json`、`raw.etl` 或 collector receipt；
沒有 StartTrace／EnableTraceEx2、沒有 lost-event 數據、沒有自動重試。
本輪 preview／metadata helpers 已停止，SQL946、ACL 及固定 counts／state
再次核對。原四個 fixture containers 保留，沒有碰其他專案。

本機紀錄：
`.local-policy-test/etw-pilot-20261017/e4396586-236c-4c29-bd3c-c4bf958c18ef/`。
保留失敗 launcher marker，另以 `launch-failure.json` 明確糾正其結果。
raw ETL 及未過濾 decoded metadata 永不進 Git／交付 ZIP。

## 診斷工具與 RED→GREEN

- `scripts/diagnostics/volunteer-tcp-etw.cs`：Win32 typed ABI、唯一 session、
  明確 event-ID inclusion filter、19 秒 watchdog、30 MiB sequential cap、
  own-handle cleanup、QPC／lost-event 統計。constructor／test 不啟動 session。
- `scripts/diagnostics/volunteer-tcp-etw.ps1`：Validate／Capture／Decode；
  schema 漂移、未知欄位、output reparse point、非普通權限 workload、
  過期 readiness、source seal 不符或已有 one-shot／stop marker均 fail closed；
  不自行提權、不啟用其他 provider、不放寬 filter。
- `scripts/diagnostics/volunteer-tcp-etw.test.ps1`：真實 filter bytes／ABI
  marshalling，並以 fake native boundary 驗證生命週期及失敗清理。

命令：`pwsh -NoProfile -File scripts/diagnostics/volunteer-tcp-etw.test.ps1`。
初次 RED exit 1：6 個缺失行為失敗；修正後 GREEN exit 0。
另加「StartTrace 耗盡 deadline 時不能再 enable provider」：
先 RED exit 1、再 GREEN exit 0，最終 **9/9**。全部測試零 ETW session。
這是 collector contract 的 RED→GREEN，**不是後台加速的 RED→GREEN**。
實際原生 event filter、lost events、20 秒／32 MiB 限制均未經成功擷取驗證。

## Cold first1：保留新慢樣本

同一 frozen artifact 的四輪 A／B／B／A（A 為既有同步 trace；
B 另加既有 Node CPU／檔案 probe）：

| 次序 | Probe | tasks_p1 first1 | SSR | Auth 前等待 |
| --- | --- | ---: | ---: | ---: |
| A1 | trace | 1,758.8160ms | 1,743.3197ms | 1,659.1217ms |
| B1 | trace＋CPU／檔案 | 358.8962ms | 354.4140ms | 267.6497ms |
| B2 | trace＋CPU／檔案 | 412.9241ms | 409.1859ms | 300.4527ms |
| A2 | trace | 562.6973ms | 539.6809ms | 450.7562ms |

A1 比既有 1,437ms 樣本更慢；不能刪除或把其餘三輪當修復。
B1／B2 各有 515 個檔案操作，單次最長 0.8539／0.9049ms，
沒有捕捉到 A1 的長停頓，不能把舊 native-open stack 推定為 A1 的機制。

另預先固定十輪較輕的本程序 file metadata probe，沒有 inspector、CPU
profiler、JS stack 或系統 provider；每次只觀察第一個 API 的同步
open／read／stat／realpath，最多 4,096 筆，零 file contents／HTTP payload。
十輪全數保留，每輪 515 筆、零 overflow：

| 輪 | first1 | Auth 前等待 | 單次檔案操作最大 |
| --- | ---: | ---: | ---: |
| 1 | 328.6734ms | 243.9687ms | 0.9376ms |
| 2 | 384.6707ms | 288.4439ms | 2.1698ms |
| 3 | 562.0027ms | 403.9775ms | 3.0735ms |
| 4 | 445.1494ms | 323.9442ms | 1.0684ms |
| 5 | 437.1335ms | 304.1942ms | 1.6824ms |
| 6 | 364.6385ms | 271.9505ms | 1.1606ms |
| 7 | 440.6792ms | 334.0458ms | 1.6890ms |
| 8 | 392.2698ms | 294.9655ms | 0.9873ms |
| 9 | 411.3169ms | 277.0608ms | 0.9643ms |
| 10 | 481.3623ms | 361.6684ms | 1.1270ms |

較熱樣本無法重建慢 A1；沒有證據指向某個 driver、防毒或 host busy。
不採用 cache eviction／系統調校或把 request 等待移到 readiness 來製造改善。

## Warm headers 與驗收限制

十輪 file probe 的 target `tasks_p2_2` 記錄 headers 43.6436ms，
Kong upstream 11ms、proxy 7ms，尚有 **25.6436ms 未被這兩個 timer 解釋**。
沒有 Windows ETW 或同輪完整 bridge 邊界，不能叫它純 Windows／單向延遲。
target tasks_p2 warm p95 最高 114.0459ms 的輪次亦保留；無新修復候選，
不把這批 observer／時間差異算成前後改善或宣稱 warm 沒有回退。

本次合共 29 份成功 reports、3,596 個 read requests：15 組 old207 前置、
14 組 target；每份四情境 first1+warm30，before／after counts 及 state 相同。
ETW 等待失敗的一組另外保留，不當成成功量測。此前全部 10 組配對、
慢樣本及 sealed deliveries 保留，沒有覆寫。

本次 groups：
`etw-pilot-e4396586-236c-4c29-bd3c-c4bf958c18ef`、
`cold-followup-1792208353353`、`file-followup-1792208575309`，
均在 `.local-policy-test/perf-5ed-residual-20261017/`。
完整彙整：`.local-policy-test/etw-pilot-20261017/analysis.json`。
helper snapshots 在 `.superpowers/perf-etw-20261017/`。

同提交的完整 CI gates、RLS、rollback DB、brand stub 及 readonly DW-A
admin／staff 桌面／手機結果，以交付包的命令、exit codes、SHA receipts 為準；
不得沿用前一提交數字。DW-A 不等同點名／bulk／通知／人手或正式環境驗收。
T09 規則仍待營運確認；沒有 push、建立 PR、merge、deploy 或正式設定變更。

## 回退與下一個依賴

本提交只增加診斷工具及文件，可用一般 revert 撤回；應用、授權、查詢、
名額、通知、route-loader 與 preview scripts 沒有修改，DB 已回到 SQL946。
raw 診斷證據保留本機，不因回退清除。

Windows TCP 邊界仍需成功的 UAC 管理員 collector 才能往下分配。
本次 UAC 取消後停止該動作，沒有換其他提權途徑、重送或放寬 provider。
