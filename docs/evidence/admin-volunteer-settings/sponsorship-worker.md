# Sponsorship outbox worker

Vercel runs `GET /api/jobs/sponsorships` at minute 30 every hour. The existing timing-safe `CRON_SECRET` bearer guard runs before any database/provider initialization. Configure `SPONSORSHIP_JOB_ACTOR_ID` as an active authorized admin user auth UUID. Without an actor the response reports disabled. Without the configured email provider key the worker reports queued and does not claim messages.

A manual authorized HTTP request to that endpoint runs the same worker. It claims at most ten leased jobs, uses a stable per-outbox provider idempotency key, and fences completion against the current unexpired lease. Provider acceptance is recorded as sent/provider_accepted, never delivered. Failed attempts remain visible for retry. No live provider was invoked in verification; unit tests use an injected provider sink.

Local finance browser verification: `SPONSORSHIP_TEST_ALLOW_LOCAL_FIXTURES=1 node scripts/verify-sponsorship-finance.mjs` against the dedicated 56321 API and 56330 app only. The script uses synthetic confirmed local accounts without sending mail. Credentials remain in ignored `.local-policy-test/browser/finance-auth.json`; committed evidence contains no tokens.
