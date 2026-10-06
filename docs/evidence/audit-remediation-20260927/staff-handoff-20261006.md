# Staff／外部驗收交接 · 2026-10-06

原有48個相關 PR 的 source 已 merged；新 R01 drafts 及 Task13 本機 source 未 production-applied、deployed 或 enabled。人員繼續既有已批准流程。[舊 operations handoff](operations-handoff.md) 保留原日期；本頁取代「22/46／#156 rollout blocked」作為目前狀態，不追溯修改歷史。

## 負責人與待交證據

| 負責人 | 待交／檢查項目 |
|---|---|
| Release owner／DBA | 指定 migration approval、fresh head CI 各 step、目標 catalog contract、off-machine backup／Storage／完整 restore drill、compatible rollback 及 staff window；不執行 apply-all |
| Finance treasurer | Provider sandbox identities／callbacks／reconciliation／refund tests、各付款方式 approval 及 config version、正式 bank/payment instructions；付款成功後 receipt/email failure 走獨立重試 |
| Admin lead | Hosted 各真實 role JWT 的 direct API／export／private media／receipt、revoked/banned/unconfirmed session、降權／expiry；SQL service_role 不等於 hosted JWT 驗收 |
| Content／adoption owner | Exact live IDs／內容分類／照片使用權／animal mapping、正式 terms／retention version；完整 seven-step／upload expiry／private-file journey 及 staff UAT；不修改 historical invalid seed 的公開內容 |
| Volunteer／operations | 14/30-day activity 政策、capacity exceptions、每 item 權限／版本、notification 獨立批准；付款及新 recovery／delivery／media schedules 仍 off |
| On-call | Private readiness token 只存 secret manager；告警門檻／責任人／retest window；normal rollback／unknown-outcome recovery，不 reset stack 或 terminate 他人 sessions |

## Credentials 及 hosted gates

使用者早前已表示設定 **Turnstile site/secret、Upstash URL/token**，記為「已配置（user reported）」。不要要求重輸／重新授權，也不要把歷史來源列表缺項解讀為未提供。Hosted challenge、invalid/expired token、rate-limit／fail-closed acceptance 尚未運行；需要非 secret metadata 及驗收 receipt，不能從配置推成功。

相應 owner 仍需確認 payment sandbox credentials／method approval、email test sink、scoped hosted test identities／roles／private-file permissions、formal terms／retention／content／notification 及 UAT approval。只列缺的驗收證據，不列 secret 值。Production mutation／real payment、email、refund、content publication／public preview 不在目前 authority。

## 重試、concurrency 及 partial failure 操作

- Bulk：snapshot → preview → 每 item permission/version recheck → apply → result/recovery。25 visible／最多1000 matching 是 selection scope，不是全批單一 atomic transaction。過期或 stale item 要新 preview；unknown outcome 先查原 operation，再 failed-only retry，不建立第二個 payment/audit。
- 保留 #130 fingerprint/idempotency/body limit、suspension recheck、atomic audit、signed upload 及 media commit-before-public。#133 CMS revision fallback **只限 CMS revision read 的 PGRST205／42P01**；其他 domain tables 應已存在。Permission／unexpected／missing published revision／invalid content **全部沒有 fallback**，仍回錯誤。
- Task13 SQL 包含 site／primary／zh-hk／en references、annual、unpublish／kind change、constraint completion、ON DELETE RESTRICT、private ACL／rollback／FK cleanup 及 same-transaction audit。RC inverse 23514；RR／Serializable 40001 要整個 owning transaction 安全 retry，不可當成功或吞掉 undefined rejection。
- SQL service_role／inert HTTP／browser SDK intercepted Auth／真實 hosted JWT／provider sandbox 是不同 scope。Local57 cases／111 named NoOp 不關閉 hosted role／full journey／refund／payment／provider 驗收。

## 交接確認

Release owner 確認 source／CI／manifest；DBA 確認 backup／catalog／recovery；Finance／Content／Admin／Volunteer 各簽核外部事項。未簽核保持 not-run／disabled。Detailed first failures／成本留於 [chronology](r01-decision-chronology-20261006.md)；操作前讀 [current release](release-package-20261006.md)，不沿用舊 rollout pending 日期推論。
