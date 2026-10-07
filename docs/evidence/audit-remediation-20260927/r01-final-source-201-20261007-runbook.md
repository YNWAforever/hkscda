# Final15 runbook supplement · PR #201

全部15檔DO_NOT_APPLY。以 [r01-final-source-201-20261007-manifest.csv](r01-final-source-201-20261007-manifest.csv)逐檔pin；原14snapshot不包含Task8且保持歷史。Task8追加兩RPCsource，不批准正式DDL/回填/activation。先逐檔catalog/helpers/Auth/native/ACL/shape完整profile、existingrecords/roles/defaultACL核對，不match55000，不按engineversion或混配catalog/helper。完整backup+isolated exactschema/no-productiondata演練後才逐檔批准。Native19只是sourcegate。Futurepolicy/waitlist仍未验收。Document restoration9ed先於fence4e15；fence後不replay。

下列原14runbook供共同preflight/rollback/retest參考：

---

# R01 migration／backup／rollback runbook · 2026-10-07

**全部14份forward SQL目前 DO_NOT_APPLY。** [Manifest](r01-forward-migration-manifest-20261007.csv)記錄目前 source snapshot 7b429402a06825e2af34f9916d6e4c676e630cb3 RAW／canonical LF SHA256、Git blob、實際filename/order及prerequisite。這不是folder db push／legacy replay授權；不得偽造ledger，或把isolated-ready當production approval。

## DBA執行前

- 核對exact reviewed source head、逐 SQL RAW/LF/Git 身分及fresh head CI／underlying DB steps。Task1及Task8 classifier的 source-only批准已獲直接回覆；source驗證不批准任何正式DDL。正式執行仍逐檔獨立批准。
- 唯讀採集目標server_version_num、database/current_user/session_user、managed/Auth context、完整catalog/signature/owner/body/raw+effective ACL、column grants/defaultACL/RLS/options/native dependencies及rows/sequences/ledger；必須符合該SQL exact admitted profile。Unknown／later schema一律55000，不能用broad IF EXISTS或bodyhash取代角色驗收。
- 每份named file取得明確production approval、lock/statementdeadline、backup／rollbackwindow／on-call與業務owner簽核。同一transaction的30s statement_timeout必須在DO**之前**設定；5s locktimeout不代表取消／終止其他sessions。
- 最新 restricted CurrentUser DPAPI backup 完成於2026-10-01T07:32:59Z：2,065,878 bytes，SHA256 95b31da9d86866392ec61008a42d57d2d201073f8161f691d97d9a09a0ebc61f。本機檔名 hkscda-before-next-approved-ddl-20261001T073259Z.dpapi；payload 保留在 restricted local storage、排除 Git，位置 metadata 見 [已記錄 handoff](current-operations-handoff-20261001.md)。已核 restricted ACL、hash及decryption roundtrip；schema/data/roles分開 dump，不是單一一致 snapshot。Off-machine copy、Storagebytes、fullrestore drill未驗證，須另完成；不得用productiondata建立測試fixture。

## 順序及profile特例

Manifest order1–14 只按 filename timestamp 排序，不是 source dependency／審閱或 approved execution 次序。例如 #187 sponsorship filename 早於 #186 animal preference，但 source composition 的前置是 #186。逐檔另列 source_dependency_rank、exact predecessor SHA、profile／predecessor evidence path與digest；#185是其中無新 SQL 的 fixture safety prerequisite。這些證據不批准執行。逐份做 exact catalog preflight；不要假定任何 predecessor已在production。13為20261003075753_r01_document_publication_guards_forward.sql（restoration），14為20261006023123_r01_document_publication_fence.sql（獨立concurrencystrengthening）。

Restoration只支援missing170006及exact modern170006/170011；missing170011仍unsupported55000。170011 observation是committed184＋3managedjobs的seededmodernbaseline，六counts2/2/4/0/0/0，不是zero-data schema-only。Strengthening的雙版本sourceguard不代替170011 runtimematrix；fresh CI documentstep仍必要。

**先restoration／recognizedmodern preflight，再strengthening；strengthenedbodies之後不可重跑restoration，也不可稱其是acceptedno-op。** R268只證明獨立namedstrengtheningno-op；R265fullraw statistic+inventorydrift的原失敗保留；後續指定modern170006 setup-no-migration診斷與嚴格raw-equal另見raw-preservation-followup-20261006.md，並不批准missing／typed全矩陣。不能用namedequality或maintenancecomparator抹除該失敗。

## 失敗、rollback及retest

- Preflight／lock／type／unknown body／grant mismatch：停止該份，保留原nativeSQLSTATE/errno/drivercode/PID/argv/streams及successfulprefix。不可跳檢查、盲retry或繼續下一份。
- 未commit變更由owning transaction rollback；不rollback其他session、不force-drop existing DB、不reset stack／cluster roles。
- 已commit的資料／audit／payment事實要保留。App rollback只能回到已審閱compatible SHA；不覆蓋新financial/audit facts、不取消readonly/security clamp。Schema rollback須新的reviewed forward correction，不提供destructive down script。
- 具體failure有最小reviewed correction及fresh grant才重試。Retest包括catalog/defaultACL/Auth/grants/rows/sequence/ledger、real role refusals、atomic audit rollback、duplicate/retry/response-loss、兩raceorders及supported isolation classification。
- Staff切換／provider/payment/content/scheduleenablement另取operational approval。付款成功不能因receipt/email failure倒退狀態。

## Current source release qualification



[目前14檔 manifest](r01-forward-migration-manifest-20261007.csv)已用目前 Git SQL bytes 重算 RAW/LF hash/blob；Task1 現為90e3090f…，舊5c25 hash只屬歷史。每檔 production_approved/applied/deployed/enabled 仍false；source_merged/source_alias_ready 是獨立欄位。Task8 新 SQL 另列於其 focused PR，不在這14檔內，也未獲正式批准或套用。

[目前 runbook](r01-release-runbook-20261007.md)保留 exact catalog/signature/grants/RLS/defaultACL/Auth/native preflight、備份／restore drill、逐檔演練、rollback 及重新驗收界線。Timestamp order 不等於 source 相依或批准执行次序；document restoration 必須在 strengthening 前，strengthened body 之後不可 replay restoration。所有新 SQL **DO_NOT_APPLY**，不 db push、不假填 ledger。

正式 metadata-only capture 2026-10-06T16:01:38.768884Z：PG170006、public/private158tables355functions、ledger112/max20261001072505、新 R01 ledger entries空。這個 scope 與歷史 public-only154/304不同，並未重跑全部146項 checker；歷史44gaps不能當目前 confirmed count。


App rollback must retain the #200 patched TanStack dependencies and security clamps; new financial/audit facts must never be removed. Source schema files remain unapplied.
