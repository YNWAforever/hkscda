# Sequential source acceptance — #191 — 2026-10-06

Original reviewed source `d0403a1869ea6dead498e62aebe9723e95c3ec19` is integrated with preceding source slices and patched #200 hosting dependencies at `ad333b908b865fbf6f6e3e8c594d438748b650c1` (tree `393133119008d0488ae5d96b7fd9d1ce7b19293b`). All actual local gates below ran at this exact source. This later evidence commit changes documentation only. Actual-main reconciliation and fresh exact-head CI remain required before sequential merge.

## Scope and qualified earlier acceptance

Original independently reviewed CMS atomic source with unchanged SQL bytes. Only the R01 tracker conflict was resolved; other issue rows preserved.

<details><summary>Historical scoped source/review snapshot; status is qualified to original source</summary>

## DRAFT — DO NOT MERGE / DO NOT APPLY

R01 Task7 source／隔離驗證；stacked on #190。此 PR 不包含新正式 migration／main release 批准。Task1 partial migration 仍未獲 source ACL 批准，Task7 的兩個 guarded domain forward 演練均排除它；不可正式 db push／apply-all。標準 CI 的全 source Supabase bootstrap 會載入 migration 目錄，包括該 partial 檔案；CI 通過不代表 Task1 actor／control-column 驗收或 application 批准。

### 修復

- 恢復 CMS promotion／generic admin-content RPC，保留 estate versioned command；同 transaction 鎖定已確認未停權 Auth actor → active staff/admin，保留 audit／版本／業務尾段。
- 只恢復缺少的三欄 unique notification conflict-target index；無 archive／去重／DELETE／歷史 backfill。
- knowledge publication 以實際 saved result 鎖定三個已發布 PDF references，保留原有23514／P0002／audit 語義。
- 三個實際 private handler 的42501只回安全403；保留其他錯誤、no-store、request ID及 #133 revision fallback。
- 完整15表／helper／native／owner／fullACL／defaultACL／RLS preflight；未知 profile 原子拒絕55000。

### 實際驗證

Source HEAD `d0403a1869ea6dead498e62aebe9723e95c3ec19`；migration `20261002011249_r01_cms_atomic_forward.sql` SHA-256 `a98d17d3c28ed5b24ef3e681cf7b71d623cc6c35856be767799b428eb0fcd901`。

只用 schema-only production projection、全合成資料、新 owned loopback PG17.6 clone；無正式資料還原／正式寫入／付款／寄信／內容發布。hosted-shape及modern各81pass／0fail／223assert（58DB＋23HTTP）；各兩次 apply，46／52個55000拒絕、正常 DROP，完整資料／catalog／Auth columns／defaultACL／native／ledger／template／source preservation。

| Command | Exit | Actual result |
| --- | --- | --- |
| `bun run typecheck` | 0 | 33.22s |
| `bun test --isolate --timeout 30000` | 0 | 3258pass／351skip／0fail／10561assert；86.28s |
| `bun run lint` | 0 | 39.49s；52既有 warnings |
| `bun run build` | 0 | 60.38s；既有 route warnings |

獨立 task review：spec PASS／quality Approved，沒有 Critical／Important；31DB／43gate inputs、23candidate Git blobs及464個可核查 committed artifacts 另經控制端比對。最後文件 commit 只改兩份 evidence，全部 frozen inputs／candidate blobs 不變；沒有重跑或把歷史 gates 當最終修復證據。

Fresh exact-head CI36960650129／attempt1／d040：verify、RLS、a11y、performance、brand 五個個別 jobs 均 completed／SUCCESS；run completed／SUCCESS，03:44:23Z 完成，控制端03:55Z逐 job再次確認。實際 RLS job110693985235 使用 PG17.11.0.002，03:37:03Z 成功 bootstrap 這個 a98 migration；原始 log124261bytes／SHA25657628e0c49a16da152313b2a38250dc50c5219a8784dbfa511bb05c00244073d。PG17.6 lab 與此 CI 環境分開記錄。

### 限制／相容性／回復

Conditional isolated public146 gaps22→20，正式仍44。146不涵蓋全部 private/native prerequisites：hosted post-commit document unpublish guard 缺少，已列獨立 Task13（Tasks8–12後、整體 acceptance前）；此 inline fence 不宣稱解決後續 unpublish。

歷史 a2 Gate2 wrapper 原件未有保存、記錄 Git object 不存在；歷史 log／receipt 保留，但其31-input source map 未能全部見證。最終 a98 的43-input archive及實際四 gates 獨立完整；無重建原件或沿用舊版本 proof。此限制已寫入 versioned evidence／binding。

可審閱 evidence、SQL、guards、commands、raw logs、runtime mirrors、rollback：`docs/evidence/audit-remediation-20260927/r01-forward/task-7-evidence.md`、`task-7-source-binding.json`。回復先退 app，保留附加 index／安全 fences；不去重、不 drop reference data、不回放 legacy migration、不偽填 ledger。正式 DDL／release 仍須 exact reviewed manifest、backup、dry-run及獨立批准。

支付、新 delivery及新 media schedules 保持停用；既有 webhook／reconciliation 維持原流程。Hosted/provider UAT、整體 integration及Tasks8–13 not-run／pending；這是單項 source／isolated acceptance，未部署或啟用。

</details>

Earlier SQL/profile receipts bind their own historical source composition. These isolated DB rehearsals were not repeated in this integration because the reviewed migration bytes are unchanged. No hosted/provider UAT or full typed restore is claimed.

## Actual local gates

Dedicated Windows worktree; Bun1.3.14 / Node24.18.0, patched dependencies. OS-only environment inheritance; Bun dotenv disabled; unavailable loopback59999 for tests and loopback54329 placeholders for build. No provider credentials or fixture mutation opt-ins.

| Command | Native PID | Exit | Result |
| --- | ---: | ---: | --- |
| `bun --no-env-file test --isolate --timeout 30000` | 58828 | 0 | 3206pass410skip0fail10430assert;61.31s |
| `node node_modules/typescript/bin/tsc --noEmit` | 21128 | 0 | separate strict TypeScript gate;153.96s |
| `node node_modules/eslint/bin/eslint.js src eslint.config.js vite.config.ts supabase/rls-tests` | 39100 | 0 | 0 errors;52 existing warnings;159.01s |
| `bun --no-env-file run build` | 58496 | 0 | existing bundle/deprecation warnings;191.97s |

Generated route tree remained current after build. [Complete raw receipts and streams](./sequential-source-191-20261006/) record argv/UTC/PID/source SHA/tree/environment/native exit and stream hashes. Skips are not optional DB/provider acceptance. Raw bytes retain original line endings. Build and typecheck are separate gates.

## Release status and rollback

Verified #200 main37485952883/95ab, #184 main37488399449/da8, #185 main37490548409/0b and #186 main37492571276/82: all five actual jobs/required steps SUCCESS, each exact merged source alias READY. #187 mergedc571a719 after CI37492802737 all5+stepsSUCCESS; aliasREADYdpl_5JJpYndFkbqqmSH8SXqNcTozJBEV, main37496751000 running. #188 integrationbe58abba freshCI37497002951 running. Production metadata-only read2026-10-06T16:01:38Z: PG170006,158tables/355functions,ledger112/max20261001072505,no new R01 forward ledger entries; counts are not full146requirement admission. Task8 actual missing RPC/actor RED and isolated domain implementation in progress; future policy positive flows/full typed restore/hosted/provider UAT NOT_RUN. All14 new SQL DO_NOT_APPLY; payment/new delivery/media disabled.

code-complete: this reviewed source slice and current local integration. schema-ready: qualified isolated profiles only; production file(s) unapplied. deployed: this source merge pending. operationally-enabled: false. Overall R01 remains partial; Task8 domain final acceptance pending. Full typed restore and hosted/provider UAT NOT_RUN.

All fourteen new R01 forward migrations remain DO_NOT_APPLY and unapplied. No production migration/ledger repair, new paid resource, public preview, real payment/email/refund/content mutation or activation. Checkout/payment/new delivery/new media schedules remain disabled. Source rollback is a focused revert retaining patched Start dependencies; reverting a real defect fix can reintroduce that defect. No automatic reverse DDL/data deletion is supplied.

## Retained timeout investigation and unchanged retry

Initial full suite native18376/exit1:3205pass410skip1fail10430assert; sole failure was the slogan whole-tree audit30s timeout. Initial isolated original test native9952/exit1 also timed out33.32s. Both original raw streams/receipts are preserved. No assertions, exclusions, source files, or30s timeout were changed.

An ignored instrumented copy retained exact assertions and measured git71.7ms, matcher123.1ms, file reads419.6ms; native24056/exit0,2pass10assert. A separate same-environment whole-tree scan native41708/exit0 read4073 tracked files/136255832 bytes in1.53s. The subsequent ORIGINAL focused test native28852/exit0:2pass10assert in0.52s. The unchanged complete suite native58828/exit0:3206pass410skip0fail10430assert in61.08s.

Measurements did not reproduce the earlier delay; its environmental cause is unconfirmed. This is retained timing-failure evidence, not a code defect claimed fixed. Instrumentation was confined to ignored scratch files. Only subsequent unchanged actual full-suite and separate gates above count as current acceptance; fresh exact-head CI is still required.
