# PR #146 sequential verification — 2026-09-29

Merged #145 prerequisite head 16c7603 into this worktree as 4e7d146; preserved both issue records and all prior permission repairs. A migration-identity regression failed (46 pass / 1 fail) because fee reorder and payment snapshots both used 20260927130000. Renamed the undeployed fee file to the existing integration identity 20260927130500; SQL unchanged. Regression then 47 pass / 0 fail, exit 0. No ledger rewrite. Exact LF SHA256: dd772676c88fda5614908ca1683637ab7922f04b1d5fe363995a7f689d9f9e23.

## Executed gates

- First full isolated run: 2873 pass / 83 skip / 2 fail, exit 1. Both tracked-source copy tests referenced the old migration filename because the rename was not yet staged. After staging the rename, full bun test --isolate: 2875 pass / 83 skip / 0 fail, 8815 assertions, 486 files, exit 0. CHECKOUT_POLICY_TEST_DATABASE_URL uses loopback 57322; SUPABASE_LOCAL_URL loopback 52321.
- bun run typecheck: exit 0.
- bun run lint: exit 0, 52 warnings and no errors.
- bun run build with loopback 54329 and placeholder keys: exit 0. Generated route tree unchanged.
- node scripts/verify-fee-reorder.mjs against synthetic 390x844 fixture on loopback 56544: exit 0. Injected 503 retained canonical order, double click sent one effective request, dirty conflict retained text, content-only save preserved order. Screenshot refreshed.
- Exact DDL applied to production-schema-only local clone audit_pr135_20260929 in supabase_db_hkscda-audit-integration-fresh: exit 0. No production data imported.
- supabase/tests/atomic_adoption_fee_reorder.sql with synthetic actor fixture and ROLLBACK: exit 0. Three injected update failures roll back both rows and audit; success writes one audit; stale/cross-species/nonadjacent/unknown/treasurer/disabled actors rejected; active staff succeeds; direct legacy writer bumps version.
- Same clone test with SET LOCAL ROLE service_role before the functional DO block: exit 0. Initial generated harness incorrectly reduced SQL dollar quoting and failed parsing; corrected harness rerun passed. Both RPCs deny anon/authenticated EXECUTE and allow service_role.
- python node_modules/pr146-concurrency.py --container supabase_db_hkscda-audit-integration-573: exit 0. Copy of committed rehearsal script restricted to this exact local container and SET ROLE service_role on both command connections. First success; second P4091 after 7.04 seconds waiting; one audit; original two sort positions retained; synthetic rows/audit cleaned.
- Rollback-only 14 synthetic row backfill on clone: exit 0, 568 ms including Docker/psql overhead. All 14 rows version 1. This is a local measurement, not a production lock-time prediction.

## Production preflight and rollback

Read-only catalog: adoption_fees has 14 rows and RLS enabled; version and both new RPCs absent; ledger 85; checkout false. Existing DPAPI backup ciphertext SHA256 C9A32C9303C00AE080C28187B2AD2E0D081211187DE3E2360ED508443BFF79B2 rechecked unchanged; full restore drill not-run. The reviewed migration adds one defaulted version column, trigger and two restricted audited RPCs. It changes no fee amount/order/publication values. Keep the additive schema if reverting code; do not drop versions after new writes. Legacy create still depends on the absent historical mutate_admin_content_with_audit RPC: broader R01 remediation remains open and is not claimed fixed by this slice.

Production migration not yet applied in this record; exact reviewed file above is prepared under the user's current approve-all instruction. Main merge remains conditional on current-head five-job CI and predecessor main CI. Real staff identity UAT not-run; no real payments, emails or refunds.
