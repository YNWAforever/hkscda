# PR #201：冷啟動修復補充 · 2026-10-07

此記錄建立於已提交 source **f3e7b68b35555a3b46d80c980eb0459879a45163**、tree **7028943377b171cd47b76fe0b868d4f777aab956**。Final source/main CI、merge、exact READY 尚待本 PR 的後續 acceptance；不是已部署結果。原建立包 r01-final-source-201-20261007、所有歷史 raw reports／失敗及 paths 保持原樣。

## 實際結果

初次 CI [37556434962](https://github.com/YNWAforever/hkscda/actions/runs/37556434962) 的 verify、brand、a11y、performance 成功，但 rls-matrix 在 Start local Supabase stack 以 55000 supporter 拒絕；四個 native suites **NOT_RUN**，此 run 不獲驗收。[原始五個 job logs、actual checkout 與觀察](r01-cold-source-201-20261007-initial-ci-receipts.zip)及[逐檔 SHA/bytes](r01-cold-source-201-20261007-initial-ci-manifest.json)保留。Aggregate status 不代表五個 job 全綠。

[修復的實際 command／native exit／environment／RAW hash／拒絕與 rollback 證據](r01-forward/task-8-cold-fix-1-supplement.md)使用全新、空資料、自有61322 project，PG17.11.0.004／serverVersionNum170011／GoTruev2.197.0／Supabase CLI2.120.0。量度使用與 migration 相同的空 search_path；完整七表掃描與所有前置186檔檢查保留。現有 hosted／modern 向量保留，新增的是完整、相關的 cold 向量；每個 facet 必須同屬一個向量，未知組合拒絕。每個 target 的 overload 數目和每一 tuple 仍檢查。Registration／clone 業務與 audit／Auth／role fence 沒有擴大。

Current Task8 SQL **cf6ee8a04d88469ada06b45dbd12b14a8293a29a6208d9ba05fa22dfe5f6ad8f**／1360292 LF bytes；原 af8c834d95d38502d428dca95903e10d22cc57ed8df922f0a53cdb78d857ae9b 只屬歷史。其餘14檔 SQL 與原包 Git/LF bytes 相同。[Current15 manifest](r01-cold-source-201-20261007-manifest.csv)綁此 source；所有 **DO_NOT_APPLY**，production_approved/applied/deployed/enabled 均 false。首次 startup 捕獲的本機生成 keys 僅保存於 ignored originals，公開 receipt ZIP 排除該 stream，保留其 hash 與 exclusion metadata。

## 尚待驗收及操作交接

Final CI 必須逐個 job／required step 全綠；actual checkout/tree/parents 要匹配此修復的最終提交。Finance67/238、Group34/132、document1/36、volunteer19/56 都須 **0 skip／0 fail**。Scoped61322 GREEN 不能代替 cold native19；GoTrue healthy 後的 catalog 不能推斷 startup 階段已通過。

原本機55321/55322保存狀態 **UNKNOWN**。57322完整 hash f5b51515→ace0b822 的 attribution **UNKNOWN**；其 pre-stage exit1、current typecheck/tests/lint/build 四指令 **NOT_RUN**，不作 rebaseline、reset、reseed、修復或來源 DB 查詢。固定2GiB floor保留。原141/671結果仍屬當時 SHA。

[正式 schema／restore／rollback runbook](r01-cold-source-201-20261007-runbook.md)及[原交接包](r01-final-source-201-20261007-handoff.md)保留15精確正式批准、full typed/off-machine/Storage restore、provider sandbox／email test sink、hosted真角色JWT／直接API／export／私有檔案、手機／鍵盤完整旅程、正式terms／content／future volunteer policy等未完成項。Payment／new checkout／new delivery／new media schedules 維持停用。原 webhook/reconciliation 保留。

UI／效能為原同環境 before/after，mobile homepage97→93、LCP2404→2545ms、TBT43→60ms 是未解釋退步；無新增 before/after 量度或30冷暖兩地驗收。R11仍 PARTIAL，無字型／render改動。其他 issue 狀態見[建立時 snapshot](r01-cold-source-201-20261007-issue-snapshot.csv)；只有R01當前 tracker更新，非R01 raw rows不變。合併後的真實 source/main/alias、command與log hashes會列於[PR #201](https://github.com/YNWAforever/hkscda/pull/201)。
