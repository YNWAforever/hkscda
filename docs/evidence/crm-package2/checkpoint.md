# CRM package 2 checkpoint (2026-09-06)

Scope: isolated completion-20260905 checkout; no commit, push, applied migration, provider send, or production mutation.

- Added persisted delivery status/claim/complete/fail repository, unique lease-owner fencing and atomic audited staff retry.
- Delivery handler reuses existing receipt allocator and acknowledgement idempotency; queued delivery is recoverable, already accepted `skipped` replay completes without sending again, and persisted permanent provider failures require staff attention.
- Manual-gift RPC atomically reserves request ID, compares canonical JSON digest, checks active treasurer/admin, resolves supporter/contact snapshot, appends supplied consent, ensures donor role, creates donation/payment/audit and eligible outbox job. Deleted supporters remain deleted and are rejected for new gifts.
- Existing browser/service requestId contract preserved. Root owns controller/composition/dialog and retry route. Independent review identified dialog onSuccess discarded result, making outcome unreachable; reported to root for correction.
- Fixed volunteer notification dependency annotation (the existing narrow logger type had not been attached to destructured arguments). Runtime unchanged.

Verification:
- CRM + delivery + provider + donation/volunteer notification suite: 83 pass, 9 explicit DB skips, 0 fail (before adding two repository contract tests).
- Latest changed repository/schema/delivery/volunteer notification selection: 42 pass, 0 fail.
- Initial CRM-focused selection reproduced 2 failed validation tests from missing requestId fixtures; both pass after fixture correction.
- Local real SQL suite uses only explicitly supplied CRM_TEST_DATABASE_URL with localhost/127.0.0.1/[::1] host, never ambient DATABASE_URL. No URL available: 0 pass, 9 skips including hooks. These are unexecuted acceptance tests, not transaction proof.
- Transaction suite covers concurrent duplicate commands, payload conflict, contact snapshots, pending gifts, competing/expired leases, forced payment/audit failure rollback and function privileges.

Outstanding gates:
- Apply allocated 20260905155357_crm_manual_gift_delivery_jobs.sql to an authorized disposable local database and execute real SQL suite. SQL compilation, grants and transactional/concurrency behavior remain unverified until that succeeds.
- Root review of SQL and integration, final typecheck/lint result and browser test of dialog outcome.
- Durable retry discovery after page refresh needs delivery metadata in supporter history (coordinate with CRM package 4 and root UI).
- Crash-after-PDF replay relies on the established receipt allocator; retain/add explicit end-to-end fixture proof before release acceptance.

Docs consulted: https://supabase.com/docs/guides/database/functions (function grants/search_path). Changelog markdown fetch was rejected by the browsing tool content-type handler; no change-sensitive library API introduced.

Follow-up: root browser fixture verified dialog outcome/retry reachability and stable request ID (see browser/result.json). Persisted donation history now carries delivery job metadata and root retry UI. Handler uses the existing succeeded-status guard before delivery (refund-before-retry regression red1 then green). The actual receipt pipeline is exercised with fake DB/storage: a crash after PDF upload retries the same object path and sends one acknowledgement only after receipt-path persistence succeeds. Delivery tests14pass. These are local adapter tests, not real DB/storage/provider evidence. Loopback tests now require CRM_TEST_ALLOW_LOCAL_FIXTURES=1 and validated explicit postgres credentials/port/database, no query/hash/routing overrides; final cumulative DB suite18skips.

## Clock boundary follow-up (2026-09-06)

Stale acknowledgement reclaim now reads the injected clock once and uses that same instant for the age decision and database cutoff. The guarded update uses inclusive lte to match the five-minute expiry decision exactly. New cases at lease age 299999/300000/300001 ms with a synthetic 2040 clock failed before the fix (3 failures), then passed; they assert no early reclaim and the exact inclusive cutoff. Combined provider, donation/volunteer notification, delivery worker and HTTP conflict regression selection: 35 pass, 0 fail, 79 assertions. No real provider called. Targeted ESLint exited 0.
Final full typecheck after clock and conflict-envelope changes: exit 0.
