# T24 · audit remediation release checklist (review package)

Captured 2026-09-28 HKT. Decision: NO-GO. The remediation branches are stacked draft PRs; none has been merged into main, deployed, migrated in production or operationally enabled. Remote main remains f8d5e5d5840d1775efb7d7f4ae2768f6557096b5; main CI 36258190910 passed five jobs at that SHA. Production alias was last metadata-observed at the same SHA; no alias inspection was repeated here. Current review source is draft PR #177 source head 8fd9310237e3ba94f91352f3ea713d1f012ac61b, stacked on #176 and preceding drafts.

release-manifest.json binds source SHA, 52 source migration checksums newer than the live maximum ledger version, CSV SHA-256 d98d110aa9c6ec8680455ffd93b96753fe96e3ad66705506baed78beccefe24f, blank unapproved config versions, CI, evidence paths and rollback boundary. tracker.csv records 34 issues: 25 code complete, 1 partial, 8 not complete; 16 schema ready, 1 partial, 12 not applicable, 5 not ready; 33 remediation issues not deployed and 1 historical deployed OPS-01. No new remediation is operationally enabled. ADMIN-04 and R01 remain partial.

## Gate register

| Gate | State | Evidence / boundary |
|---|---|---|
| Branch isolation and remote main | pass | Original dirty checkout preserved; independent draft PRs through #177. Remote main f8d5e5d at update, main CI 5/5. No main push or merge. |
| Strict typecheck, lint, build | pass on #177 source | npm.cmd run typecheck, npm.cmd run lint -- --quiet, npm.cmd run build: exit 0 separately in the isolated CRM worktree. Build is not typecheck proof. |
| Full isolated tests | pass on #177 source | Explicit loopback API 57321 and rollback-only synthetic DB 57322: bun test --isolate exit 0, 2963 pass/112 skip/0 fail/9347 assertions across 547 files. Fresh-schema CRM DB regression on 64322: 2 pass/16 assertions. Skipped provider and hosted cases are not counted as pass. |
| Schema/catalog/RLS | partial | #177 exact SQL passed transaction rehearsal, fresh 6432x installed all 161 real migrations and synthetic 6332x upgraded 160 to 161 with two payments and one failed job preserved; both checker runs report 133 compatible/zero issues. Enabled trigger, pinned search path and forbidden direct function grants checked. The saved read-only production metadata against 133 requirements remains incompatible: 127 required missing items (26 tables, 79 functions, 22 columns), and its 79-version ledger diverges from source (51 source-only, 21 live-only through the same maximum). Sanitized live-baseline bridge, full indexes/storage/grants/RLS, data-bearing locks, backup/restore and old-app compatibility remain open. |
| CI verify/RLS/brand/a11y/performance | #176 source/docs pass; #177 source pass, evidence-head pending | #176 source 36384803921 and evidence-head 36385940223 each passed five jobs. #177 source 36388704067 passed all five jobs; evidence-head pending. Fixture CI is not hosted role UAT. |
| Before/after UI and performance | partial | Prior public/volunteer synthetic captures and T21 loopback comparison remain in ui-performance.md. #175 bank confirmation and #176 CRM contact format review have static before/after flow evidence. Authenticated finance/CRM screenshots at 390/768/1366 and same-environment performance comparison are not-run. |
| Direct API, export, private files | partial | Isolated role/RLS/API tests in relevant PRs. #176 denies unauthorized CRM format preview before PII read; #177 fresh-schema CRM bulk DB fixture checks revoked actor, stale name-only edit, duplicate apply and audit rollback. Hosted actual-role direct API/export/private media/receipt and revoked-session browser tests are not-run. |
| Provider sandbox and event replay | not-run | No provider sandbox credentials/test account or approved payment method. No real payment, email, refund or notification. Existing webhook/reconciliation must remain active. |
| Public adoption/sponsorship/volunteer/supporter journeys | partial | Focused synthetic tests and selected local DB paths in PR stack; full hosted mobile/keyboard journeys and email test sink are not-run. |
| Production migration, alias smoke, private candidate | blocked | Requires release approval, reconciliation of the live 79-version ledger and complete catalog, sanitized live-baseline rehearsal, backup/restore proof, compatible rollback target and private role/provider UAT. No production mutation attempted. |

## Migration and rollback boundary

The 52 source files newer than the latest observed production version through 20260928113000 are listed with SHA-256 in migration-manifest.csv. They are not a complete production migration path because 51 older source versions are absent from the live ledger and 21 live versions are absent from source by version; see production-catalog-recheck-20260928.md. The 161-file fresh install and separate 160-to-161 sparse synthetic upgrade prove local syntax, ordering, grants and fixture preservation only. Before promotion, compare production table/function signatures, grants, RLS, indexes and storage policies; rehearse the full divergent ledger path on a sanitized data-bearing clone, measure locks and prove backup/restore. Do not blindly db push or insert migration ledger rows by hand.

The old app has not been certified against the final additive schema. On a schema fault, stop new checkout or affected submissions using approved admission control while retaining old webhook intake, reconciliation and durable delivery jobs. Keep committed payment/audit facts and use only a measured compatible app rollback. Never restore an older DB image over later events. Disable the new bank-match UI/API before app rollback; #174 guidance can revert to prior task cards. See migration-runbook.md and operations-handoff.md.

## Promotion sequence requiring separate approval

1. Release owner reviews the full PR stack, 34 issue states, unapproved config/content/terms and provider scope. Resolve or explicitly exclude every partial issue.
2. DBA confirms current catalog, exact checksums, data-bearing clone rehearsal, index locks, RLS/grants/storage policy, backup/restore and old-app compatibility.
3. Create an authorized private candidate at the **same tested app SHA** and approved config versions. Run five CI gates, real-role direct API/export/private-file checks, 390/768/1366 keyboard UAT, same-environment performance and each intended provider sandbox callback/replay/refund/receipt-failure matrix. Record pass/fail at that SHA.
4. Only after separate approvals: promote schema, verify catalog and real content, deploy the tested app, smoke public GET and old event intake, then enable only approved checkout methods. Main merge automatically deploys and requires its own release decision.
5. Monitor alias SHA, error rate, pending payments, webhook/worker backlog and last success, receipt failures, content visibility and staff queue counts; exercise the compatible disable/rollback path on failure.

This package requests review, not main merge, public preview, production DDL, payment enablement, content publication, notification or refund.
