# PR #149 sequential verification — 2026-09-30 (Hong Kong)

Tested checkout d574682109e0cff6ae36dc54f03244366bdb1e98 integrates #148 head 9ad54052a9622ed4a61838c76b68d11338680dd5. The DB regression now executes every update inside SET LOCAL ROLE service_role; fixture setup and cleanup remain local owner operations. No historical audit report was rewritten.

## Executed evidence

- CHECKOUT_POLICY_TEST_DATABASE_URL loopback 57322 and SUPABASE_LOCAL_URL loopback 52321: bun test --isolate --timeout 30000 exit 0; 2894 pass / 91 skip / 0 fail, 8882 assertions, 492 files, 49.27 seconds. Environment-gated skips are not passes.
- bun run typecheck exit 0; bun run lint exit 0 (52 warnings); bun run build exit 0 using loopback 54329 and placeholder keys. Build left routeTree unchanged.
- CRM_TEST_ALLOW_LOCAL_FIXTURES=1, CRM_TEST_DATABASE_URL loopback 52322/audit_pr135_20260929: bun test src/lib/crm/supporterVersion.database.test.ts exit 0, 3 pass / 13 assertions / 0 fail, 0.869 seconds, including actual service_role stale-write rejection and same-transaction audit rollback.
- Migration identity plus canonical LF checksum tests: 48 pass / 667 assertions, exit 0.
- bun scripts/verify-supporter-edit.mjs generated the synthetic bundle; node scripts/verify-supporter-edit.mjs exit 0 at 390x844: GET 4 / PATCH 2, staleConflict, dirtyGuard and switchIsolation all true. Real staff identity UAT not-run.
- Single migration rehearsal on the production-schema-only local clone: exit 0. Fifteen synthetic supporter rows in a rollback-only backfill rehearsal all receive version 1; exit 0, 15579 ms including Docker/psql process overhead. This is not a production lock-time prediction. No production data was copied into tests.

## Migration and release boundary

Source: 20260927110000_crm_supporter_edit_version.sql. Canonical LF SHA256 d9756e0cb41dd7878e6046a0eab3db4b1f9dfb8a39751884d1cfd2b8df1fa80c.

Adds a monotonic supporter edit_version, profile and role change triggers, and a seven-argument version-checked update RPC. RPC is SECURITY INVOKER with an empty search path, service_role-only EXECUTE, active admin/treasurer revalidation, row lock and audit in the same transaction. Existing roles and grants are retained. Profile/role writes by older application code also advance the token.

Live read-only preflight: ledger 87; 15 supporters; edit_version, new RPC and two helper functions absent. Both tables have RLS. service_role has supporter UPDATE, supporter_role INSERT/UPDATE/DELETE and audit INSERT. Profile hash excluding the new column: 7c56e718b5a514db6be008ac6bf4de36. Checkout remains false. Existing supporter audit and timestamp triggers remain. The legacy mutate_crm_supporter_with_audit is absent by pg_proc name as well as signature: creation remains a wider R01 dependency and is not claimed fixed by this update-only slice.

Restricted DPAPI CurrentUser backup from 2026-09-29T00:34:37Z remains the recovery artifact; full restore drill and storage object-byte backup are not-run. Rollback application code first and retain the additive column/triggers/RPC to avoid losing concurrency tokens. Do not reset the database or rewrite migration history. Formal production application and postflight will be appended only after execution. Payments, new email scheduling and notifications remain disabled.

## Predecessor observations

#147 main CI 36593182986 passed all five jobs. #148 head 9ad54052a9622ed4a61838c76b68d11338680dd5 passed all five jobs in CI 36594989175 and merged 2026-09-29T16:15:32Z as 10db7f36315f780eed743b3182a60f1c3ae9c177. Main CI 36596400446 is pending at this observation.

#148 exact CRM private export migration applied as live ledger version 20260929160535, ledger 86 to 87. Two tables have RLS; all nine RPCs pin public,pg_temp and deny anon/authenticated EXECUTE while granting service_role. Job rows and private artifacts both remain 0. Checkout remains false. CRON_SECRET is absent, so new export intake remains unavailable; existing status/download/cancel/cleanup remain accessible under their authorization checks.

Read-only Vercel team API confirmed Pro / active for the configured team. Official cron documentation permits a minimum one-minute interval on Pro, so the configured five-minute schedule is within entitlement. Function usage pricing still applies. No subscription or configuration was changed. Reference: https://vercel.com/docs/cron-jobs/usage-and-pricing (checked 2026-09-30 Hong Kong). Operational activation and real-identity export UAT remain not-run.
