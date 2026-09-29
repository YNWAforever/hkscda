# T13 / R06 — atomic adoption fee reorder

Status: code complete and schema ready in an isolated stack; deployed no; operationally enabled no. Source branch codex/audit-fee-reorder-20260927, based on T12 source/docs commit d234b1fedb04b7223bd1110c48d005bbe4b1e858. Source commit 0972261be6d1fd6c746a3618c8a124940b6682b8. Draft PR [#146](https://github.com/YNWAforever/hkscda/pull/146), based on draft PR #145. Main was not pushed or merged.

## Reproduction and change

The pre-T13 editor built a temporary sort position and sent three sequential fee upsert POSTs. A failure after an earlier POST could leave a partial order. The new fee command regression began at 0/3 pass, exit 1 because versioned reorder/content methods were absent.

The UI now sends one reorder command with two fee IDs and expected versions, blocks a second click while pending, and refetches canonical rows after success or error. A dirty fee editor preserves local text on a background change, disables move, and requires explicit Load latest fee after conflict. Fee content saves contain only name, price and expected version. Existing-ID legacy upserts are rejected by the new service so a stale form cannot reset sort or publication. The server RPC serializes per species, locks rows in UUID order, checks same species, adjacency and versions, swaps in one transaction, and writes one audit entry. The additive trigger increments fee versions for legacy writers.

## Verification on 2026-09-27

Environment: isolated T13 worktree; unlinked loopback Supabase container supabase_db_hkscda-audit-remediation-20260927, API 127.0.0.1:57321 and DB 127.0.0.1:57322; synthetic 390x844 Playwright fixture at 127.0.0.1:56544. No production DB, public preview, real identity, email or payment was used.

| Command or gate | Exit | Result |
| --- | ---: | --- |
| bun test src/lib/adoptionInformation/fee-reorder.test.ts before fix | 1 | 0 pass, 3 fail: missing fee commands. |
| bun test focused adoption fee, HTTP, repository, UI and manifest files | 0 | 42 pass, 0 fail before one additional legacy-bypass regression; that regression then passed 4/4. |
| Get-Content migration SQL piped to isolated psql inside BEGIN/ROLLBACK | 0 | Additive DDL parsed and rolled back. |
| Get-Content supabase/tests/atomic_adoption_fee_reorder.sql piped to isolated psql | 0 | Three injected update failures each rolled back both rows and audit; one success had one audit and no spare sort. Stale, cross-species and nonadjacent conflicts; unknown, treasurer and disabled actors denied; active staff accepted; legacy version bump; service_role RPC grant only; test rows and trigger rolled back. |
| python scripts/rehearse-fee-reorder-concurrency.py --container supabase_db_hkscda-audit-remediation-20260927 | 0 | Two connections: first succeeded, second returned P4091 after 3.66 seconds waiting; one audit; synthetic rows cleaned. |
| CHECK_RELEASE_SCHEMA_DATABASE_URL=postgresql://postgres:***@127.0.0.1:57322/postgres bun scripts/check-release-schema.ts | 0 | 72 requirements, compatible, zero issues. Local T12/T13 DDL was applied for this check without fabricating ledger entries. |
| node scripts/verify-fee-reorder.mjs | 0 | Failed swap retained order; double-click made one effective request; canonical refetch; dirty conflict recovery; content-only save preserved order. |
| SUPABASE_LOCAL_URL=http://127.0.0.1:57321 bun test --timeout=30000 --max-concurrency=8 | 0 | First run: 2797 pass/83 skip/3 fail due old synthetic fee fixtures without version. After fixture repair: 2800 pass, 83 skip, zero fail across 470 files. The later legacy-bypass test passed separately. |
| bun run typecheck | 0 | Strict TypeScript passed after final source and test changes. |
| bun run lint | 0 | 51 existing warnings, zero errors. |
| bun run build | 0 | Client, SSR and Nitro build passed without deployment. |
| git diff --cached --check | 0 | No staged whitespace errors. |

Synthetic mobile UI after correction: [T13 fee screenshot](ui/t13-fee-after.png). The pre-T13 UI sent three requests; the relevant before behavior is the reproduced red test. A same-environment visual performance delta was not measured for this transactional admin change; [public baseline comparison](ui-performance.md) covers the earlier public journey separately.

## Release and operator boundary

The migration checksum and order are in [migration-manifest.csv](migration-manifest.csv) and the catalog/rollback steps in [migration-runbook.md](migration-runbook.md). The local checker proves required objects on one isolated stack, not a data-bearing production upgrade or validated migration ledger. The DB owner must approve target catalog, exact signatures/grants/RLS, lock/backfill and backup plan before migration. The new app needs the fee column and RPCs first. Old audited create/content paths remain operational during mixed checkouts, while older fee reorder should be paused if the app is rolled back.

Staff: use the arrows only after current edits are saved. A 409 means another staff member changed the fee: compare text and explicitly load the latest row before re-entering. A failed swap leaves the order unchanged; reload canonical data before retry. Release owner must approve the tested SHA and CI before main merge. Production content and payment activation remain separate gates. Vercel's audit-branch deployment rule is disabled; the post-push deployment listing contained zero audit branch deployments.
