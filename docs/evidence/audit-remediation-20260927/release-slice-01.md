# Review slice 01: compatibility diagnostics and public submission safety

**Status:** reviewable code and isolated rehearsal; **not deployable**. The PR is draft. Production remains at `f8d5e5d`; no migration, checkout enablement, content change or notification was sent.

## Delivered

- T00 baseline/production alias/CI and handoff integrity recorded; original dirty checkout preserved.
- T01 read-only 67-object catalog checker, ordered 34-file migration manifest, runbook, fresh install and baseline-to-current disposable upgrade rehearsal. Both catalog checks and isolated RLS matrix passed. It does not yet inspect every constraint/index/storage policy or prove a data-bearing upgrade.
- T02 original adoption read error retained as `cause`; #133 fallback stays limited to revision-table PGRST205/42P01; unsafe loader log payloads removed; public submissions reject missing production challenge/limiter and return 503 on limiter infrastructure failure. Existing signed webhooks and status reads keep their own limits and handling.
- Synthetic browser regression evidence: brand 26 routes/5 viewports, a11y 26 routes/desktop, performance 4 routes/2 viewports/three cold runs all exited 0. Before/after screenshots and median scores are in this directory; this slice did not intend a visible UI change.

## Remaining before any release

1. Complete T01 dependency inventory: constraints, indexes, forbidden role grants, storage policies, valid CMS seed and data-bearing migration rehearsal with backup/restore timing.
2. Complete T02 readiness endpoint and content synthetic, correct unavailable SSR status/cache behavior, alert deduplication and recovery signal. Confirm live production abuse-control config exists before this fail-closed code is considered for deployment.
3. Implement and review T03–T24 in subsequent independent PRs, including server checkout admission, unified instructions, payment/receipt recovery, staff data-safety fixes, public journeys, bulk, performance and supporter portal.
4. Obtain finance-approved payment methods/terms, provider sandbox credentials, test identities by role, production migration/release approvals and live UAT windows. No such authorization is inferred from this PR.

## Staff handoff for this slice

- Read `tracker.csv` by issue ID and treat `code_complete`, `schema_ready`, `deployed` and `operationally_enabled` as separate states. Only OPS-01 is historically verified fixed; R01, R02 and SEC-01 remain partial.
- Review `migration-manifest.csv` in order, then run the runbook on a disposable clone. The compatibility script accepts only an explicit PostgreSQL URL and performs SELECTs; use a read-only role and verify the host before running.
- If public submissions return 503 after a future approved deploy, check Turnstile site/secret pair and Upstash URL/token pair first, then readiness and server logs. Do not bypass verification to restore form availability. Existing payment webhooks and reconciliation must remain available.
- Keep the current production alias as a reference, not an automatic rollback target. A database restore can erase later payments; use the runbook's roll-forward and reconciliation boundary.
