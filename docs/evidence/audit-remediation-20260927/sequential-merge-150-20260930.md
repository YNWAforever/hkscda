# PR #150 sequential verification — 2026-09-30 (Hong Kong)

Checkout 1d1ded252d3e3fe50aeceef40ace96e936bc772b integrates #149 d2d880b987be0896b7e5a81c911ba5f1c0d5a2d9. The export conflict preserves #147 immediate retry/error behavior, #148 background jobs and #150 pending-query disabling. Tracker conflicts preserve all predecessors plus ADMIN-03.

## Reproduced and repaired

- Existing export view ignored the list busy prop after integration. New regression: 7 pass / 1 fail, expected all four immediate/retry/background-create buttons disabled but found zero. After wiring busy through the view and guarding both intake handlers: 8 pass / 0 fail / 19 assertions, exit 0. Existing background download/cancel remain usable for their frozen snapshots.
- Browser storage denial caused list hydration to throw and prevent any request. A real Chromium Storage.getItem SecurityError reproduction timed out waiting for synthetic results, exit 1. Minimal optional persistence try/catch now keeps query state in memory; unavailable-storage browser regression passes, including setItem quota failure.

## Executed checks

- bun test --isolate --timeout 30000 with loopback DB 57322/API 52321: exit 1, 2842 pass / 147 skip / 3 fail. All three failures are ERR_POSTGRES_CONNECTION_CLOSED. Docker daemon subsequently reported unable to start; backend log identifies WSL distro listing timeout. No database reset, volume deletion or unrelated service shutdown was performed.
- Explicit non-DB run with CHECKOUT_POLICY_TEST_DATABASE_URL unset: bun test --isolate --timeout 30000 exit 0; 2842 pass / 150 skip / 0 fail, 8746 assertions, 492 files, 21.77 seconds. These skips do not satisfy DB/RLS gates; current-head remote isolated DB/RLS CI is required before merging.
- bun run typecheck exit 0; bun run lint exit 0 (52 warnings); bun run build exit 0 with loopback 54329 and synthetic keys. Generated route tree unchanged.
- bun scripts/verify-admin-list-query.mjs then node scripts/verify-admin-list-query.mjs: exit 0; 390x844 synthetic fixture; 12 requests across rapid typing, Chinese IME, cancelled slow response, URL back/forward, private query storage, error vs empty and selection scope. No horizontal overflow. Storage-denied page also passes.
- node scripts/verify-export-bar.mjs and node scripts/verify-background-export.mjs with EXPORT_TEST_ORIGIN=http://127.0.0.1:56547: both exit 0; 413/403, retry snapshot, double-click guard, in-flight filter change, create/resume/progress/download/cancel/revocation. Synthetic loopback fixture server stopped afterward.

No migration in this slice. Revert application code to rollback. Real staff identity UAT and same-environment production performance measurements remain not-run. Payments, email scheduling and operational background export intake remain disabled as previously recorded.

## #149 migration and release evidence

Automatic approval review initially rejected #149 production migration because existing approval did not explicitly cover the triggers/RPC. User then explicitly approved this single migration. Exact SQL d9756e0cb41dd7878e6046a0eab3db4b1f9dfb8a39751884d1cfd2b8df1fa80c applied as live ledger 20260929162248 (ledger 87 to 88).

Postflight: 15 supporters, all edit_version 1; both RLS flags true; existing audit/timestamp triggers retained alongside two new version triggers; RPC SECURITY INVOKER, empty search path, anon/authenticated EXECUTE false and service_role true. Existing profile fields unchanged: md5(jsonb_agg(to_jsonb(s)-'edit_version' order by id)::text) equals preflight 7c56e718b5a514db6be008ac6bf4de36. An initial read-only postflight used an incorrect checkout column and failed; corrected query confirms checkout false. Another checksum used concatenation rather than the preflight array serialization; the identical ordered-array algorithm above confirms equality. No production test write was performed.

#148 main CI 36596400446 passed all five jobs and all steps; deployment dpl_4ZxBjt5wbKKstRKcpw8zQoTUWAY6 READY for 10db7f36315f780eed743b3182a60f1c3ae9c177. #149 head passed all five jobs in 36596743299 and merged 2026-09-29T16:28:50Z as 020e03eeb1b7a54cce908babc5ec3bd271d370a5. Its post-merge CI and deployment are pending at this observation.
