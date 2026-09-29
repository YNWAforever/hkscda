# PR #152 sequential verification — 2026-09-30 (Hong Kong)

Integrated checkout 2a9efb1768edde80909b989a1fedfe78b539296f includes #151 repaired head b3dce0f883062fd66d4050104975e2d7d66ccfa5. The tracker conflict retains the newest predecessor rows plus ADMIN-04. No SQL migration or production mutation in this slice.

## Reproduced fixes

1. After applying group 0, a server response could mark group 1 conflicted; the client still attempted group 1. New regression failed with calls [0,1] instead of [0]. The sequence now revalidates current pending groups before every apply. Focused result: 6 pass / 22 assertions / exit 0; transport uncertainty refresh, partial failure and no replay of applied groups remain covered.
2. A failed manual group retained its review checkbox and enabled immediate retry. Actual Chromium regression failed (exit 1). Apply, sequence and status-refresh now clear both per-group and whole-operation review on settlement, including errors. Three-width browser rerun passed; failure sends one apply for group 0 and requires review again before retry.

## Executed checks

- Focused review/service/notification sink: 12 pass / 42 assertions / 0 fail, exit 0. Default bulk follow-up never calls an email provider.
- bun test --isolate --timeout 30000: exit 0, 2863 pass / 150 skip / 0 fail, 8799 assertions, 496 files, 24.09 seconds. Loopback API 52321 unavailable; DB URL not set because Docker/WSL startup is blocked. Skips are not passes.
- bun run typecheck exit 0; bun run lint exit 0 (52 warnings); bun run build exit 0 with synthetic keys and loopback 54329. Generated route tree unchanged.
- node scripts/verify-volunteer-bulk.mjs against loopback 56549: exit 0; actual workspace 390/768/1366, 200% CSS zoom at 768, no page errors or horizontal overflow, eight-week control, explicit review gate, partial failure and no automatic replay. Server stopped afterward. New screenshots t17-bulk-sequential-* preserve the historical images.
- Production read-only catalog confirms volunteer_bulk_command(uuid,jsonb), anon/authenticated EXECUTE denied, service_role allowed, and operation event/outbox tables with RLS. The initial pg_class name query also returned indexes; their RLS=false flags are not table findings. No production bulk command was invoked.

## Required remote DB gate

Added a mandatory step in the existing rls-matrix job to execute bulk.database.test.ts and mandatoryScenarios.database.test.ts against the job's disposable Supabase 55322 stack. Test guards continue allowing dedicated local 56322; 55322 is accepted only with CI=true and the existing explicit fixture opt-in. No remote database address is accepted. These scenarios cover immutable snapshots, four-week generation, stale and double apply, audit rollback, role downgrade, capacity 10/concurrent eleventh, cancellation/attendance and 104 cross-shelter daily-quota groups. Current-head execution is pending; this PR will not merge unless that step and all five CI jobs pass.

Rollback application code only. No provider call, production mutation, real staff identity or published activity was exercised. Cross-module ADMIN-04 work remains in later PRs. Real role UAT, 1000-selection exercise, approved operational schedules and notification activation remain not-run/external.

## Predecessor evidence

#149 main CI 36598019572 and #150 PR CI 36598202959 both passed five jobs and all steps. #150 merged 2026-09-29T16:40:00Z as be4fcb642750e5a45839ce90ead6af1747a821f2; deployment dpl_DvKS3nfmUfgj3NexecPS2ZmcC4RK READY. #150 main CI 36599383783 and #151 PR CI 36599174781 pending at this observation.
