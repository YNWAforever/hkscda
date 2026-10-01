# T23 animal editorial review bulk slice

Scope: batch send unpublished, unclassified saved animal drafts to source review. T18 already added file-to-animal mapping preview and the individual classification queue; this slice adds only the safe batch send-to-review step. No publication, photo mutation, animal matching or message dispatch. It stacks after adoption assignment #161.

## Reproduction and implementation

- Red: `create_animal_review_bulk_preview` signature absent in the named disposable DB; green after exact migration rehearsal/application there.
- Server snapshot has up to 1000 unique IDs, explicit evidence, 15-minute expiry and before/after classification. Apply rechecks admin Auth role/suspension, draft revision, publication state and prior classification per item, then invokes the existing atomic `editorial_review_command`. Already published or classified versions are skipped; the operation never demotes approved content or changes live publication.
- Queue UI has 25 visible/all matching selection, review confirmation, 25-item checkpoint, per-item results and tab refresh recovery. Staff retain individual review; bulk controls are admin-only.

## Verification

- Dedicated rollback-only DB fixture `ANIMAL_REVIEW_BULK_TEST_DATABASE_URL=<127.0.0.1:57322> ANIMAL_REVIEW_BULK_TEST_ALLOW_LOCAL_FIXTURES=1 bun test src/lib/contentReview/animalBulk.database.test.ts`: exit 0, 3 pass, 18 assertions. Covers current/past-publication, already classified, stale draft, duplicate apply, 1001 cap, actor revocation/role downgrade, expiry, forbidden grants and forced `editorial.review` audit failure rollback.
- Focused UI/selection/API: exit 0, 5 pass, 22 assertions. `CHECK_RELEASE_SCHEMA_DATABASE_URL=<dedicated loopback> bun scripts/check-release-schema.ts`: exit 0, 109 requirements compatible, zero issues.
- Typecheck, lint and build: each exit 0; lint reported 52 existing warnings and zero errors. Full isolated suite before the test-only role-downgrade assertion: exit 0, 2870 pass, 100 skip, 0 fail, 8914 assertions across 513 files. Final dedicated DB case rerun after that assertion: exit 0, 3 pass, 18 assertions. Draft PR #162 source e3ebbb47aad2cb3de830dd7bb5e944cb4c79bc0e. Remote run 36345471697: verify, RLS, performance and a11y passed; brand pending at capture. Real-role browser UAT not-run.

## Release boundary

Migration SHA-256 cfbabd9a6bb393ec90200bdb05c2ff6314c035e7839661e99365872362a69e52 was transaction-rehearsed and manually applied only to the unlinked local DB without a ledger row. Draft PR only. Ordered fresh/data-bearing clone, RLS/grants, private role/API and browser/mobile/keyboard UAT, content-owner review and release approval remain required. Existing webhook/reconciliation and public animal publication are untouched.
