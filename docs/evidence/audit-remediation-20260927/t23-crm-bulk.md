# T23 CRM tag bulk slice

Scope: additive supporter tag only. This is one reviewable domain slice of ADMIN-04, stacked after the read-only task overview. No refund, identity merge, adoption approval, notification dispatch or production mutation is in scope.

## Reproduction and fix

- Red: missing `tagBulkSelection` module, API route, shared bulk UI and Postgres `create_crm_tag_bulk_preview` (`42883`) were each exercised by focused tests before implementation.
- Green: 25 and 1000 selection, changed-list rejection; authenticated treasurer/admin API and request cap; reviewed before/after UI and formula-safe result CSV; disposable DB preview/apply with version conflict, duplicate submit, 1001 cap, role revoke, expiry, forbidden grants and forced audit-insert failure rollback.
- Recovery: operation ID persists in tab session storage; GET reloads the server-stored result after refresh or a partial HTTP failure. Permission is rechecked on every read/apply.

## Verification at this branch

- `bun test src/lib/crm/tagBulkSelection.test.ts src/routes/api/admin/supporters/tag-bulk.test.ts src/components/admin/bulk/BulkReview.test.tsx src/components/admin/bulk/BulkResults.test.ts`: exit 0, 6 pass, 27 assertions.
- `CRM_TAG_BULK_TEST_DATABASE_URL=postgresql://postgres:***@127.0.0.1:57322/postgres CRM_TAG_BULK_TEST_ALLOW_LOCAL_FIXTURES=1 bun test src/lib/crm/tagBulk.database.test.ts`: exit 0, 2 pass, 16 assertions, each synthetic fixture rolled back.
- `CHECK_RELEASE_SCHEMA_DATABASE_URL=<dedicated-loopback> bun scripts/check-release-schema.ts`: exit 0, 92 compatible requirements, zero issues. Local ledger ending 20260927150000 intentionally does not record manually rehearsed files.
- `npm.cmd run typecheck`: exit 0 after route generation. `npm.cmd run lint`: exit 0, 52 existing warnings and zero errors. `npm.cmd run build`: exit 0 on the final source diff. Full isolated suite with `SUPABASE_LOCAL_URL=http://127.0.0.1:57321`: exit 0, 2855 pass, 92 skip, 0 fail across 503 files. An initial run against the older default 55321 stack failed six unrelated RLS/document-slot assertions; one CSV test ran concurrently with its edit. Dedicated-stack rerun and focused CSV test pass. Remote CI pending until the draft PR is pushed.

## Boundaries

This migration is additive but production schema is not ready. The PR must remain draft and stacked. Before promotion, run the full ordered manifest on a fresh and sanitized data-bearing isolated database, verify backup/restore and lock timing, and obtain release owner approval. Real staff-role browser, keyboard/mobile, hosted RLS and direct private export tests remain not-run without test identities and a safe hosted environment. The final SQL checksum was rehearsed with all statements successful in a BEGIN/ROLLBACK transaction on the named disposable stack. The existing webhook and reconciliation paths are unchanged.
