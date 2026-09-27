# T19 · R08 media repair queue and operator handoff

## Reproduced failure and change

The previous daily public-uploads job claimed the oldest 50 animal and content publication media intents. A permanent failure retained its claim until the one-hour lease expired, then returned to the front. In a rollback-only isolated SQL fixture with 500 synthetic intents, the next claim selected the same first 50, starving the remaining 450. The red test exited 1; after the additive migration it exited 0. The final fixture checks all 450 can advance, stale lease acknowledgements are rejected, duplicate acknowledgement is harmless, the eighth failure is terminal, an eighth crashed lease is terminal, and the staff backlog contains no private source path. A second fixture proves a draft content revision cannot enter the public repair claim.

The migration adds due time, attempt count, bounded status, safe error code and UUID lease token on both media intent tables, with due indexes. Claim is ordered by next retry, creation time and stable ID and uses row locks with SKIP LOCKED. Success and failure acknowledgements require the exact lease token. Backoff is 1, 5, 15, 60 and 360 minutes, with eight attempts. The worker claims one at a time and caps each run at 20 items or 45 seconds; animal and content domains settle independently. A failed copy never marks an asset public. Existing synchronous publication and the daily orphan cleanup stay on their prior paths.

The new protected five-minute public-media-repair cron is separate from daily public-uploads cleanup. The current production config already has hourly jobs, but the exact Vercel team plan and function duration limit were not available from the connector. Official Vercel cron documentation says Hobby is daily only and Pro/Enterprise support minute-level schedules. Release owner must verify plan, function duration and deployed Nitro function settings before merge. No new schedule has been deployed.

## Staff operation

The admin dashboard shows pending, claimed and failed counts, oldest age and per-item safe error code and retry time. Staff should inspect the item and correct the underlying storage/configuration/content cause first. Manual retry requires a 10–500 character reason and an explicit cause-corrected confirmation. The SQL command locks the failed row, resets its attempt count, and writes the audit entry in the same transaction. It rejects stale/non-failed state; no private source path is returned to the browser. If the issue is systemic, pause the new repair schedule and preserve existing webhook, reconciliation and daily orphan cleanup. Failed items remain inspectable for manual follow-up.

## Isolated schema rehearsal

Only disposable local DB 127.0.0.1:57322 was used. The migration core and appended staff operations were each executed inside BEGIN/ROLLBACK before being applied to that disposable DB. Three final function replacements for retry-time validation and volatile queue age were likewise rollback rehearsed then applied there. No production DDL, reset, ledger repair or data-bearing clone was used. The catalog check returned compatible with 84 requirements and no issues. Both media intent tables have RLS enabled; four new constraints are valid; two due indexes exist. All six new repair/staff RPCs have service_role EXECUTE and deny anon/authenticated. Migration checksum is dfe96f1a4f8d73a0e8f606e14fb2854d8c91c2b6818cc2917c279a0d85e1e429.

Before a release, inspect real queue counts, table sizes, lock/statement timeouts, exact signatures, grants, constraints and indexes on a sanitized data-bearing clone; rehearse the backfill and backup/restore. Apply the reviewed schema before this code. Old app workers may ignore extra returned claim fields and keep using their legacy acknowledgement RPC. New code requires the new token RPCs, so rolling code back keeps the additive columns and old RPCs. Do not drop the queue fields or reset repair intents as a rollback. Disable only the new schedule if it misbehaves; leave established event intake, reconciliation and daily cleanup running.

## Verification and limits

Final isolated source-tree commands and exit codes are in verification.md. The two isolated DB fixtures passed with 450 assertions. The release-manifest test was red against missing T18/T19 entries, then passed after declaring exact signatures and columns. Direct API tests cover cron secret, staff role, retry validation and no-store; worker unit tests cover partial domain failure and lease handling. Actual Storage copy, browser visual UAT, hosting duration, production worker schedule and live queue metrics were not run. Manual retry does not itself prove the cause was fixed; staff must document that investigation.


## Review handoff

Draft PR #154 targets the T18 branch (#153). Source and schema commit 9b40e5a. The branch disables Vercel preview deployment. Release owner still needs the data-bearing migration rehearsal, Vercel plan/duration confirmation and explicit migration/merge approval.
