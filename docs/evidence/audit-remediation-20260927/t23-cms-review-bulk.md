# T23 CMS editorial review bulk slice

Scope: admin-only batch send of saved, unpublished, unclassified `content_item` draft revisions to source review. It uses the existing atomic `editorial_review_command` in the same transaction. It does not publish, unpublish, archive, alter media/body, or send messages. Other CMS queues (expired/demo/missing source/media) and public-impact publication review remain T23 follow-ups.

## Red reproduction and implementation

- `create_cms_review_bulk_preview` signature was absent on the named unlinked local database: test exited 1, 0 pass/1 fail. The exact SQL file completed BEGIN/ROLLBACK rehearsal, then was manually applied **only** to that disposable DB without inserting a migration ledger row. The test turned green.
- Admin API accepts at most 1000 unique UUIDs with bounded evidence, hashes the selected kind/filter/IDs, and snapshots for 15 minutes. Queue offers 25 visible or up to 1000 all matching. Preview skips missing draft, non-draft status and already classified revision. Every apply rechecks active, confirmed and non-banned admin, operation ownership/expiry, current draft revision/status and classification; results are per item, 25 per HTTP checkpoint, recoverable after refresh. Staff retain the individual review link.
- Content publication remains unchanged; no broad table-write endpoint or automatic message dispatch was added.

## Isolated verification

- Dedicated rollback-only DB at `127.0.0.1:57322`: `CMS_REVIEW_BULK_TEST_DATABASE_URL=<loopback> CMS_REVIEW_BULK_TEST_ALLOW_LOCAL_FIXTURES=1 bun test --isolate src/lib/contentReview/cmsBulk.database.test.ts`: exit 0, 3 pass/18 assertions. Covers 1001 cap, published/classified skip, stale UUID revision, archive race, duplicate apply, actor disable/role downgrade, expiry, forbidden grants and synthetic `editorial.review` audit failure rollback.
- Focused admin UI/selection/API: exit 0, 6 pass/26 assertions. `CHECK_RELEASE_SCHEMA_DATABASE_URL=<loopback> bun scripts/check-release-schema.ts`: exit 0, 114 compatible requirements, zero issues; local ledger still `20260927150000`.
- `npm.cmd run build`: exit 0; generated route present. `npm.cmd run typecheck`: first exit 1 on a new test fixture that used numeric instead of UUID revision; after fixing fixture, exit 0. `npm.cmd run lint`: exit 0, 52 existing warnings, zero errors. `SUPABASE_LOCAL_URL=http://127.0.0.1:57321 bun test --isolate`: exit 0, 2875 pass/103 skip/0 fail, 8945 assertions across 516 files. Dedicated DB fixtures are skipped in the general suite and run separately. Remote CI and real-role browser UAT pending.

## Release boundary

Migration `20260927190000_cms_review_bulk.sql` SHA-256 `ffbce79aa8220b3aa1105c84f81c6b1184986902b8a5a34b1189b1cd5b4a1764` is additive: two RLS operation/result tables, three service-role-only public RPCs and one private admin guard. Rehearse the now-44-file ordered manifest on fresh and sanitized data-bearing clones, verify exact signatures, grants/RLS, locks and backup/restore before approved production DDL. Disable this API/UI before considering schema rollback; keep audit/result records. No production write or publication was performed.
