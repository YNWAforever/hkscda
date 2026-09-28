# T24 · audit remediation release checklist (review package)

Captured 2026-09-28 HKT. **Decision: NO-GO.** The remediation branches are stacked draft PRs; none has been merged into `main`, deployed, migrated in production or operationally enabled by this work. `git ls-remote origin refs/heads/main` returned `f8d5e5d5840d1775efb7d7f4ae2768f6557096b5` at this update; main CI run `36258190910` passed all five jobs at that SHA. The production alias was last metadata-observed at the same SHA; this update did not repeat alias inspection. Current review source is PR #174 commit `8f62d8a4ccd52803ebb8aea6929b8e9e7ee901ab`, stacked on #173 and all preceding drafts.

`release-manifest.json` binds the source SHA, **50 ordered post-ledger migration checksums**, CSV manifest SHA-256 `108bb9d96df37a2dd434ba323d935802b4e74107eb140bad48c46ebe4dcdefc8`, blank unapproved config versions, source CI, evidence paths and the compatibility rollback rule. `tracker.csv` records all **34 issues**: 25 code complete, 1 partial, 8 not complete; 16 schema ready, 1 partial, 12 not applicable, 5 not ready; 33 remediation issues not deployed and 1 historical deployed OPS-01. No new remediation is operationally enabled. Partial IDs remain open.

## Gate register

| Gate | State | Evidence / boundary |
|---|---|---|
| Branch isolation and remote main | pass | Original dirty checkout preserved; independent draft PRs through #174. Remote main `f8d5e5d` at update, main CI 5/5. No main push or merge. |
| Strict typecheck, lint, build | pass on #174 source | `npm.cmd run typecheck`, `npm.cmd run lint -- --quiet`, `npm.cmd run build`: exit 0 each in isolated worktree. Build is not typecheck proof. |
| Full isolated tests | pass on #174 source | Loopback 57321/57322 with named rollback-only fixtures: `bun test --isolate` exit 0, **2949 pass/109 skip/0 fail/9259 assertions across 540 files**. Focused role guidance 6 pass/34 assertions; #173 retry/list guard 10 pass/60 assertions. Skipped provider/hosted cases are not counted as pass. |
| Schema/catalog/RLS | partial | Exact final #173 SQL locally applied without ledger forgery on 57322; 127 requirements compatible/zero issues. Fresh unique 6032x stack rebuilt all 159 final repository migrations, real local ledger 159, checker 127 compatible. Separate 6232x synthetic stack applied observed 109-migration baseline, seeded two synthetic payments plus one failed job, then applied all 50 later files in order, exit 0; facts survived and checker 127 compatible. Sanitized production-like clone, current production catalog comparison, lock/backfill timing, backup/restore and old-app compatibility remain open. |
| CI verify/RLS/brand/a11y/performance | #173 and #174 source pass | #173 source run `36373635875` and docs-head run `36374479910` each passed all five jobs. #174 source run `36375345907` passed all five jobs. CI fixture success is not hosted role UAT. |
| Before/after UI and performance | partial | `ui-performance.md`, `performance-comparison.csv`, public/volunteer synthetic captures and T21 loopback comparison. #174 ordered guidance has static DOM evidence and textual before/after; authenticated admin screenshots at 390/768/1366 and same-environment hosted comparison are not-run. |
| Direct API, export, private files | partial | Isolated role/RLS/API tests in relevant PRs. #173 list/retry SQL checks current Auth/admin state and service-only grants; #174 preserves route authorization. Hosted actual-role direct API/export/private media/receipt tests and revoked-session browser behavior are not-run. |
| Provider sandbox and event replay | not-run | No provider sandbox credentials/test account or approved payment method. No real payment, email, refund or notification. Existing webhook/reconciliation must remain active. |
| Public adoption/sponsorship/volunteer/supporter journeys | partial | Focused synthetic tests and selected local DB paths in PR stack; full hosted mobile/keyboard journeys and email test sink are not-run. |
| Production migration, alias smoke, private candidate | blocked | Requires release approval, reviewed current catalog, sanitized data-bearing rehearsal, backup/restore proof, compatible rollback target and private role/provider UAT. No production mutation attempted. |

## Migration and rollback boundary

The exact **50** ordered files from the observed production ledger through `20260928100000` are listed with SHA-256 in `migration-manifest.csv`. The 159-file fresh install and separate 109-to-159 sparse synthetic upgrade prove local syntax, ordering, grants and fixture preservation only. Before promotion, compare production table/function signatures, grants, RLS, indexes and storage policies, check duplicate references and historical row volume, rehearse on a sanitized data-bearing clone, measure locks, and verify backup **and restore**. Do not blindly `db push` or insert migration ledger rows by hand.

The old app has not been certified against the final additive schema. On a schema fault, stop **new** checkout or affected submissions using the approved admission control while retaining old webhook intake, reconciliation and durable delivery jobs. Keep committed payment/audit facts and use only a measured compatible app rollback. Never restore an older DB image over later events. New worklist/UI can be disabled before app rollback; the #174 guidance itself reverts to prior task cards. See `migration-runbook.md` and `operations-handoff.md`.

## Promotion sequence requiring separate approval

1. Release owner reviews the full PR stack, 34 issue states, unapproved config/content/terms and provider scope. Resolve or explicitly exclude every partial issue.
2. DBA confirms current catalog, exact checksums, data-bearing clone rehearsal, index locks, RLS/grants/storage policy, backup/restore and old-app compatibility.
3. Create an authorized private candidate at the **same tested app SHA** and approved config versions. Run five CI gates, real-role direct API/export/private-file checks, 390/768/1366 keyboard UAT, same-environment performance and each intended provider sandbox callback/replay/refund/receipt-failure matrix. Record pass/fail at that SHA.
4. Only after separate approvals: promote schema, verify catalog and real content, deploy the tested app, smoke public GET and old event intake, then enable only approved checkout methods. Main merge automatically deploys and requires its own release decision.
5. Monitor alias SHA, error rate, pending payments, webhook/worker backlog and last success, receipt failures, content visibility and staff queue counts; exercise the compatible disable/rollback path on failure.

This package requests review, not main merge, public preview, production DDL, payment enablement, content publication, notification or refund.
