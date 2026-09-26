# T01 migration and compatibility runbook

Status: **schema-ready = no**. This document is a review and rehearsal checklist, not authorization to apply DDL to production. Captured against `f8d5e5d5840d1775efb7d7f4ae2768f6557096b5` on 2026-09-27 HKT.

## Source versus production

- Source has 34 migration files after the production ledger's latest `20260914164558`. Their ordered names, SHA-256 checksums and declared objects are in `migration-manifest.csv`. The source inventory includes 11 new public tables, 49 public function declarations (including trigger functions and replacements), and seven additive columns. The `releaseManifest.ts` checks these 67 objects; the generated inventory does not prove that every constraint, index, storage policy or seed is valid.
- Read-only production `pg_catalog` queries found all eight reaudit-minimum tables and all 14 reaudit-minimum RPC names absent; `public_status_token.submission_fingerprint` absent. The catalog remains the authority: a ledger row or file name alone cannot make a release compatible.
- The `#133` public adoption-instructions fallback covers only revision-read `PGRST205` or `42P01`. It does not satisfy CMS writes, upload/submission or finance dependencies. Permission, unexpected, missing-published-revision and invalid-content errors must continue failing.
- Source code and current catalog still need a reviewed inventory of **constraints, indexes, storage policies, grants to forbidden roles, and seed validity**. The `releaseManifest.ts` checks table columns/RLS/service-role grants and function name/arguments/return/service-role grant; this is not a complete deployment gate yet.

## Rehearsal order on a disposable database

1. Provision an isolated Supabase/Postgres stack with a known backup. Confirm the connection string points to that stack and cannot reach project `iihqjzilgawhfdhdevam`. Do not use `supabase db reset`, fixture writes or migration repair against production.
2. Rebuild a fresh disposable database from the full migration history. Recreate a second disposable database from a sanitized `20260914164558` state and apply the 34 reviewed files in the order in `migration-manifest.csv`. Record each command, exit code, timing, lock wait and any data backfill count.
3. Check table and column types, exact RPC identity arguments and return types, RLS enabled, table grants, RPC EXECUTE grants and forbidden public/anon/authenticated access. Check constraints/indexes and storage policies manually against each migration. Verify the published adoption instruction revision is valid and refers to its page.
4. Run `CHECK_RELEASE_SCHEMA_DATABASE_URL=<isolated-read-only-URL> bun scripts/check-release-schema.ts` against both fresh and upgraded databases. Exit 0 means only the implemented 67-object checks passed; it does not replace behavioral acceptance.
5. With synthetic data and test roles, run adoption and sponsorship submit/retry, animal draft upload/publish/public media, proof uploads, internship attachment, group enquiry edit, manual receipt issue/void, refund/denial and worker recovery. Assert each mutation and audit commit or roll back together. Run `bun run test:acceptance:all` and the RLS matrix on the isolated local stack.
6. Take and verify a backup before any approved production migration. Capture catalog and migration ledger before/after. Apply only reviewed files in order with lock/statement timeouts and a monitored maintenance window as appropriate. Re-run checks and live content assertions before permitting new checkout or content writes.

## Current rehearsal evidence

- The initial Docker engine was unavailable, then became available later in this run. The first full-suite run picked up an older shared local stack and failed six existing RLS assertions. No production connection was used. Those three RLS files passed 48/48 when rerun on the dedicated stack below; the old-stack result is not a code regression or release proof.
- Disposable stack: `hkscda-audit-remediation-20260927`, unlinked, DB `127.0.0.1:57322`, API `127.0.0.1:57321`, seed disabled. Its workdir is under ignored `node_modules/.audit-remediation-rehearsal`, with a copied config and 143 migration files. Existing local stacks were left intact. A port collision on 56322 was resolved by using 573xx before migrations ran.
- Fresh install: `bunx supabase start --workdir node_modules/.audit-remediation-rehearsal --exclude realtime,storage-api,imgproxy,mailpit,studio,edge-runtime,logflare,vector,supavisor`, exit 0. All 143 migrations applied. `CHECK_RELEASE_SCHEMA_DATABASE_URL` pointed only at loopback 57322; `bun scripts/check-release-schema.ts` exit 0, 67 requirements, zero issues.
- Upgrade rehearsal: verified the same stack remained unlinked and on loopback 57322, then ran `bunx supabase db reset --workdir node_modules/.audit-remediation-rehearsal --local --no-seed --version 20260914164558`, exit 0. Its ledger was 109 entries ending at that version and `adoption_instruction_revisions` was absent. `bunx supabase migration up --workdir node_modules/.audit-remediation-rehearsal --local`, exit 0, applied 34 files; ledger became 143 entries ending at `20260926190000`, and the CMS revision table existed. The 67-object compatibility check again exited 0 with zero issues.
- With synthetic role fixtures and environment values read in process from this dedicated stack, `bun run test:rls` exited 0: 50 pass, zero fail. `bun test --isolate` exited 0: 2787 pass, 83 skip, zero fail across 468 files. The skipped tests and omitted services remain separate gates; no production migration was run.
- This proves the implemented checks on an empty fresh schema and a **synthetic** baseline-to-current upgrade. It does not prove a data-bearing production upgrade, all constraints/indexes, forbidden-role grants, storage policies, backfill counts, live content, provider sandbox behavior, or backup/restore timing. Those gates remain open.

## Deployment and rollback boundary

- Merge to `main` deploys automatically; require a specific release approval. Production DDL, public preview, checkout enablement and content publication are separate approvals.
- Prefer roll-forward repair once provider events or new financial data exist. A database restore from an older backup can erase post-backup payments and must not be used as a routine rollback.
- The current `f8d5e5d` application can display the approved public instructions seed when revision tables are missing, but the other new paths need the missing schema. No older application SHA has been verified against both the current production catalog and recent payment/audit behavior, so **rollbackTarget = unverified**. Pausing affected *new* submissions must leave existing webhook intake, durable event handling and reconciliation available.
- Preserve #130 atomic audit, signed proof intent, fingerprint/idempotency, body limits, suspended-user revalidation and commit-before-public media. Do not bypass those guards to regain compatibility.

## Owners and remaining gates

DB release owner: review exact SQL diffs, lock estimates, backfill, backup/restore and app compatibility; authorize production migration only after isolated rehearsal. Release owner: approve the tested app SHA and verify same-SHA CI, content smoke and rollback boundary. Finance owner: separately approve any payment method activation after sandbox evidence.
