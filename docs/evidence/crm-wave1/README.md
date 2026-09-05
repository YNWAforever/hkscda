# CRM Wave 1 evidence

## Result

- Focused CRM suite: **61 passed, 0 failed, 176 assertions**.
- TypeScript: `bun run typecheck` exited 0.
- Provider acceptance regression: resolved provider rejection is persisted as `failed`; no `sent` transition occurs.
- Identity regression: public submissions resolve through `resolve_public_supporter_identity`; service tests prove canonical upsert paths are no longer called and opt-ins are retained as pending intents rather than active consent rows.

Raw output: `focused-output.txt`.

## Commands

```powershell
bun test src/lib/supporters/publicIdentity.server.test.ts src/lib/donations/service.test.ts src/lib/donations/supabase.server.test.ts src/lib/donations/notifications.server.test.ts src/lib/donations/reconcile.server.test.ts src/lib/donations/reconcile.lifecycle.test.ts src/lib/notifications/provider.server.test.ts src/lib/volunteers/service.test.ts src/lib/volunteers/repository.server.test.ts src/lib/volunteers/notifications.server.test.ts docs/evidence/crm-baseline/email-safety.test.ts
bun run typecheck
```

The SQL contract test is intentionally guarded and was not run because the local Supabase Docker stack was unavailable:

```powershell
psql $env:TEST_DATABASE_URL -v crm_test_target=local -f supabase/tests/crm_public_identity.sql
```

The script refuses to run unless `crm_test_target=local`. It wraps fixtures in a transaction and rolls back. It asserts preservation of canonical fields and `deleted_at`, sequential replay convergence, and rejection of null language/source. Actual concurrency is covered by `supabase/tests/crm_public_identity_concurrency.ps1`; it accepts only a localhost database URL and was not run because Docker was unavailable.

## Before evidence

The original isolated baseline probes produced **0 passed, 3 failed, 6 assertions**. `docs/evidence/crm-baseline/raw-output.txt` records the exact overwrite/deleted-row and false-sent behavior before implementation.

The volunteer message unique-index migration performs a count-only duplicate preflight and fails closed. Any historical duplicates require separately authorized remediation; this migration deletes none.

## Actual disposable identity and RLS acceptance (2026-09-06)

After the CMS agent handed off the dedicated local stack, ran only database55322/API55321 for project `hkscda-completion-20260905`. No production resource or external message provider used. Local API/database addresses were checked against the exact startup JSON values. Anon/service credentials were read into memory from the ignored local startup log, passed only to an allowlisted child environment, and redacted from captured output before storage. Bun ran with `--no-env-file`.

`src/lib/supporters/publicIdentity.database.test.ts`: **4 pass, 0 fail, 17 assertions, 361ms**. Host psql is unavailable, so the new explicitly guarded Bun harness executes the existing `supabase/tests/crm_public_identity.sql` DO acceptance block inside a rolled-back transaction. It also exercises two actual concurrent first claims (same normalized email, one created/one existing, identical supporter ID and unmixed winning canonical fields), actual donation and volunteer contact snapshots with both consent intents, preserved canonical/deleted fields and existing opt-out, and untrusted-role function/table grants. Two simultaneous pool queries exercise the invariant from the existing psql concurrency script; that PowerShell script itself was not run.

`supabase/rls-tests/moneyPii.rls.test.ts`: **38 pass, 0 fail, 66 assertions, 2.37s** against actual local Auth/PostgREST. Created four synthetic Auth users and exercised anonymous/no-admin-row/staff/treasurer/admin/service role behavior for admin_user, supporter, donation, payment, receipt, consent and recurring_mandate. This closes the prior local RLS execution gap; it does not claim deployed schema parity.

Full logs: `identity-database-first-run.txt`, `rls-local-first-run.txt`. Read-only cleanup check afterward: 0 synthetic RLS auth users, 0 synthetic RLS admin rows, 0 RLS supporters, 0 identity supporters, 0 identity activities, 0 idle transactions. No migration change was needed. Database/API handed to the CMS agent before any subsequent CMS browser fixture setup.
