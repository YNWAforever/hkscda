# PR #137 sequential release evidence — 2026-09-29

## Completed predecessors

- #134: merge f61276f7a7560035ef7da8259eabb9149c82edca; production READY; main run 36502210175 five jobs passed.
- #135: merge 9609756e69743163e46f9bfde57a5c0cad684255; production READY; main run 36504234340 five jobs passed. Production schema ledger 20260929003610 / checkout_policy_gate matches approved SQL hash eddfba73603c199811c628584f4b0f30347ced0e18916b04c70bc69d4fb7d22c.
- #136: merge eea15f0ce71c09067ed590eb70c8b41e67497952; production deployment dpl_7xa6UCaKXc4iUGZChr2AWmrJQb8B READY. Pre-merge run 36504604608 passed all five jobs; main run 36505530161 in progress. Separately approved production schema ledger 20260929004923 / payment_instruction_snapshots matches hash aceef86734c3616688fcdb7da6cf27e7fef31ffd0bd46524d896fb05b87e2758. Ledger total 81; checkout false; approvals/admissions/snapshots zero; capture grants restricted; snapshot RLS and guard trigger present.

Public read-only browser evidence after #135: Node/Playwright exit 0, desktop 1440x1000 and mobile 390x844; button labelled 網上捐款尚未啟用 is disabled at both sizes. Screenshots are ui/production-pr135-donate-desktop.png and ui/production-pr135-donate-mobile.png. No form submitted. These are deployed-state captures, not a same-environment before/after performance comparison. The initial in-app browser failed host ACL setup; Bun browser runner stalled and was stopped; Node completed the same check. Image-view tool also failed host ACL setup, so the assertion is DOM-based rather than manual visual acceptance.

## #137 verification

Predecessor fixes were merged into this branch and the exact source tree was tested. Existing deliveryRecovery.database.test.ts now switches to service_role for the payment/donation updates and is explicitly included in CI test:db; only dedicated loopback 55322/57322 postgres URLs are allowed.

- Focused service-role delivery DB test: exit 0, 1 pass, 5 assertions.
- Full explicit RLS 52321 / checkout DB 57322 fixture suite: exit 0, 2821 pass, 83 skip, 0 fail, 8619 assertions.
- Separate typecheck: exit 0.
- Lint: exit 0, 52 existing warnings/0 errors.
- Fixture build: exit 0; generated route tree unchanged.
- Schema-only live clone plus only #135 and #136, then this single #137 SQL: psql -X -1 -v ON_ERROR_STOP=1 exit 0.
- Synthetic local service-role updates: repeated success queues exactly one job and one audit; due list contains that job; anon/authenticated due-list EXECUTE denied; transaction rolled back and zero fixture rows remain. No provider/email called.
- Complete external provider sandbox matrix: not-run. New-head CI is required before merge.

## Exact proposed production migration

File: supabase/migrations/20260927140000_donation_delivery_recovery.sql
SHA256 (committed LF bytes): 7368ea1052220be96c71b26f9003f26e259ea51a69f83dca031a79152d8913d3
Git blob: 43b5a4eebf195eaeea88f14b3189216b16ad6420

The migration adds a donation-success queue trigger and service-only bounded due-list RPC, and updates the audited retry RPC to reset its attempt window. Existing live donation_delivery_job has zero jobs. The live claim signature is claim_donation_delivery_job(uuid,uuid,timestamptz), with service-only EXECUTE; an initial lookup using text for owner returned null and was corrected by catalog introspection. No claim migration is needed.

Before application recheck new queue/due-list/trigger absence, existing job columns/claim/retry signatures, and checkout disabled. Apply only this exact approved file through the migration API in one transaction; record generated live version and statement checksum, do not relabel historical ledger entries. This SQL does not backfill historical successful donations, make provider calls or send emails. Future successful status transitions will queue recovery facts atomically.

Production CRON_SECRET metadata is absent (read-only Vercel env listing on 2026-09-29). Do not set it or manually run the delivery worker under this release authorization. Therefore the new hourly delivery scheduler is operationally disabled. Existing signed webhook/reconciliation behavior stays available. New payment activation, historical replay, notification sending and refunds remain separate operator approvals.

Backup: the user-approved current-user encrypted logical backup from 2026-09-29T00:34:37Z remains available at the private path documented in sequential-merge-136-20260929.md. Round-trip verified; no live restore test; no Storage object bytes. Do not load this backup into synthetic test fixtures.

Rollback: transaction failure rolls back SQL changes. After commit preserve job/payment/receipt/message/audit history and the bounded lease/retry behavior. Stop new scheduling before any reviewed application revert; avoid reverting to a version that masks committed success as pending. No destructive down migration or full DB restore is proposed for this additive slice.

#137 production migration has not been approved or executed. Code and isolated-schema verification are complete; deployment and operational enablement remain separate. #138-#179 remain unmerged.
