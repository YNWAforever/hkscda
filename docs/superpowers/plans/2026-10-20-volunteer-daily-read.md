# Volunteer daily read continuation

Scope authorized on 2026-10-20: the existing staff read journey, offline generated data and mock transport only. P0-ID stays paused; DB repair, catalog, DB fixtures, migrations, notifications, cloud queries and release actions stay outside this work.

Baseline: original `volunteer-admin-20261013` worktree, branch `codex/volunteer-admin-20261013`, HEAD `843adac61285d92c2e1056715d6601ed83fedb12`; tracked/untracked checkout clean at intake. Existing ignored DB evidence is preserved.

References: the 2026-10-13 implementation master plan and its reliability/UI plans, plus `2026-10-16-volunteer-daily-work.md` and its approved design. Their historic status/check boxes are not new execution evidence.

## Bounded implementation

1. Regress the real return-state helpers, component outcomes, Hong Kong midnight and real server role checks with only the transport/data boundaries replaced.
2. Reproduce the highest-impact gap before changing production: a loading/failed/missing registration loses its existing safe return control. Reuse that exact internal destination and query contract in every detail state.
   The same read-recovery checks must distinguish unknown counts from zero: initial pending and a retained empty previous scope get an unknown heading/loading state, without clearing nonempty previous data or changing queries.
3. Exercise the existing workspace → template/activity-status filters → list page 2 → roster page 2 → registration → return/reload with real components and router, at 1440px/390px and zh/en for mock admin/staff.
4. Verify the final source with affected tests, project typecheck, valid targeted lint and a credential-free offline application build. Review the staged diff and make one local commit only after the gates pass.

The existing activity template/status filters remain activity filters; each roster row shows its registration status. No new registration-status query contract, eligibility/capacity rule, route-loader architecture or mutation is introduced.

## Interfaces and rulings

- The return helpers already allowlist internal activities/calendar/tasks destinations and drop private search input. Keep the single URL writer and independent activity/roster page numbers.
- The component tests use existing query-state render doubles; the browser fixture uses real Query/Router/components and permits only schema-validated read commands at a fixed endpoint. This is mock UI/contract evidence, not real Auth, RLS or staff UAT.
- User instruction to run only affected tests overrides generic skill/full-suite advice. Closed PostgreSQL budgets and historic skips are not reopened.
- Run checks serially with platform-only child environments, no dotenv, no provider credentials; use a conservative 6 GiB start headroom and retain resource failures without lowering it.
- Native Windows sandbox denied CIM and later prevented a test CLI reading its working directory. Use the approved normal desktop boundary for these local read/check/browser processes, with unchanged controlled environment; preserve the failed attempts.
- Build safety: the installed Lovable wrapper calls `loadEnv` itself, so `envDir:false` alone is insufficient for a full app build. Build exact current tracked/source inputs in a local credential-free mirror, with existing dependencies, no env/credential files, no network and no deployment.
- The user's explicit retention requirement overrides skill cleanup advice: do not delete the local workspace, raw RED/GREEN evidence or previous task artifacts.

## Acceptance and evidence limits

The three regression groups are: safe same-day filter/return round trip; loading/empty/error/missing/invisible detail recovery (including false-zero/empty presentation while a current list is pending); admin/staff/denied role and Hong Kong boundary contracts with zero business/notification effects.

Screenshots and test receipts identify the source fingerprints and mock fixture. 390px is a simulated viewport, not a physical phone. Production DB-dependent journeys stay BLOCKED; production/Preview/Auth/RLS/UAT, P0-ID and T08/F05/UC41 performance remain separate.
