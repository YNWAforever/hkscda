# R01 migration／backup／rollback runbook · 2026-10-06

**全部14份forward SQL目前 DO_NOT_APPLY。** [Manifest](r01-forward-migration-manifest-20261006.csv)記錄目前e5a工作檔RAW／canonical LF SHA256、Git blob、實際filename/order及prerequisite。這不是folder db push／legacy replay授權；不得偽造ledger，或把isolated-ready當production approval。

## DBA執行前

- 核對exact reviewed source head、逐 SQL RAW/LF/Git 身分及fresh head CI／underlying DB steps。Task1五個ACL source holds未解除不得執行第一份；Task8 scanner source holds亦不可套用。
- 唯讀採集目標server_version_num、database/current_user/session_user、managed/Auth context、完整catalog/signature/owner/body/raw+effective ACL、column grants/defaultACL/RLS/options/native dependencies及rows/sequences/ledger；必須符合該SQL exact admitted profile。Unknown／later schema一律55000，不能用broad IF EXISTS或bodyhash取代角色驗收。
- 每份named file取得明確production approval、lock/statementdeadline、backup／rollbackwindow／on-call與業務owner簽核。同一transaction的30s statement_timeout必須在DO**之前**設定；5s locktimeout不代表取消／終止其他sessions。
- 最新 restricted CurrentUser DPAPI backup 完成於2026-10-01T07:32:59Z：2,065,878 bytes，SHA256 95b31da9d86866392ec61008a42d57d2d201073f8161f691d97d9a09a0ebc61f。本機檔名 hkscda-before-next-approved-ddl-20261001T073259Z.dpapi；payload 保留在 restricted local storage、排除 Git，位置 metadata 見 [已記錄 handoff](current-operations-handoff-20261001.md)。已核 restricted ACL、hash及decryption roundtrip；schema/data/roles分開 dump，不是單一一致 snapshot。Off-machine copy、Storagebytes、fullrestore drill未驗證，須另完成；不得用productiondata建立測試fixture。

## 順序及profile特例

Manifest order1–14 只按 filename timestamp 排序，不是 source dependency／審閱或 approved execution 次序。例如 #187 sponsorship filename 早於 #186 animal preference，但 source composition 的前置是 #186。逐檔另列 source_dependency_rank、exact predecessor SHA、profile／predecessor evidence path與digest；#185是其中無新 SQL 的 fixture safety prerequisite。這些證據不批准執行。逐份做 exact catalog preflight；不要假定任何 predecessor已在production。13為20261003075753_r01_document_publication_guards_forward.sql（restoration），14為20261006023123_r01_document_publication_fence.sql（獨立concurrencystrengthening）。

Restoration只支援missing170006及exact modern170006/170011；missing170011仍unsupported55000。170011 observation是committed184＋3managedjobs的seededmodernbaseline，六counts2/2/4/0/0/0，不是zero-data schema-only。Strengthening的雙版本sourceguard不代替170011 runtimematrix；fresh CI documentstep仍必要。

**先restoration／recognizedmodern preflight，再strengthening；strengthenedbodies之後不可重跑restoration，也不可稱其是acceptedno-op。** R268只證明獨立namedstrengtheningno-op；R265fullraw statistic+inventorydrift仍fail/held。不能用namedequality或maintenancecomparator抹除該失敗。

## 失敗、rollback及retest

- Preflight／lock／type／unknown body／grant mismatch：停止該份，保留原nativeSQLSTATE/errno/drivercode/PID/argv/streams及successfulprefix。不可跳檢查、盲retry或繼續下一份。
- 未commit變更由owning transaction rollback；不rollback其他session、不force-drop existing DB、不reset stack／cluster roles。
- 已commit的資料／audit／payment事實要保留。App rollback只能回到已審閱compatible SHA；不覆蓋新financial/audit facts、不取消readonly/security clamp。Schema rollback須新的reviewed forward correction，不提供destructive down script。
- 具體failure有最小reviewed correction及fresh grant才重試。Retest包括catalog/defaultACL/Auth/grants/rows/sequence/ledger、real role refusals、atomic audit rollback、duplicate/retry/response-loss、兩raceorders及supported isolation classification。
- Staff切換／provider/payment/content/scheduleenablement另取operational approval。付款成功不能因receipt/email failure倒退狀態。
