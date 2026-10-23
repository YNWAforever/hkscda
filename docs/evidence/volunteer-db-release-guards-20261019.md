# R1／R2 本機 PostgreSQL 驗證交付

日期：2026-10-19 HKT。分支`codex/volunteer-admin-20261013`，起點`0a6c9a5220c582bfe4fe70fce98e62417a32d623`。
本輪只修義工DB修復候選的發布保護。**正式執行HOLD；本機驗證不等於正式／Preview／職員流程驗收。**

## 修改與候選

- 準備器保留三個原migration source SHA，新增單一`releaseSql` DO envelope；只能在一個owning transaction內使用。
- R1：核對creator適用的完整global/public FUNCTION default ACL及built-in defaults；五個受影響函式末端核對owner、所有grantee／grantor／EXECUTE／grant option，以及未批准non-superuser的有效執行能力。沒有清除其他物件權限，也沒有修改default ACL。
- R2：六參數reason原件完整signature、attributes、owner/ACL、comment、空security labels、native/shared dependencies先綁定；七參數版本只接受明列變更。reviewed comment恢復後讀回；其餘metadata／bulk非列表分支／LF-CRLF anchors及禁止盲重跑保留。
- 測試工具增加持久的per-round預算、source/candidate/script hash gate、whole script PG結果與獨立catalog比對、回退後counts/catalog核對。沒有Auth／業務fixtures寫入或業務RPC呼叫。
- 原七檔migration、reason migration、v1/v2候選、舊RED/GREEN/失敗及700 skipped紀錄都保留。

最終v3候選：

```text
.local-policy-test/volunteer-db-guards-20261019/approved-pg/reason-workspace-repair-v3.REVIEW.sql
SHA256 83b6bae177b724051b42a0a3b1c849cf1315794cef0098106e57ab13d1ffa831
```

v3原public函式body/權限/業務規則與原三段相同；外層guard的CASE加括號，修正真PG發現的42601。v2的`0dc680aa…918231`保持歷史失敗候選，不能當作已通過版本。v1原hash `6659dc42…368ebb`只供配對RED。

## 真實隔離與預算

已按使用者本輪明確批准執行。具名container：
`97347e44e3b09bf042726fd14bcf9951a64b1ef013e5af6f112943bda39be977`；
image ID `sha256:06ddc7962e11ab0f4f0334fd05671e97c30ea202f6e6a7113800bd3d6e416108`；
project label `hkscda-volunteer-perf-20261015`，host56322→5432，
owned DB `hkscda_compat_20261019_b7e198982637`／public。實際PG17.11、executor/session及ownership/ports均核對；沒有因localhost而假定安全。

初始SQL證明Auth／admin_user／profiles／registrations／outbox／audit／jobs皆0，額外role不存在。
實際outbox是`volunteer_operation_outbox`，原工具寫錯的`volunteer_notification_outbox`不存在；已另存修正版，不覆寫歷史腳本。

| 輪次 | fixture交易 | 保守預留提交 | role建立嘗試 | 結果 |
| --- | ---: | ---: | ---: | --- |
| RED／原候選 | 10／12 | 142／512 | 2／2 | 6 pass／7 fail，exit1 |
| GREEN／v3 | 12／12（含2診斷） | 176／512 | 2／2 | 主套件13 pass／0 fail，exit0 |
| 合計 | 22／24 | 318／1024 | 4／4 | 全部ROLLBACK，業務寫入0 |

提交數包含transaction/savepoint的保守預留，並非宣稱318個不同業務RPC。三份唯讀腳本每輪各一次、合共6次完整提交；兩次afterAll獨立postflight及兩輪before/after catalog皆相同，counts全0、額外role0。預算已封存為complete；沒有額外重跑DB或清理資源。

## RED→GREEN與實際驗證

主套件命令（runner只傳platform環境，禁`.env`及provider/token，DB只指向批准的owned DB）：

```text
bun --no-env-file .local-policy-test/volunteer-db-guards-20261019/approved-pg/run-round.ts RED
bun --no-env-file .local-policy-test/volunteer-db-guards-20261019/approved-pg/run-round.ts GREEN
```

真PG cases確認：

- 額外creator default grant、custom helper grant被55000攔截；正常五物件owner及完整ACL精確符合批准集合。
- reason cost/parallel漂移、未批准comment及native incoming dependency被拒絕。
- 含引號、反斜線及DO delimiter的reviewed comment恢復並讀回一致。
- 最終metadata漂移、M3失敗都回退完整reason/M2/M3函式與權限，沒有半套catalog。
- 缺security-label provider的請求22023拒絕；**非空label preservation不支援／NOT_RUN**，沒有安裝provider或偽造catalog資料。
- PREFLIGHT／POSTFLIGHT／DEPENDENCIES完整READ ONLY腳本在PG執行；metadata／body hashes／owner與獨立catalog一致，結束後沒有殘留transaction。這不是正式schema admission通過。

正常診斷另保留：

- `probe-1.json`：v2在PG報42601，rollback完成，並保存已知baseline metadata。
- 最小修正只把IF條件中的CASE表達式加括號，沒有放寬斷言。
- `probe-2.json`：v3正常修復、metadata正確，rollback完成。兩次診斷都計入GREEN的12個fixture，而非另開額度。

本輪程式與測試檔：

```text
src/lib/volunteers/repair/prepare.server.ts
src/lib/volunteers/repair/releaseGuards.server.ts
src/lib/volunteers/repair/prepare.test.ts
src/lib/volunteers/repair/releaseGuards.database.test.ts
```

相同source hashes的提交前檢查：

```text
bun --no-env-file .local-policy-test/volunteer-db-guards-20261019/approved-pg/run-checks.ts unit precommit
bun --no-env-file .local-policy-test/volunteer-db-guards-20261019/approved-pg/run-checks.ts typecheck precommit
bun --no-env-file .local-policy-test/volunteer-db-guards-20261019/approved-pg/run-checks.ts lint precommit
bun --no-env-file .local-policy-test/volunteer-db-guards-20261019/approved-pg/run-checks.ts build precommit
```

均exit0；unit 9 pass／0 fail；lint保留既有52 warnings，build dependency warnings保留。沒有重跑無關完整suite或700 skipped。獨立review無Critical/Important；stale plan狀態已在本交付更新。

## 證據與發布界線

所有新原始logs／SQL／sources snapshots／manifest／權限前後catalog／budgets在ignored：
`.local-policy-test/volunteer-db-guards-20261019/approved-pg/`。
`RED.json/log`、`GREEN.json/log`、`*-identity.json`、`*-postflight.json`、`*-*-results.json`及兩份closed budget保留。
提交後的精確commit、相同source內容對照及最終hash index由交付receipt記錄，不回寫原始候選manifest或歷史狀態。

**PASS只限本機**：程式與離線回歸、具名synthetic PG catalog/ACL/atomicity、三腳本PG語法及metadata結果。
**歷史FAIL保留**：原候選7個拒絕／preservation缺口、v2語法、先前unit/setup/collector failures。
**NOT_RUN／HOLD**：正式fresh catalog、備份/恢復點、正式SQL、PostgREST p_reason HTTP／admin/staff登入、Preview桌面/390px、真人UAT／實機、真通知及正式三週期jobs。T08/F05/UC41及T09獨立待辦，沒有提速或規則變更聲稱。

未push、改PR、merge、promote或部署；未讀token、改正式actor/Auth/Secret/排程或建立付費Preview。正式執行仍須fresh目標核對、私有備份/可恢復證據、無並行schema DDL窗口及**v3 exact SHA的另行批准**。

回退：COMMIT前失敗由owning transaction整包回退（本機已驗）；UNKNOWN先只讀對帳、不盲重送。COMMIT後用另審forward correction保留七參數API及新事實；全DB/PITR可能損失恢復點後資料，不能稱無損。
