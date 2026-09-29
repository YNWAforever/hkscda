# PR #148 sequential verification — 2026-09-29

Predecessor #147 34cff531 was integrated as b8fe9a2. Migration/runbook conflicts retain both slices; the route tree was regenerated from the combined routes and then by the actual build. No historical audit report was rewritten.

## Fixes reproduced during preparation

Background job creation returned 201 and wrote a job even when its worker was unavailable. New direct API regression failed (2 pass / 1 fail), then passed (3 pass / 0 fail) after a default-off injected availability gate. The production route only permits new jobs when CRON_SECRET is configured. Status, download, cancel and cleanup remain independent. Vercel production environment-name listing exit 0 confirms CRON_SECRET absent; no value was read or changed. New jobs therefore return 503 before any RPC. No payment/email worker was enabled.

The payment-instructions DB test also assumed existing shared fixture details were incomplete. A focused rerun failed expecting SQLSTATE 23514 after valid sandbox details already existed. The test now explicitly sets invalid details before that negative assertion and restores the original row in its existing cleanup. Focused two-file rerun: 2 pass / 0 fail, 21 assertions, 2.46 seconds. No assertion was removed.

## Executed current gates

- bun test --isolate initial integrated run: exit 1, 2886 pass / 86 skip / 2 DB timeout failures at the default 5 seconds.
- After fixture correction, another default-timeout run: exit 1, 2842 pass / 127 skip / 3 failures. Local Auth logged HTTP 504 context deadline exceeded during synthetic role creation; a later isolated RLS rerun passed 5/5, exit 0.
- bun test --isolate --timeout 30000 with CHECKOUT_POLICY_TEST_DATABASE_URL loopback 57322 and SUPABASE_LOCAL_URL loopback 52321: exit 0; 2888 pass / 86 skip / 0 fail, 8872 assertions, 490 files, 47.68 seconds. Skips remain environment-gated and are not passes.
- bun run typecheck: exit 0 before build; final generated-route typecheck recorded separately below.
- bun run lint: initial 11 formatting errors, corrected with Prettier on named files; rerun exit 0, 52 warnings and no errors.
- bun run build with loopback 54329 and placeholder keys: exit 0. Actual build regenerated the SSR Register declaration; the generated file is included.
- node scripts/verify-export-bar.mjs and node scripts/verify-background-export.mjs on synthetic loopback 56546 at 390x844: both exit 0. Immediate 413/403/retry/in-flight filter race; background creation/reload/progress/download/cancel/revocation pass. No real export or production role identity used.

## Exact migration and isolated DB evidence

Source 20260927090000_crm_private_export_jobs.sql, committed LF SHA256 6665fcf0ef6ec9d783bca79ad7cd9769110a8a5c9a04f15c3a7a8463d4ade162. Applied as a single transaction only to local audit_pr135_20260929 in supabase_db_hkscda-audit-integration-fresh; exit 0. This is the production-schema-only clone with synthetic data, not a production data copy.

CRM_TEST_ALLOW_LOCAL_FIXTURES=1 CRM_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:52322/audit_pr135_20260929 bun test src/lib/crm/exportJobs.database.test.ts: exit 0, 3 pass / 0 fail, 145 assertions, 3.09 seconds. Includes 5001 supporters and 5001 donations without truncation, frozen IDs, revoked-role/other-actor denial, expiry, audit, RLS/grants, two-connection claim exclusivity and cancellation fencing. Synthetic rows rolled back/cleaned by exact IDs.

scripts/test-crm-export-service-role.sql via local psql ON_ERROR_STOP: exit 0. Actual SET LOCAL ROLE service_role exercises enqueue, claim, page, append, actor-bound download, wrong actor denial, cancel and cleanup; all synthetic changes rolled back.

Live read-only preflight: ledger 86; job/artifact/helper and nine public commands absent; existing private.crm_matching_supporters(jsonb), private.crm_supporter_summary(uuid), receipt/supporter/donation/admin/audit dependencies present. Checkout false. Existing restricted DPAPI backup is the recovery artifact; no full restore drill claimed. The migration creates two RLS-protected tables and restricted RPCs, contains no production row backfill or job creation, and changes no existing payment or notification flow. Production application is not yet executed in this record.

Rollback: stop new job intake, preserve private job/artifact schema while rows remain, keep expiry/download denial and an approved cleanup path. Do not drop artifacts with active jobs. CRON_SECRET remains absent; setting this shared secret would also affect other job routes and requires the existing operational approvals. The project already deploys hourly schedules; direct subscription-tier verification and real-identity UAT are not-run. No paid plan or provider configuration was changed.

## Predecessor release evidence

#146 merged 87e4aa1acfab082bba1a6c97260d74ca5ebd96b5 after pre-merge CI 36589857892 and preceding #145 main CI 36590275015 passed all five jobs. Deployment dpl_6Prp3GNMebKtXpX17ZvYvxjrEjwq READY; #146 main CI 36591612497 passed all five jobs.

#147 merged 82c9247f28b4d1dcbd73261c33f2233143540340 after corrected-head CI 36591039290 passed all five jobs. Deployment dpl_Bdn13mgYgVNsCVjWqLyML73RM4ta READY; main CI 36593182986 pending at this observation.

Final generated-route bun run typecheck: exit 0. A checksum regression then detected two stale manifest entries (CRM exports and donation recovery); red exit 1, corrected only the metadata to canonical LF Git SQL bytes. SQL and live ledger are unchanged. The donation hash now matches its earlier applied proof, 7368ea1052220be96c71b26f9003f26e259ea51a69f83dca031a79152d8913d3. Older narrative source hashes are historical observations superseded by this exact-source record.
Checksum regression green: bun test src/lib/operations/migrationManifest.test.ts exit 0 (1 pass); targeted ESLint exit 0. Full suite count above precedes this metadata-only regression addition.
