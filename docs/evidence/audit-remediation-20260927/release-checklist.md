# T24 · audit remediation release checklist (review package)

Captured 2026-09-28 HKT. **Decision: NO-GO.** All remediation branches remain draft and stacked; none has been merged to `main`, deployed, migrated in production, or operationally enabled by this work. The production alias was last metadata-verified at `f8d5e5d5840d1775efb7d7f4ae2768f6557096b5`; `git ls-remote origin refs/heads/main` returned the same SHA at package capture. Main CI run `36258190910` passed its five jobs. Source freeze `f76af31c3a0f7882d05aa544337bb4e6d55c5375` is PR #167, stacked on #166 and preceding draft PRs. The documentation-only package refresh follows that source SHA.

The machine-readable `release-manifest.json` binds source SHA, 46 ordered migration file checksums, manifest SHA-256 `2a30158023f0945a096b01697c870f5c74abf53f2a217e14101a10bd24ad62e2`, config-version blanks, CI run, evidence paths and the compatibility rollback rule. Blank config versions are **missing approvals**, not default values. The per-issue `tracker.csv` lists all 34 IDs and separately records code complete, schema ready, deployed and operationally enabled. At capture: 24 code complete, 16 schema ready, 11 schema not applicable, 33 not deployed, and no new remediation operationally enabled. Partial IDs stay open.

## Gate register

| Gate | State | Evidence / boundary |
|---|---|---|
| Branch isolation and remote main | pass | Independent draft PRs #134–#167; `origin/main` `f8d5e5d` at capture. Original dirty checkout preserved. |
| Strict typecheck, lint, build | pass on #167 source | `npm.cmd run typecheck`, `npm.cmd run lint -- --quiet`, `npm.cmd run build`: exit 0 on #167 source. Lint warnings were suppressed for the final error gate; build success is not used as typecheck proof. |
| Full isolated tests | pass on exact source | `SUPABASE_LOCAL_URL=http://127.0.0.1:57321 bun test --isolate`: final exit 0, 2887 pass, 106 skip, 0 fail, 8988 assertions across 519 files. #167 proof queue focused tests 96 pass and direct API/service/UI tests 65 pass. The named local 57321/57322 PostgREST synthetic 3-pledge test returned 2 pending results over two pages; all synthetic rows were removed and the preservation trigger confirmed enabled. Dedicated CMS quality and finance fixtures retain prior evidence. #167 source CI is pending at package preparation. |
| Schema/catalog/RLS | partial | Named unlinked loopback DB `127.0.0.1:57322`: 116 catalog objects compatible, zero checker issues; latest local ledger `20260927150000`. Later files were manually rehearsed/applied locally without forged ledger rows. Forbidden grants and audit rollback tested in domain fixtures. Full 46-file ordered fresh and sanitized data-bearing upgrade rehearsal, storage policies, backup/restore and lock timing are not-run. |
| Brand/a11y/performance CI | #166 passed; #167 pending | #165 corrected source run `36350007831` passed all five; documentation-head run `36350805228` first failed RLS before tests because GitHub runner port 55324 was occupied, then passed all five jobs on attempt 2. #166 source run `36353059091` passed verify, brand, a11y, RLS matrix and performance. Inspect every job, not the overall workflow conclusion. This is fixture CI, not hosted role UAT. |
| Before/after UI and performance | partial | `ui-performance.md`, `performance-comparison.csv`, T16/T17 synthetic captures, sponsorship 390px overflow regression and T21 10k loopback comparison. No same-SHA private hosted comparison or staff-login recording. |
| Direct API, export, private file access | partial | Isolated test roles, RLS and API denial tests in #148/#157/#160–#162; #167 proof query requires the existing reader role and preserves no-store. No real hosted role identities or private receipt download browser UAT. |
| Provider sandbox and event replay | not-run | No provider sandbox credentials/test account or approved payment methods. No real payment, email, refund or notification. Existing webhook and reconciliation must remain active. |
| Public adoption/sponsorship/volunteer/CRM journeys | partial | Focused synthetic and DB tests in respective PRs; complete real-role mobile/keyboard journeys and email test sink not-run. |
| Production catalog, migrations, alias smoke | blocked | Requires reviewed current catalog, fresh/data-bearing rehearsal, backup proof, release approval and controlled maintenance. No production mutation attempted. |

## Migration and compatibility boundary

The original T01 fresh/upgrade rehearsal covered 34 source migrations to ledger `20260926190000`; twelve later additive files bring this review manifest to 46. Those twelve were individually rehearsed and used only on the named unlinked loopback DB; they were not run as one ordered data-bearing migration chain. `migration-runbook.md` records each later addendum. Before promotion, compare exact production catalog/signatures/grants/RLS/indexes/storage policies with the 46-file manifest, rehearse a fresh install and sanitized data-bearing clone, record lock/backfill estimates, and verify backup plus restore. Run the checker and role/API fixtures against both. Do not `db push` blindly or insert migration ledger rows by hand.

New app functions depend on additive RPCs, while the old app's compatibility with the final schema has not been proven as a rollback target. Stop **new** checkout/adoption/other affected submissions on schema fault, retain durable incoming webhooks and reconciliation, preserve committed payment/audit facts, and use only a measured compatible app rollback. Never restore an older DB image over newer events. See `operations-handoff.md`.

## Promotion sequence requiring separate approval

1. Release owner reviews exact PR stack, issue tracker, unresolved content/terms/policy and provider scope. Resolve or explicitly exclude every partial issue.
2. DBA confirms backup/restore, current catalog, ordered migrations, fresh and data-bearing rehearsal, grants/RLS/seed assertions and migration manifest checksum.
3. Create an authorized private candidate at the **same tested app SHA** and approved config versions. Run the full gate suite, real-role direct API/export/private file checks, mobile/keyboard UAT, same-environment performance, and each intended provider's real sandbox callback/replay/refund/receipt failure matrix. Record pass/fail at that SHA.
4. Only after each required approval: apply schema, verify catalog and real content, deploy the tested app, smoke GET and old event intake, then enable only approved checkout methods. Main merge is an automatic deployment and is therefore a separate release decision.
5. Monitor alias SHA, error rate, payment pending, webhook/worker backlog and last success, receipt failures, content visibility and staff queue counts; exercise the compatible rollback/disable path on failure.

This package requests review, not a merge, public preview, production DDL, payment enablement, publication, notification or refund.
