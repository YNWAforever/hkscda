# T23 manual finance settlement prerequisite

Status: **code complete, schema ready on isolated DB, not deployed, not operationally enabled**. This slice repairs a reproducible duplicate-reference defect in the manual FPS/PayMe path before any reconciliation-file workflow. It does not import bank files, enable a payment method, issue a refund, or change provider webhook settlement.

## Defect and change

On the pre-migration isolated schema, two synthetic successful FPS payments accepted the same bank reference after trim/case normalization. The failing test expected PostgreSQL `23505` and received no error. The new partial unique index reserves a nonblank normalized reference across succeeded `fps`, `payme`, and `manual` payments, including concurrent writers. A service-role-only RPC checks the current active, confirmed, non-banned treasurer/admin, locks the payment and donation, verifies pending state, HKD and matching amount, and commits both statuses and `payment.mark_received` audit in one transaction. A receipt or email failure after commit is shown as an outstanding delivery task and cannot turn the payment back to pending.

## Isolated evidence

- Red test: `MANUAL_FINANCE_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:57322/postgres MANUAL_FINANCE_TEST_ALLOW_LOCAL_FIXTURES=1 bun test --isolate src/lib/donations/manualAtomic.database.test.ts`: exit 1 before the migration, duplicate reference was accepted.
- The exact migration file completed `BEGIN`/`ROLLBACK` rehearsal and was manually applied only on the named unlinked loopback DB. The local migration ledger was not changed.
- Green dedicated DB test: same command, exit 0, 2 pass, 11 assertions. Checked duplicate reference, amount mismatch, repeat/state conflict, revoked actor, forbidden EXECUTE, and audit-trigger failure rolling payment/donation back.
- Focused service tests: `bun test --isolate src/lib/donations/reconcile.lifecycle.test.ts src/lib/donations/reconcile.server.test.ts`: exit 0, 43 pass, 151 assertions; includes post-commit receipt/email failure and conflict/role response mapping.
- `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run build`: exit 0; lint reported 52 existing warnings and zero errors. `SUPABASE_LOCAL_URL=http://127.0.0.1:57321 bun test --isolate`: exit 0, 2877 pass, 105 skip, zero fail, 8955 assertions in 517 files. `CHECK_RELEASE_SCHEMA_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:57322/postgres bun scripts/check-release-schema.ts`: exit 0, 115 compatible requirements. Local security advisor with `sslmode=disable`: exit 0, zero error-level findings. The first advisor attempt without `sslmode=disable` exited 1 because the isolated server does not support TLS.

These results are from synthetic fixtures and a local schema. Simultaneous separate-connection settlement, a sanitized data-bearing upgrade, provider sandbox, email test sink, hosted role UAT and production behavior remain **not-run**.

## Deployment preflight and rollback

Before applying this file to a data-bearing clone or production, list historical succeeded manual payments grouped by `lower(btrim(bank_reference))` with count greater than one. Any row must be investigated and resolved by an approved finance owner; do not silently deduplicate or force the index. Capture the current catalog, exact function signature/grants, index definition, dependent views/functions, lock plan, backup and restore timing. Rehearse the complete ordered manifest on a fresh DB and sanitized clone, then run direct role/API checks and the reference conflict fixture. The migration is additive but index creation may lock `payment` and fail on historical duplicates.

Promote schema before the app route. Keep the existing webhook and reconciliation workers active. On app rollback, retain the unique index and atomic RPC until a compatible older app is demonstrated; dropping the index could admit a second credit. A database restore over newer payment/audit facts is not an acceptable routine rollback. Production migration and payment activation require separate approval.
