# T23 volunteer reviewer bulk slice

Draft PR #160, source commit `d6b540d`, stacked on #159.

Scope: assign an active staff/admin reviewer to up to 1000 selected volunteer profiles. This is one narrow ADMIN-04 slice stacked after CRM bulk #159. It does not verify identities, alter qualifications/status, book sessions or send notifications.

## Test sequence

- Missing `create_volunteer_review_bulk_preview` reproduced as SQLSTATE 42883 before disposable migration application.
- `VOLUNTEER_REVIEW_BULK_TEST_DATABASE_URL=<dedicated 127.0.0.1:57322> VOLUNTEER_REVIEW_BULK_TEST_ALLOW_LOCAL_FIXTURES=1 bun test src/lib/volunteers/directory/reviewerBulk.database.test.ts`: exit 0, 2 pass, 14 assertions. Covers preview, stale profile revision, suspended profile, double apply, 1001 cap, actor and reviewer revocation, expiry, forbidden grants and audit failure rollback. Synthetic fixtures rolled back.
- `bun test src/components/admin/volunteers/VolunteerDirectory.test.ts src/lib/volunteers/directory/reviewerBulkSelection.test.ts src/routes/api/admin/volunteers/reviewer-bulk.test.ts`: exit 0, 8 pass, 32 assertions, including 25/1000 selection, changed-list rejection, a red-to-green manual 1001st-item limit, admin-only selection UI, auth, 25-item checkpoint and retry.
- `CHECK_RELEASE_SCHEMA_DATABASE_URL=<dedicated loopback> bun scripts/check-release-schema.ts`: exit 0, 98 compatible requirements, zero issues. Manual local application did not alter the migration ledger.
- `SUPABASE_LOCAL_URL=http://127.0.0.1:57321 bun test --isolate`: exit 0, 2860 pass, 94 skip, 0 fail, 8851 assertions across 506 files. The dedicated DB tests above were run separately because the default suite intentionally skips fixture-dependent DB tests.
- `npm.cmd run typecheck`: exit 0 on final functional source. `npm.cmd run lint`: exit 0 with 52 existing warnings, 0 errors after formatting correction. `npm.cmd run build`: exit 0 on final functional source. `git diff --check`: exit 0. Remote CI and browser UAT pending at source commit `d6b540d`. A subsequent formatting-only import/line-wrap change followed the final build and typecheck; CI will verify that exact commit.

## Release boundary

Migration SHA-256 ab281bdd9c94b184772d4a59418f6563cb2b3f56fca53016a9d62fc8a9b3e3b0 was transaction-rehearsed in the disposable DB. Draft PR only; no production migration, public preview or merge. Prior to promotion, run ordered fresh and data-bearing clone rehearsals, RLS/grants/lock/backups and real-role mobile/keyboard UAT. Existing booking and webhook paths remain available.
