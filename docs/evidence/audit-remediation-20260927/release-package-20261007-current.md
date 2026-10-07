# 目前 source release 及外部 gate · 2026-10-07

此頁以實測更新 source 狀態；2026-10-06 報告、原 manifest、JSON、原始失敗及 scoped profile 收據保持原樣。新的 finance compatibility SQL／source／profile 另由目前 manifest 的 current 欄位精確綁定，不能把原先47… hash 的歷史驗收套到新檔。Source merge/deployment、SQL 套用及 operational activation 各自記錄。

Task1 五個 control 欄位權限修正及 Task8 精確 classifier 已獲 source-only／隔離驗證批准。Task1 source 已合併；Task8 classifier／domain 的目前 SHA、fix1 審閱與最後 gates 以目前 JSON 逐項記錄；cold CI／外部 UAT 仍按各自 PR 驗收，不能從本文件推論完成。#200 已修復 hosting 套件安全阻擋，回復時必須保留已修補 TanStack dependencies。#180 仍為 unrelated DO_NOT_MERGE。

## 逐一已驗收 source

| PR | Source merge SHA | Main CI | Deployment acceptance |
| --- | --- | --- | --- |
| [#183](https://github.com/YNWAforever/hkscda/pull/183) | `f1d8cf848d76ede90113d58f494b43af35a5beca` | [37480568915](https://github.com/YNWAforever/hkscda/actions/runs/37480568915) all5/required steps SUCCESS | Own deployment BLOCKED_PACKAGE; cumulative source recovered by #200 at95ab6e7c READY |
| [#184](https://github.com/YNWAforever/hkscda/pull/184) | `da8e8850944cb4198e0b4bb2730d5c01a1e27887` | [37488399449](https://github.com/YNWAforever/hkscda/actions/runs/37488399449) all5/required steps SUCCESS | Exact source alias READY, verified before successor merge |
| [#185](https://github.com/YNWAforever/hkscda/pull/185) | `0b5e49997951bb5c3dcf6be861fbd1f4b2de2d0a` | [37490548409](https://github.com/YNWAforever/hkscda/actions/runs/37490548409) all5/required steps SUCCESS | Exact source alias READY, verified before successor merge |
| [#186](https://github.com/YNWAforever/hkscda/pull/186) | `82a47ef4f1d8695879f3b6c63ad4c42ae2a22f26` | [37492571276](https://github.com/YNWAforever/hkscda/actions/runs/37492571276) all5/required steps SUCCESS | Exact source alias READY, verified before successor merge |
| [#187](https://github.com/YNWAforever/hkscda/pull/187) | `c571a719077f242a062ec1b8d5b2de136614734b` | [37496751000](https://github.com/YNWAforever/hkscda/actions/runs/37496751000) all5/required steps SUCCESS | Exact source alias READY, verified before successor merge |
| [#188](https://github.com/YNWAforever/hkscda/pull/188) | `23089e6faa103e6857288560fa62f9349a45751a` | [37498550047](https://github.com/YNWAforever/hkscda/actions/runs/37498550047) all5/required steps SUCCESS | Exact source alias READY, verified before successor merge |
| [#189](https://github.com/YNWAforever/hkscda/pull/189) | `84ad4a9a2db2f146d6f6687866231414a9a23ca4` | [37500228059](https://github.com/YNWAforever/hkscda/actions/runs/37500228059) all5/required steps SUCCESS | Exact source alias READY, verified before successor merge |
| [#190](https://github.com/YNWAforever/hkscda/pull/190) | `5b2c226f8ba0a3a3d8fca76e77b812d4644cc578` | [37501995829](https://github.com/YNWAforever/hkscda/actions/runs/37501995829) all5/required steps SUCCESS | Exact source alias READY, verified before successor merge |
| [#191](https://github.com/YNWAforever/hkscda/pull/191) | `4a6e40b4c774acdd8d220d9d0f0599868da86668` | [37503886320](https://github.com/YNWAforever/hkscda/actions/runs/37503886320) all5/required steps SUCCESS | Exact source alias READY, verified before successor merge |
| [#192](https://github.com/YNWAforever/hkscda/pull/192) | `6c1527646deb60c24489b827b815c8e1a1c98bdc` | [37506322945](https://github.com/YNWAforever/hkscda/actions/runs/37506322945) all5/required steps SUCCESS | Exact source alias READY, verified before successor merge |
| [#193](https://github.com/YNWAforever/hkscda/pull/193) | `c2afedbe18e0fc41ecf3ad5dd7f23bcda9cd500a` | [37507888054](https://github.com/YNWAforever/hkscda/actions/runs/37507888054) all5/required steps SUCCESS | Exact source alias READY, verified before successor merge |
| [#194](https://github.com/YNWAforever/hkscda/pull/194) | `09a5cde376a8a9fc012e3f551b7a1bd1b5b166ac` | [37538469537](https://github.com/YNWAforever/hkscda/actions/runs/37538469537) all5/required steps SUCCESS | Exact source alias READY, verified before successor merge |
| [#195](https://github.com/YNWAforever/hkscda/pull/195) | `1b501fa8103cd22183358f058d7f85f69c78e7a0` | [37542947233](https://github.com/YNWAforever/hkscda/actions/runs/37542947233) all5/required steps SUCCESS | Exact source alias READY, verified before successor merge |
| [#196](https://github.com/YNWAforever/hkscda/pull/196) | `1ff22d6516a05e3cc82a6d041e5d12a117ca83af` | [37545626481](https://github.com/YNWAforever/hkscda/actions/runs/37545626481) all5/required steps SUCCESS | Exact source alias READY, verified before successor merge |

[逐項即時核對記錄](current-source-release-state-20261007.json)保留 main CI／exact deployment 身分；每個 sequential-source-N 報告保留 native command/PID/exit/SHA/tree/environment，未重跑的原 isolated schema 演練按原來源閱讀。Unit skips 不代表 DB/provider 驗收。Retained source-audit timeout、metadata wrapper/permission failures 與 unchanged retry 的資格均保留；不聲稱原因已修復或 cold 性能改善。Lint52 existing warnings、build warnings 仍存在。

## 目前 finance／Group 證據及歷史 incident

Task11 current compatibility SQL6bf3c277，保留原 business tail；新的 source及main cold CI各67 finance tests、0skip、238 assertions。Task12只重綁目前finance雜湊，GroupSQL90d640da保持，actualRED→GREEN、三次owned modern170006組合各38pass142assert及14 full55000拒絕；完整163table零列、504既有欄位rights／grant options及20control拒寫保留。最新native／source SHA、commands／exit、測試數和環境逐項由current JSON／profile qualification綁定，不能以modern結果代替native。

Task11最初unit harness漏了LOCAL placeholders，曾觸發既有55321／55322的四個fixture suites；沒有before capture，原local553保存狀態仍UNKNOWN。後續所有source harness明確LOCAL59999／fake keys且缺opt-ins，實際full snapshots只驗證指定modernf5／templatec653。沒有查詢、reset或修補553來製造歷史保存證據。原bf0與managedRealtime attribution亦保持UNKNOWN。

## SQL／相容性／rollback

[目前14檔 manifest](r01-forward-migration-manifest-20261007.csv)已用目前 Git SQL bytes 重算 RAW/LF hash/blob；Task1 現為90e3090f…，舊5c25 hash只屬歷史。每檔 production_approved/applied/deployed/enabled 仍false；source_merged/source_alias_ready 是獨立欄位。Task8 新 SQL 另列於其 focused PR，不在這14檔內，也未獲正式批准或套用。

[目前 runbook](r01-release-runbook-20261007.md)保留 exact catalog/signature/grants/RLS/defaultACL/Auth/native preflight、備份／restore drill、逐檔演練、rollback 及重新驗收界線。Timestamp order 不等於 source 相依或批准执行次序；document restoration 必須在 strengthening 前，strengthened body 之後不可 replay restoration。所有新 SQL **DO_NOT_APPLY**，不 db push、不假填 ledger。

正式 metadata-only capture 2026-10-06T16:01:38.768884Z：PG170006、public/private158tables355functions、ledger112/max20261001072505、新 R01 ledger entries空。這個 scope 與歷史 public-only154/304不同，並未重跑全部146項 checker；歷史44gaps不能當目前 confirmed count。

## 外部未測與職員交接

Payment/new checkout/new delivery/new media activation disabled；既有 signed webhook/reconciliation 相容性維持。付款成功後 receipt/email failure 只走獨立 recovery，不能退回 pending。本 source release 不發真信、做真付款／退款、上下架內容或公開 preview。

Hosted 真實角色 JWT、direct API/export/private files、完整手機／鍵盤／staff journeys、正式 terms/content approvals、provider sandbox callback/refund/payment、email test sink、full typed restore/off-machine backup/Storage restore 都仍按 [staff handoff](staff-handoff-20261006.md)逐項 not-run／待 owner。Turnstile／Upstash 四項由使用者已報設定，不再要求提供 secret；配置不是 hosted challenge/rate-limit 驗收。

[UI／同環境 performance 資格](ui-performance-handoff-20261006.md)仍為原實測；本次沒有新的 before/after 截圖、兩地 cold/warm 或可宣稱改善數據。R11 字型 evidence 的 partial/拒絕結果保持，不能由 source merge 推 font acceptance。

## Current documentation repair qualification

[Task1 committed receipt index](task-1-current-receipt-index-20261007.json) replaces the nonexistent sequential-source-183-20261006.md manifest pointer. It retains the original actor RED earlier candidate and the final 90e hosted/modern GREEN and inheritance-refusal pins separately; no new execution or profile acceptance is inferred. Current source-evidence digests bind canonical LF bytes of retrievable committed files; RAW/LF sizes and hashes are recorded separately in the fix controller proof.

The current manifest Task10 profile/predecessor evidence digest is corrected to actual RAW/LF e67984c9ef09c0842f9af4833ffd82fca08a6ea812618f3de6dcbf43aabf05e7. The historical advertised 0484a68084e254e80770f23983603df44d1a3fc0d769cb57f6469442293db006 does not match that tracked receipt at legacy6547 or its stated predecessor; the historical manifest and receipt remain unchanged. This correction does not grant profile admission. All14 current rollback pointers use the 20261007 runbook.

Both R01 current_sha fields denote the latest accepted source/main merge #196 (1ff22d6516a05e3cc82a6d041e5d12a117ca83af), with main37545626481 and captured exact READY dpl_6eqTvjA9hXHYvj8gpirksNiejbUy. The evolving #197 documentation head requires its own exact-head CI and conditional merge. All14 SQL and Task8 remain DO_NOT_APPLY, unapproved/unapplied/disabled; original553 preservation UNKNOWN, native CI serverVersionNum NOT_REPORTED, external UAT NOT_RUN.
