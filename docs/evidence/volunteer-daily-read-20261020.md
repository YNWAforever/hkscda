# 義工當日查看與返回：本機離線交付

日期：2026-10-20 HKT。原分支`codex/volunteer-admin-20261013`，起點`843adac61285d92c2e1056715d6601ed83fedb12`，原worktree；開始時tracked/untracked均乾淨。P0-ID保持暫停、client deadline偏差未結案、正式DB修復HOLD。本輪沒有雲端／DB查詢、DB fixture、migration、通知或發布。

## 已重現的問題與最小修正

| 問題／根因                                                                  | 最小修正                                                                                                                 | 回歸證據                                                                                                  |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| 詳情的返回Link只在成功載入分支；loading／失敗／不存在／401／403時消失       | 共用原有allowlist返回Link，四類render分支均可返回；既有文案、路由及safe search不改；44px觸控區與鍵盤outline              | 原23個案例12 pass／11 fail；四個原版瀏覽器中英／1440／390案例均因缺少返回Link失敗。修正後新29個案例全通過 |
| 中文HTTP404只顯示泛稱無法載入；英文已有not-found說明                        | 同一詳情元件按既有failureClass分類，重用既有雙語detail.notFound作404標題；其他錯誤、權限及API不改                        | 語意回歸曾72 pass／1 fail，修正後通過；最終瀏覽器404明確文案通過                                          |
| 清單首次pending或沿用舊空結果時，標題把未知total回落為0；後者也會顯示空結果 | 只改兩個render條件：列表標題顯示未知；舊空placeholder顯示loading。非空keepPreviousData、query/cache/state writer完全保留 | 真實元件合成狀態RED25 pass／4 fail；修正後29/29，另區分真正完成的空結果仍可顯示0                          |

沒有重建列表／詳情／日曆，沒有新增registration-status API篩選、批量審批、出席寫入或通知。流程沿用既有**班次模板／活動狀態**篩選，名單每列顯示報名狀態；不把批次指派審核員當作批次批准。

## 最終本機流程

mock admin／staff各自以zh/en、1440×900／390×844完成：

1. 今日場次（現有香港時區規則）→morning模板／published活動狀態→desc排序→活動page2。
2. 開指定場次→名單page2→指定報名詳情。
3. 鍵盤啟用返回→日期、模板、狀態、排序、page2、selected場次、detail_page2及session搜尋恢復；焦點回原registration列。
4. 重載仍維持安全URL篩選及選取；再開詳情用browser Back亦恢復。

沒有原列表上下文時返回內部activities預設；外站return URL及私人q不進生成的返回連結。無資料、500、404、403、401、loading、invalid filter、treasurer拒絕、初次未知清單及舊空placeholder分開驗證。IME組字期間沒有list請求；結束後沿用300ms debounce；清空可恢復。舊SLOW請求觀察到ERR_ABORTED，最新結果不被舊讀取覆蓋。

這些是**真實React／Query／Router／page gate元件＋mock HTTP/Auth transport**。server requireAdmin測試使用真實授權函式及合成Auth/admin_user回覆；不是實際登入、JWT、DB或RLS驗收。mock roster使用既有向後相容read DTO；本輪沒有驗收inline attendance。

## 最後版本的命令與結果

以下`run.ps1`位於ignored `.local-policy-test/volunteer-daily-read-20261020/`，每個stage完整命令、exit code、來源hash及raw log另存JSON/log。下列是已執行命令紀錄，不原名覆跑覆蓋證據；如日後另批重跑，需新attempt名。

| 實際stage（`& .local-policy-test/volunteer-daily-read-20261020/run.ps1 -Stage ...`） | 結果                                                                                                                           |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `green-attempt-2`                                                                    | PASS：29/29新增邏輯／元件／server-role contract，exit0                                                                         |
| `related-attempt-5`                                                                  | PASS：101/101、9個直接相關Bun測試檔，exit0                                                                                     |
| `typecheck-attempt-4`                                                                | PASS：全專案`tsc --noEmit`，exit0                                                                                              |
| `fixture-typecheck-attempt-3`                                                        | PASS：另含fixture及既有generated route型別，exit0；未改routeTree.gen.ts                                                        |
| `lint-attempt-3`                                                                     | PASS：列明所有本輪source/test/fixture/verifier的targeted ESLint，exit0，沒有ignored-file假通過或warnings                       |
| `guard-proof`                                                                        | PASS：不存在的.env路徑在IO前拒絕；fetch/http在network前拒絕，沒有讀真憑證或外呼                                                |
| `prepare-build-attempt-2`／`offline-build-attempt-2`                                 | PASS：2,913個當前輸入、59,745,573 bytes，原Vite/Nitro Vercel-preset設定在無憑證鏡像build，exit0                                |
| `artifact-check`                                                                     | PASS：414個JS/MJS/HTML、139個client assets；無fixture/Auth stub混入實際app、client無server-only替身值、build network attempts0 |
| `fixture-build`／`prepare-static-ui`                                                 | PASS：另編譯mock UI資產，來源hash鎖定；此bundle故意包含SDK替身，不是實際app產物                                                |
| `browser-candidate-attempt-6`                                                        | PASS：58/58，exit0，compiled mock UI；各案forbidden/write requests0、external requests0、uncaught page errors0                 |

所有child環境只帶平台必需欄位，不載入正式credentials。單位測試用`bun --no-env-file test --isolate`；local DB URL指向拒絕端口。實際app build以當前來源鏡像、既有node_modules、排除env／憑證／原始evidence，另以file/network guards保護，只有.invalid非真實配置；沒有改原應用build設定或發布。保留chunk>500kB警告，沒有提高warning limit來通過。

## 歷史FAIL／setup失敗保留

- 返回Link有效RED：23案例中的11 fail；原版4個mock browser案例均fail。
- 嚴格要求另一句404文案的2個fail屬test-spec錯誤，沒有為它改全站copy；後續語意測試才識別真實中文404缺口。
- unknown-count有效RED：29案例中的4 fail。舊英文測試硬要求loading顯示Activities(0)，已改為未知，並新增完成空結果仍為0的正向斷言。
- 初次sandbox CIM／Bun cwd讀取、Bun/Playwright啟動、fixture tsconfig缺generated route declarations、new test角色字串過闊等setup/compiler failures均保留；不算產品RED或PASS。
- dev-server矩陣曾57/58；首個導航在API前about:blank逾時，case duration117,184ms包含失敗處理／cleanup，不是document TTFB。後續Node dev-server仍有啟動失敗，完整／部分結果保留，未完全歸因，不稱已修復Bun/Windows/runtime效能。
- 兩次RAM低於6GiB時在開始前BLOCKED，沒有降低門檻或放寬10秒UI斷言。只關閉receipt/PID/parent核對屬於本輪的測試程序，不停止其他工作。
- 最終改以預先編譯mock UI作功能回歸，隔開dev即時轉譯。這是測試器邊界調整，**不是正式後台啟動提速證據**。

## 畫面與證據

完整ignored evidence根目錄：`.local-policy-test/volunteer-daily-read-20261020/`。

最後58案及畫面：`browser-candidate-run-attempt-6/results.json`及同目錄PNG，均有OFFLINE MOCK UI標示：

- `journey-staff-en-1440-detail.png`：桌面詳情、時間、報名狀態及返回。
- `recover-missing-zh-390.png`：390px找不到報名及可用返回。
- `list-loading-zh-390.png`：未知活動數量＋loading，沒有空結果文案。
- `journey-*-*-*-returned.png`保留當時drawer返回畫面；部分截圖落在Radix入場動畫，不能單憑該瞬間圖判斷最終drawer幾何。返回條件、鍵盤焦點及後續操作有DOM／互動斷言。

原始RED/GREEN、資源BLOCKED、錯誤／慢樣本、compiler logs、source fingerprints、build manifest與compiled UI資料全部保留，不提交raw logs、私密檔案或screenshots到Git。沒有真人操作時間／點擊節省量測，不宣稱節省百分比。

## BLOCKED／NOT_RUN

- **BLOCKED：**依賴正式DB／RPC修復的真實資料鏈路；正式修復及P0-ID狀態不因本輪而變更。
- **NOT_RUN：**真實Auth／RLS／staff UAT、production／Preview流程、實機iOS/Android、實際寫入／bulk／通知及三週期jobs。
- **NOT_RUN：**無關完整suite及歷史700 skipped；skipped沒有計作PASS。
- T08／F05／UC41 runtime/PostgREST效能與T09營運規則獨立未結案；沒有移除Auth、延長timeout或延長staleTime。

## 回退及版本

本輪是前端render修正與離線回歸，沒有DB或正式狀態可回退。日後若需回退，只對本輪local commit做獨立code revert並重跑同一相關檢查；不碰舊DB候選／migrations／證據。

本地commit的full SHA、staged review及逐byte來源對照由最後COMMIT/FINAL receipts記錄。Gate執行時HEAD仍為起點加明確working diff；提交後須核對commit source與已測hash一致，不把不同版本證據混稱同SHA執行。

未push、改PR、merge、promote或deploy。完成本條查看流程後收尾，不自動接續DB／效能／通知或發布工作。
