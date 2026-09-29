# PR #147 sequential verification — 2026-09-29

Integrated prerequisite #146 587a691 as merge 125b7a2. The only conflict was the isolated fixture port; retained #147 loopback 56545. No new schema for this slice.

## Reproduced and repaired defect

Changing filters while an export request was in flight could leave the late old-filter error visible with a retry button that could not run. Extended scripts/verify-export-bar.mjs with a delayed 403, changed Bob to Charlie during the request, and required the old error to disappear. Before fix: browser exit 1, timeout at line 66. Minimal fix makes the existing stale-error cleanup run when export state changes as well as filter changes. After fix: browser exit 0. Original same-filter retry, pending guard, 413 row count, authorized complete download and 403 cases also passed. API and token are synthetic; viewport 390x844, loopback 56545.

## Current integrated gates

- bun test --isolate: exit 0; 2880 pass, 83 skip, 0 fail; 8830 assertions, 487 files. CHECKOUT_POLICY_TEST_DATABASE_URL loopback 57322 and SUPABASE_LOCAL_URL loopback 52321.
- bun run typecheck: exit 0.
- bun run lint: exit 0, 52 warnings and zero errors.
- bun run build: exit 0 with loopback 54329 and placeholder keys; generated route tree unchanged.
- node scripts/verify-export-bar.mjs: red exit 1, green exit 0. No real supporter export or production mutation.

## Predecessor execution observations

#144 main CI 36588856862 passed all five gates. #145 pre-merge CI 36588374583 passed all five gates at 16c76034c41fa0e1b6ff21fd0a80ace9e6e92964, then merged as 591b8aae10a22d31aa94f08eb3c0652ccf53b19b. Deployment dpl_HL6TezHJ7QeS4TKJSyVGmAtgr14i READY; main CI 36590275015 still running at this observation.

#146 migration applied as live 20260929152453, ledger 85 to 86. Exact LF SHA256 dd772676c88fda5614908ca1683637ab7922f04b1d5fe363995a7f689d9f9e23. Fourteen fee rows all version 1; full pre/post content hash excluding the new column identical (710af13e6ed6f99eada4371cc667b1ae). RLS true, both RPCs deny anon/authenticated and allow service_role. Checkout remains false. No amount, order, publication or timestamp changed. #146 app still awaits its sequential merge gates.

Rollback #147 by reverting application changes; retain earlier additive schema and concurrency histories. Real staff role UAT and real-data export not-run. Background export remains the separate #148 slice. Payment and new email scheduler activation remain disabled.
