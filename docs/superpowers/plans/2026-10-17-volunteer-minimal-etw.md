# 義工後台 Windows TCP 邊界：最小 ETW 擷取方案（待審閱）

本方案對應 T08／F05／UC41，延續 `9e4f8752`。本輪只準備方案，
**尚未獲准啟動管理員 ETW，沒有執行 StartTrace／EnableTraceEx2**。
一般權限的 TCPIP ETW／PktMon 曾被 Windows 拒絕，不能把那次失敗寫成已擷取。

## 問題與成功條件

固定原隔離 DB、408 cohort、同一 artifact 與冷暖機程序，
將 Node request-finish／首 socket-data、Windows TCP 收送、
Docker bridge／Kong／REST 對應至同一條連線及同一個 request。
目的是縮窄尚未分配的 18–77ms，不以 host busy、timer 或 packet loss 代替根因。
benchmark client timer 與 SSR→Kong 殘餘分開。

1,437ms cold first1 另以無網絡 inspector port 的 CPU／檔案 metadata probe 調查，
不在首次 ETW 加入 FileIO、CPU sampling 或 context-switch 等較廣泛 provider。

## 允許的首次擷取

| 項目            | 上限／選擇                                                                                                        |
| --------------- | ----------------------------------------------------------------------------------------------------------------- |
| 次數            | 一次 pilot；未批准前不執行，不自動重試或循環                                                                      |
| 時間            | 最長 20 秒，workload 完成即提早停止                                                                               |
| ETL             | 最多 32 MiB，獨立 UUID 目錄；超限即停止並標記不完整                                                               |
| Session         | 唯一 `HKSCDA-Tcp-<UUID>`，只停止本次 handle／名稱                                                                 |
| Clock           | QPC；保存頻率、start／stop／lost-event 統計                                                                       |
| Provider        | `Microsoft-Windows-TCPIP`，GUID `2f07e2ee-15db-40f1-90ef-9d7ba282188a`                                            |
| Events          | **只啟用** 1033、1073、1074、1156、1157、1158、1171、1175、1178                                                   |
| Level／keywords | Verbose 5；SendPath／ReceivePath／ConnectPath `0x700000000`                                                       |
| Filter          | `EnableTraceEx2` 的 `EVENT_FILTER_TYPE_EVENT_ID`，FilterIn，明列上述 9 IDs；失敗即中止，不能退回全 provider       |
| 禁止            | packet／NDIS capture、HTTP headers/body、JWT、TLS keys、stack walking、FileIO、CPU／CSwitch、debug port、自動提權 |

已在這台 Windows 只讀核對 event templates：上述事件只有時間、
TCB／delivery／request 指標、PID／process start key、socket address、
seq／byte counts／status／TCP counters。未選 DNS name 或字串／payload 事件。
擷取器啟動前須重新比對全部版本的 schema；如出現額外字串或非 address
的 binary 欄位，fail closed，交回審閱。

TCPIP 是系統 provider，即使只選這些 events，raw ETL **仍可能包含其他程序的
IP／port／PID metadata**，不能宣稱 source filter 已只保留 fixture。
raw ETL 只存在本機 `.local-policy-test` 專用目錄，排除 Git／交付 ZIP／分享；
另導出只屬於本輪 Node PID、fixture 56321 的 TCB／連線記錄供分析。

## 執行次序（批准後）

1. 普通使用者端核對 Git SHA／dirty state、544-file artifact seal、
   Docker 原 container IDs／network／ports／upstreams、Auth、78 筆 fixture ownership、
   counts／state hash 與 SQL946；不允許 production fallback。
2. 沿用原 old207＋oldSQL first1+warm30 前置，再還原 candidate SQL946。
   新 Node process、stdout readiness，無 HTTP prewarm；client 固定同一版本。
3. 獨立的管理員 collector 驗證九個 event IDs／schema、開始有 event-ID filter 的
   QPC session，寫 `ready.json`。workload／preview **仍以原普通使用者權限執行**。
4. ordinary-user runner 收到 ready 才做一輪四情境 first1+warm30；
   每個 request 保存 sample label、PID、local port、寫出／收到 byte counts、
   seq mapping，以及原有 Node／Kong／bridge metadata。沒有 mutation 或通知。
5. workload 完成寫 stop marker；collector 最遲 20 秒停止自己的 session。
   Ctrl+C／exception 均以 `finally` 停止；不停止其他 session，不重啟 Docker／服務。
6. 保存 events-lost／buffers-lost、退出碼、原始 ETL hash、capture schema、
   全部樣本及慢樣本、DB／fixture 結束核對。任何 dropped event／flow 缺漏都標記
   不完整，不放寬 byte／sequence 對應，也不刪除失敗紀錄。

## 分析與結論限制

- 1033 的 payload PID／endpoint 對應 Node local port，再用 TCB、seq、
  unique coverage、完整 request／response byte 序列關聯收送事件。
  不只用最近的 epoch、不把重傳當成額外 delivered bytes。
- 比較同一 clock 的區段及 sibling 相對差；在未校準 Node／ETW／Linux
  clock offset／精度前，不宣稱跨時鐘的 sub-ms 單向絕對延遲。
- Node 完成寫出、Kernel 送出、Kernel 收到、Node callback 是不同邊界；
  不能將 ACK 或 TCP receive 等同 JavaScript 已收到。
- 若差額仍落在 TCPIP 未涵蓋的 Docker forwarding、AFD／IOCP 或 scheduler，
  保持未分配；是否加下一個 provider 必須另列最小方案審閱。
- 此 pilot 只作診斷，不代替修復後 10 組配對、適用 gates、角色驗證或正式驗收。

## 審閱所需決定

只需決定是否批准上述**一次、最多 20 秒／32 MiB、九個 metadata event IDs**
的管理員 collector。批准不包含修改系統、權限／防毒、production、通知、
排程、push、PR、merge 或 deploy。

官方 API 參考：

- https://learn.microsoft.com/en-us/windows/win32/api/evntrace/nf-evntrace-enabletraceex2
- https://learn.microsoft.com/en-us/windows/win32/api/evntprov/ns-evntprov-event_filter_event_id
- https://learn.microsoft.com/en-us/windows/win32/api/evntrace/ns-evntrace-event_trace_properties
