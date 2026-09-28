# T24 · audit remediation release checklist (review package)

Captured 2026-09-28 HKT. Decision: NO-GO. The remediation branches are stacked draft PRs; none has been merged into main, deployed, migrated in production or operationally enabled. Remote main remains f8d5e5d5840d1775efb7d7f4ae2768f6557096b5; main CI 36258190910 passed five jobs at that SHA. Production alias was last metadata-observed at the same SHA; no alias inspection was repeated here. Current review source is draft PR #178 source head a3dc126024267015a17939d6c5cd3715bbcce1f0, stacked on #177 and preceding drafts.

release-manifest.json binds source SHA, 53 source migration checksums newer than the live maximum ledger version, CSV SHA-256 148405b49c2f978b3580fe42add27cc729c106ed4380a58d05baf3435c013fde, blank unapproved config versions, CI, evidence paths and rollback boundary. tracker.csv records 34 issues: 25 code complete, 1 partial, 8 not complete; 16 schema ready, 1 partial, 12 not applicable, 5 not ready; 33 remediation issues not deployed and 1 historical deployed OPS-01. No new remediation is operationally enabled. ADMIN-04 and R01 remain partial.

## Gate register

| Gate | State | Evidence / boundary |
|---|---|---|
| Branch isolation and remote main | pass | Original dirty checkout preserved; independent draft PRs through #178. Remote main f8d5e5d at update, main CI 5/5. No main push or merge. |
| Strict typecheck, lint, build | pass on #178 source | bun run typecheck, bun run lint -- --quiet, bun run build: exit 0 separately in the isolated CRM worktree. Build is not typecheck proof. |
| Full isolated tests | pass on #178 source | Explicit loopback API 57321 and rollback-only synthetic DB 57322: bun test --isolate exit 0, 2970 pass/112 skip/0 fail/9405 assertions across 552 files. CRM assignment synthetic fixtures on 57322: 7 focused pass including a true two-connection winner/conflict test. Skipped provider and hosted cases are not counted as pass. |
| Schema/catalog/RLS | partial | #178 exact committed SQL applied with real ledger 161→162 on the 64322 fresh-installed stack and 63322 synthetic upgrade stack; both checker runs report 140 compatible/zero issues. Two synthetic payments and one delivery job retained exact hashes. #177 version trigger remains enabled, private guards pin search path and direct runtime-role EXECUTE is denied. The saved read-only production metadata against 140 requirements remains incompatible: 134 required missing items (28 tables, 83 functions, 23 columns), and its 79-version ledger diverges from source (51 source-only, 21 live-only through the same maximum). Sanitized live-baseline bridge, full indexes/storage/grants/RLS, data-bearing locks, backup/restore and old-app compatibility remain open. |
| CI verify/RLS/brand/a11y/performance | #176 source/docs pass; #177 source/docs pass; #178 source pass; evidence-head pending | #176 source 36384803921 and evidence-head 36385940223 each passed five jobs. #177 source 36388704067 and evidence-head 36389895803 passed all five jobs; #178 source CI 36394352630 passed all five jobs; evidence-head pending. Fixture CI is not hosted role UAT. |
| Before/after UI and performance | partial | Prior public/volunteer synthetic captures and T21 loopback comparison remain in ui-performance.md. #175 bank confirmation and #176 CRM contact format review have static before/after flow evidence. Authenticated finance/CRM screenshots at 390/768/1366 and same-environment performance comparison are not-run. |
| Direct API, export, private files | partial | Isolated role/RLS/API tests in relevant PRs. #176 denies unauthorized CRM format preview before PII read; #177 fresh-schema CRM bulk DB fixture checks revoked actor, stale name-only edit, duplicate apply and audit rollback. #178 also verifies per-item CRM assignment roles, 25-item retry and two-connection one-winner/one-conflict with one audit. Hosted actual-role direct API/export/private media/receipt and revoked-session browser tests are not-run. |
| Provider sandbox and event replay | not-run | No provider sandbox credentials/test account or approved payment method. No real payment, email, refund or notification. Existing webhook/reconciliation must remain active. |
| Public adoption/sponsorship/volunteer/supporter journeys | partial | Focused synthetic tests and selected local DB paths in PR stack; full hosted mobile/keyboard journeys and email test sink are not-run. |
| Production migration, alias smoke, private candidate | blocked | Requires release approval, reconciliation of the live 79-version ledger and complete catalog, sanitized live-baseline rehearsal, backup/restore proof, compatible rollback target and private role/provider UAT. No production mutation attempted. |

## Migration and rollback boundary

The 53 source files newer than the latest observed production version through 20260928120000 are listed with SHA-256 in migration-manifest.csv. They are not a complete production migration path because 51 older source versions are absent from the live ledger and 21 live versions are absent from source by version; see production-catalog-recheck-20260928.md. The previously fresh-installed 161-file stack advanced to 162, and a separate 161-to-162 sparse synthetic upgrade prove local syntax, ordering, grants and fixture preservation only. Before promotion, compare production table/function signatures, grants, RLS, indexes and storage policies; rehearse the full divergent ledger path on a sanitized data-bearing clone, measure locks and prove backup/restore. Do not blindly db push or insert migration ledger rows by hand.

The old app has not been certified against the final additive schema. On a schema fault, stop new checkout or affected submissions using approved admission control while retaining old webhook intake, reconciliation and durable delivery jobs. Keep committed payment/audit facts and use only a measured compatible app rollback. Never restore an older DB image over later events. Disable the new bank-match and CRM assignment UI/API before app rollback; #174 guidance can revert to prior task cards. See migration-runbook.md and operations-handoff.md.

## Promotion sequence requiring separate approval

1. Release owner reviews the full PR stack, 34 issue states, unapproved config/content/terms and provider scope. Resolve or explicitly exclude every partial issue.
2. DBA confirms current catalog, exact checksums, data-bearing clone rehearsal, index locks, RLS/grants/storage policy, backup/restore and old-app compatibility.
3. Create an authorized private candidate at the **same tested app SHA** and approved config versions. Run five CI gates, real-role direct API/export/private-file checks, 390/768/1366 keyboard UAT, same-environment performance and each intended provider sandbox callback/replay/refund/receipt-failure matrix. Record pass/fail at that SHA.
4. Only after separate approvals: promote schema, verify catalog and real content, deploy the tested app, smoke public GET and old event intake, then enable only approved checkout methods. Main merge automatically deploys and requires its own release decision.
5. Monitor alias SHA, error rate, pending payments, webhook/worker backlog and last success, receipt failures, content visibility and staff queue counts; exercise the compatible disable/rollback path on failure.

This package requests review, not main merge, public preview, production DDL, payment enablement, content publication, notification or refund.

## #178 source-specific gate note

New CRM assignment and assignee UI/API are code-complete and schema-ready only. The 162-file local rehearsals and 140-item catalog checks do not resolve the live 79-ledger bridge, sanitized clone, supporter ALTER lock, private role/mobile/keyboard UAT, same-environment before/after CRM metrics or release approval. No production migration or operational enablement occurred.
