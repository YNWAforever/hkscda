# PR #145 sequential preparation — 2026-09-29

Merged predecessor #144 ded566c into this slice (merge c494f93). Resolved documentation conflicts by retaining both task records; code merged without conflict. No production migration or content mutation was performed.

## Migration identity regression

After combining independently prepared slices, checkout_policy_gate and estate_versioned_commands both had source version 20260927120000. Added a version-uniqueness regression: exit 1, expected 148 distinct IDs but found 147. Renamed this undeployed estate file to the existing integration-candidate identity 20260927120500_estate_versioned_commands.sql; SQL bytes unchanged. Regression then exit 0. No live ledger entry was changed and no new SQL behavior was introduced by this rename. Updated script/runbook/manifest references.

Committed LF SQL SHA256: 733363d843f9d46d182305480c9e941ad4143d46a9fd36cf6da967ea0587882d.

## Executed verification

- `bun test --isolate`, CHECKOUT_POLICY_TEST_DATABASE_URL loopback 57322 and SUPABASE_LOCAL_URL loopback 52321: exit 0; 2868 pass, 83 skip, 0 fail, 8785 assertions across 485 files.
- `bun run typecheck`: exit 0.
- `bun run lint`: exit 0; 53 warnings and zero errors.
- `bun run build` with fixture 127.0.0.1:54329 and placeholder keys: exit 0; generated route tree unchanged.
- `node scripts/verify-estate-version.mjs` with ESTATE_TEST_ORIGIN=127.0.0.1:56543: exit 0. Synthetic 390x844 failed-create retry retains identity, two distinct creates, publication/edit/unpublish, dirty refetch conflict and HTTP 409. API intercepted; no real staff mutation. Refreshed conflict screenshot.
- Local integrated DB supabase_db_hkscda-audit-integration-573: BEGIN plus synthetic old row, exact DDL and scripts/test-estate-versioned-commands.sql, then ROLLBACK via psql ON_ERROR_STOP: exit 0. Retry/audit uniqueness, version changes, legacy writer, stale rejection, role guard and audit-failure rollback pass. This DB already had the additive version column, as the log reports.
- Separate schema-only production clone audit_pr135_20260929 in local fresh container: single DDL applied transactionally via psql -X -1 -v ON_ERROR_STOP=1, exit 0. RLS true, command EXECUTE denied anon/authenticated and allowed service_role. No production rows imported. Full functional rehearsal on this clone is not-run because the historical legacy RPC is absent.

## Release gates

Live read-only catalog confirms dog_friendly_estates exists but its version column, new command RPC and legacy mutate_admin_content_with_audit RPC are absent. New estate DDL alone does not solve all historical CMS dependencies; R01 remains open. Production lock/backfill time, full mixed-version rehearsal against a production-sized sanitized fixture and authenticated staff UAT remain not-run. A separate migration approval is required before this code can deploy; none has been requested or granted for #145 yet.

#134–#141 remain the eight merged releases; #141 main CI 36510299370 is now five-job SUCCESS. #144 ded566c CI 36510506914 is five-job SUCCESS. #142 aaf9bce is next and remains unmerged pending its separately presented migration approval. #145 requires fresh remote CI and all predecessors.

Rollback after new writes: revert application code and retain the additive version column/trigger/RPC so concurrency history is preserved. Do not drop the column or rewrite ledger history. No payment, email schedule, public content publication or refund activation is authorized by this preparation.
