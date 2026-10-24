# Volunteer selective-stat retry continuation

**Goal:** Close the successful-read timer regression gap and complete the originally requested retry of failed statistics only.

**Base:** `d56447c1af038641e64d3ad9441db1d7db4ec9ed`; retain the existing feature branch and all evidence.

**Design:** Keep the normal full overview request and refresh interval. Add a strict allowlisted `stats` query parameter to the same authorized read endpoint; partial requests read only those count sources and omit unrelated coverage/health work. The retry button derives failed keys from null counts, uses a cancellable query, and merges only requested fields into the unchanged source snapshot. A newer full refresh, date change or cleared identity cache wins over an older retry response. No schema, permission or execution-path changes.

- [x] Add a successful optional-read cleanup test; remove clearTimeout as a temporary mutation, observe failure, restore it and observe success.
- [x] Add API/read-boundary regressions for selected sources, invalid fields and denied users; observe baseline failure.
- [x] Add real-component browser evidence that retry requests only failed statistics and preserves successful cards; observe baseline failure.
- [x] Implement the parameter, selected reads and race-safe cache update; test failures and recovery.
- [x] Run related tests, lint, typecheck/build and appropriate regression; retain commit, fingerprints and read-only review.

## Original requirement reconciliation

The pasted request's Step 3.2 explicitly requires failed-stat-only retry; this is required work, not a later recommendation. Caching/materialized views are conditional recommendations only.

Step 3.3 also explicitly requests an admin-only confirmed, audited job retry. The existing notification-outbox retry endpoint does not rerun the hourly worker. Hourly execution currently enters only through CRON_SECRET and performs generation, release, promotion, assessment and notification work. There is no existing atomic admin retry/audit command for this worker. Adding a real execution path or schema/security contract remains outside the current continuation constraints; prepare the exact bounded decision separately rather than wire a misleading button or weaken cron authorization.

No GitHub access retries, push/PR, production DB/Auth, SQL, external sends or unidentified preview deployment. The one protected preview grant remains unused. Hosted root cause remains unproven.

Verified local delivery: 7,294 pass, 727 skip, 0 fail (8,021 tests in 840 files); typecheck, changed-file lint (zero warnings) and fixture build pass. Review findings for structurally equal newer refreshes and settlement-time error attribution were reproduced and fixed; activity-deadline and identity-cancellation coverage is present. All earlier timer/test gaps are closed. Hosted acceptance remains unverified; hourly rerun still needs the bounded audited execution contract.
