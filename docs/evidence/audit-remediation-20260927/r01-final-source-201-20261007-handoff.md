# 最後 source 交接包 · PR #201 · 2026-10-07

建立時 HEAD ae0abf38443a93be6a9d7a34fbc8e24ec4fd60de、tree e5e5d5abe4da492b14b9a00fef6882fee4ef313c；Task8 fresh source CI／merge／main CI／exact READY仍 **PENDING**。其後結果由本 PR acceptance及原始controller receipts逐项记录，不能把此建立前snapshot當已完成。所有歷史報告／manifest／失敗／raw路徑保留。

## Source、issue及隔離結果

原始#134–#179的46個PR已merged；#197–#199最新source/main CI/exactREADY見 [r01-final-source-201-20261007-source-state.json](r01-final-source-201-20261007-source-state.json)。#180仍unrelated DO_NOT_MERGE。[各issue當時完整狀態](r01-final-source-201-20261007-issue-snapshot.csv)保留code_complete/schema_ready/deployed/enabled分欄；Task8最後source驗收由此PR補足。#198精確CLIarray/citext1.6 classifier；#199R11partial沒有改font/render。

Task8 SQL af8c834d95d38502d428dca95903e10d22cc57ed8df922f0a53cdb78d857ae9b／426724LFbytes，registration businessbody保留；clone confirmed/unbanned Auth／active-role SHARE fence、domainlock、同transactionaudit。[Overload實際RED1→GREEN0及owned hosted/modern PG170006各19pass56assert/14actual55000拒絕](r01-forward/task-8-fix-1-evidence.md)。[671本機四gates0](r01-forward/task-8-controller-gates-20261007-evidence.md)只屬當時SHA，不代替新sourceCI。

[整體source審閱](r01-final-source-201-20261007-source-review.md) SOURCE spec COMPLIANT／quality APPROVED；93 reviewed shipping paths整合後相同。沒有新actionablefinding；不批准SQL、historicalexecution或未過CI的merge。

## 15檔SQL與catalog

[逐檔manifest](r01-final-source-201-20261007-manifest.csv)綁exactfilename、RAW/LFhash/Gitblob、前置profile/source/rollback，timestamp只是排序。**全部15檔DO_NOT_APPLY；production_approved/applied/deployed/enabled均false。** [Runbook](r01-final-source-201-20261007-runbook.md)保留catalog/signature/grants/RLS/defaultACL/Auth/native完整correlatedtuple、同transaction期限、backup/fullrestore、回復/retest。Document restoration9ed664a6必須先於fence4e158fad；strengthening後不可replay。App回復保留#200patchedTanStack及securityclamps，不刪financial/auditfacts，不dbpush/fakeledger。

[Freshmetadata-onlycatalog](r01-final-source-201-20261007-catalog-summary.json)：2026-10-06T23:36:59.841841Z、PG170006、158public/private tables、353function-kind+2citext1.6aggregates=355routines、ledger112/max20261001072505、15newversions空、五browsercontrol欄位0、公眾tables無RLSdisabled。353/早前355是scope差異，不推論DDLdrift。沒有applicationrows/Authidentities/DDL/DML；API無nativeexit。原始SQL/APIresponses ZIP及memberhash另保留。不是full146checker/profile/JWT/restoreadmission。

## Gate資格／限制

每個currenthead須實際typecheck/test/lint/build/route-tree及RLS/brand/a11y/performance五jobs與所有requiredsteps；rls-matrix continue-on-error故aggregateSUCCESS不足。Finance67/238、Group34/132、document1/36、Task8native19/56均須0skip；CI .004image不推未回報serverVersionNum。實際argv/exit/SHA/tree/environment/loghash在PR acceptance及controllerproof。

Current本機四gates **NOT_RUN**：[兩次原始pre-stage及environment/argv/exit/hash證據](r01-final-source-201-20261007-local-hold-evidence.md)。固定2GiBfloor已滿足；第一次ConnectionClosed probe exit1，外部readiness改變後retry probe exit0，但完整source hash由保存的f5b51515變為ace0b822，wrapper exit1並在template/fourcommands之前停止。未reset/reseed/repair/normalize/newbaseline，source drift attribution UNKNOWN。早前below-floor relay理由只屬已保留歷史，不是最新阻擋原因。原141/671結果仍historic；skips不是DBacceptance。原Task11 unit漏LOCAL placeholders曾reach55321/55322且無beforecapture，保存狀態仍 **UNKNOWN**。後續完整modernf5/templatec653只驗指定當次snapshot；bf0/managedRealtime attribution亦UNKNOWN。typed/rawrestore原失敗保持，未被scopednative成功取代。

## UI／效能／R11／外部交接

[原same-environment before/after及全部screenshots/runvalues](ui-performance-handoff-20261006.md)保留：baselinef8d5→當時T01/T02、Chrome148、390×844/1440×900各3cold。Mobilehomepage97→93/LCP2404→2545ms/TBT43→60ms是未解釋退步。Task13当時brand26×5/a11y26×1/performance24samples95–100exit0屬current-only，不宣稱改善；兩地30cold/warm NOT_RUN。[R11](r11-font-acceptance-20261006.md) PARTIAL：rareboxes/mixedextraction/subsetglyphloss/fullPDF4.34MB；100batch/peakmemory/reader/provider/替代font批准未完成。

Payment/newcheckout/newdelivery/newmedia維持disabled；既有webhook/reconciliation保留，paid不能因receipt/emailfailure倒退pending。Bulk維持snapshot→preview→per-item permission/version→apply→result，unknown先查原operation，failed-onlyretry；不盲refund/adoptionapprove/identitymerge。#130 signedintent/fingerprint/bodylimit/suspension/audit/media commit-before-public及#133僅CMSrevision PGRST205/42P01fallback保留；permission/unexpected/no-published/invalid全部不fallback。

| Owner | 待交具體證據／批准 |
| --- | --- |
| Release owner／DBA | 15exactfile逐檔正式批准、freshcatalog、fullrestore/off-machine/Storagebackup、window/rollback |
| Finance | provider sandboxidentity/methodapproval/正式bankdetails/callback+retry+partialfailure/reconciliation/refund UAT |
| Admin | hosted真roleJWT/revoked+banned+unconfirmed/directAPI/export/privatefile UAT |
| Content／adoption | 正式terms/retention/content/photo權利/mapping/seven-step/uploadexpiry/mobile+keyboard+staffjourneys |
| Volunteer | futureactivitypolicy/capacity/waitlist/formalterms；futurelegacy/nullpolicy仍current_policy_required拒絕 |
| Operations／on-call | emailtestsink/notification+schedule獨立批准/告警owner/recovery+retestwindow |

以上仍not-run/failed/held，不以SQLservice_role或inertSDK替代hosted驗收。Turnstilesite/secret、UpstashURL/token為user-reported已設定，不索取secret；hostedchallenge/invalid+expired/rate-limit驗收仍缺。本source不發真信、不真付款/refund、不正式上下架、不公開preview、不建立付費Supabasebranch。[原staff細節](staff-handoff-20261006.md)保留歷史來源，當前source入口是此PR。
