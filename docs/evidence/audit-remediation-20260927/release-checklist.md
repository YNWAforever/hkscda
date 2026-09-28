# T24 · audit remediation release checklist (review package)

Captured 2026-09-28 HKT. Decision: NO-GO. The remediation branches are stacked draft PRs; none has been merged into main, deployed, migrated in production or operationally enabled. Remote main remains f8d5e5d5840d1775efb7d7f4ae2768f6557096b5; main CI 36258190910 passed five jobs at that SHA. Production alias was last metadata-observed at the same SHA; no alias inspection was repeated here. Focused #178 source is a3dc126024267015a17939d6c5cd3715bbcce1f0. The separate local-only combined review source is 9130cb846d7a876e0c867c1dddd1fcc33aa0c6ce; it merges the independent PR chains and has not been pushed or run in remote CI.

release-manifest.json binds the local combined source SHA, 61 source migration checksums newer than the live maximum ledger version, CSV SHA-256 dcdfbb4c71a9fb1587bed880b2b8fe3ad329d92400ec5fc3edf51ca93c9cffcf, blank unapproved config versions, not-run integrated remote CI, evidence paths and rollback boundary. tracker.csv records 34 issues: 25 code complete, 1 partial, 8 not complete; 16 schema ready, 1 partial, 12 not applicable, 5 not ready; 33 remediation issues not deployed and 1 historical deployed OPS-01. No new remediation is operationally enabled. ADMIN-04 and R01 remain partial.

## Gate register

| Gate | State | Evidence / boundary |
|---|---|---|
| Branch isolation and remote main | pass | Original dirty checkout preserved; independent draft PRs through #178. Remote main f8d5e5d at update, main CI 5/5. No main push or merge. |
| Strict typecheck, lint, build | pass on integrated local source | bun run typecheck, bun run lint -- --quiet, bun run build: exit 0 separately in the isolated integration worktree. Build is not typecheck proof. |
| Full isolated tests | pass on integrated local source with single worker | Seed-disabled loopback API 57321 and DB 57322 after 170 migrations: bun test --isolate --parallel=1 --timeout=60000 exit 0, 3075 pass/110 skip/0 fail/9793 assertions across 574 files. An earlier default-parallel run timed out in three DB cases; all passed alone. Skipped provider and hosted cases are not counted as pass. |
| Schema/catalog/RLS | partial | Combined source applied 170 migrations on two fresh seed-disabled isolated stacks, with real ledgers and 145 compatible catalog requirements/zero issues. The earlier #178 slice also passed 161→162 synthetic preservation for two payments and one delivery job. Saved read-only production metadata against the earlier 140-item checker remains incompatible: 134 required missing items (28 tables, 83 functions, 23 columns); the live 79-version ledger diverges from source. A live comparison against all 145 combined requirements, sanitized 79-ledger bridge, full indexes/storage/grants/RLS, data-bearing locks, backup/restore and old-app compatibility remain open. |
| CI verify/RLS/brand/a11y/performance | focused PRs pass; combined SHA not-run | #176 source/docs 36384803921/36385940223, #177 source/docs 36388704067/36389895803, and #178 source/docs 36394352630/36395704420 each passed five jobs. No remote CI ran on integrated source 9130cb8; fixture CI is not hosted role UAT. |
| Before/after UI and performance | partial | Prior public/volunteer synthetic captures and T21 loopback comparison remain in ui-performance.md. #175 bank confirmation and #176 CRM contact format review have static before/after flow evidence. Authenticated finance/CRM screenshots at 390/768/1366 and same-environment performance comparison are not-run. |
| Direct API, export, private files | partial | Isolated role/RLS/API tests in relevant PRs. #176 denies unauthorized CRM format preview before PII read; #177 fresh-schema CRM bulk DB fixture checks revoked actor, stale name-only edit, duplicate apply and audit rollback. #178 also verifies per-item CRM assignment roles, 25-item retry and two-connection one-winner/one-conflict with one audit. Hosted actual-role direct API/export/private media/receipt and revoked-session browser tests are not-run. |
| Provider sandbox and event replay | not-run | No provider sandbox credentials/test account or approved payment method. No real payment, email, refund or notification. Existing webhook/reconciliation must remain active. |
| Public adoption/sponsorship/volunteer/supporter journeys | partial | Focused synthetic tests and selected local DB paths in PR stack; full hosted mobile/keyboard journeys and email test sink are not-run. |
| Production migration, alias smoke, private candidate | blocked | Requires release approval, reconciliation of the live 79-version ledger and complete catalog, sanitized live-baseline rehearsal, backup/restore proof, compatible rollback target and private role/provider UAT. No production mutation attempted. |

## Migration and rollback boundary

The 61 combined source files newer than the latest observed production version through 20260928120000 are listed with SHA-256 in migration-manifest.csv. All 170 source files applied on two fresh local stacks with real ledgers; both integrated catalog checks reported 145 compatible requirements and zero issues. They are not a complete production migration path because 51 older source versions are absent from the live ledger and 21 live versions are absent from source by version; see production-catalog-recheck-20260928.md. The previously fresh-installed 161-file stack advanced to 162, and a separate 161-to-162 sparse synthetic upgrade prove local syntax, ordering, grants and fixture preservation only. Before promotion, compare production table/function signatures, grants, RLS, indexes and storage policies; rehearse the full divergent ledger path on a sanitized data-bearing clone, measure locks and prove backup/restore. Do not blindly db push or insert migration ledger rows by hand.

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

## Combined local candidate

See [integration-candidate-20260928.md](integration-candidate-20260928.md) for merge conflicts, duplicate-version fixes, 170-file local replay, 145-item catalog checks, the failed and passing test commands, and remaining external gates. This local candidate is not a private preview or a release-approved app SHA.
