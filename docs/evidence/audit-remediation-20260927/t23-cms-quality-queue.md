# T23 · CMS 品質隊列（ADMIN-04）

Source PR #166 / `3b97aff8148d53b3e9b4dd6ee499ab5f6abd4951`, stacked on draft #165 / `03844d814132cb100fbcba17d0d47c33beff5249`. This is a read-only domain slice; ADMIN-04 remains partial because other T23 domains are unfinished.

## Reproduction and change

The existing GET content-review schema silently dropped `quality=demo`: focused red test 0 pass/1 fail because the repository received only page/kind. The named local DB returned PostgreSQL 42883 for `editorial_quality_queue`. A direct-entry UI regression test found that an expired task link could not initialize the filtered queue.

A service-role-only `editorial_quality_queue(uuid,integer,text)` now pages 25 current content items at a time and counts demo, expired or missing-source items before pagination. It checks a current active staff/admin row, confirmed Auth email and suspension. The all-items animal/content RPC is unchanged. The admin content page offers quality filters and a direct expired task-card link. Filtered queues are read-only; existing CMS draft bulk review stays in the all-items queue, and changing filters clears selected IDs.

The queue does not publish/unpublish content, mark a source verified, send a notice or change payments. Demo items may be classified in metadata or in the current editorial review. Expired includes non-archived draft and published items, matching the task-card count. Missing-source means `source_reference` is blank or null. The three filters can overlap, so their counts must not be summed.

## Executed verification

- `bun test src/lib/contentReview/qualityQueue.test.ts`: exit 0, 2 pass/6 assertions. Direct animal+quality GET returns 400; quality routes to the new RPC while all-items keeps its old RPC.
- `bun test src/components/admin/content/ContentReview.test.tsx`: exit 0, 4 pass/13 assertions. Expired direct entry selects the filter; filtered CMS has no bulk apply control.
- Named unlinked loopback DB `127.0.0.1:57322`: exact migration file `20260927211801_editorial_quality_queue.sql` rehearsed in BEGIN/ROLLBACK, then manually applied locally with no ledger edit. Explicit opt-in synthetic DB fixture ran in its own rollback transaction: exit 0, 1 pass/13 assertions. It checks all three filters, excludes a current item, denies a newly banned actor with SQLSTATE 42501 and confirms service-role-only EXECUTE. No production data or ledger was changed.
- `CHECK_RELEASE_SCHEMA_DATABASE_URL` catalog checker: exit 0, 116 compatible requirements/zero issues. Local Supabase security advisor `--type security --level error --fail-on error`: exit 0, zero findings.
- `npm.cmd run typecheck`: exit 0. `npm.cmd run lint`: exit 0, 52 existing warnings/zero errors. `npm.cmd run build`: exit 0. `SUPABASE_LOCAL_URL=http://127.0.0.1:57321 bun test --isolate`: final exit 0, 2881 pass/106 skip/0 fail/8970 assertions across 519 files. Its first run failed one SSR test because the new page code read `window` while rendering without a browser; after guarding that access, the focused test and whole suite passed.
- Exact source remote CI run `36353059091`: verify, brand, a11y, RLS matrix and performance all passed. The RLS job ran the new DB fixture on its fresh loopback stack. Hosted staff browser/UAT, 25/1000 filtered-page load, data-bearing migration and same-SHA performance: not-run.

## Schema and rollback boundary

Migration SHA-256 `8c1b4550d4361f348246654bab356f3cd2366de48afb0eb384b90efb38526642`. It depends on the earlier editorial review table and `content_item.content_class`, `source_reference`, `effective_until`; it adds two nonunique read indexes. Rehearse all ordered migrations on fresh and sanitized data-bearing clones, review index lock/build time, exact function signature/search path/grants and Auth/RLS behavior. Do not fabricate ledger history.

If the new RPC is absent, the quality filter reports an error while the existing all-items queue remains usable. On app rollback retain the additive function and indexes until a compatible target is proven. No public content or financial facts need reversal.

The #166 committed LF SQL blob was rehearsed again with the local function and both indexes dropped inside the rollback transaction. The release manifest verifies committed Git blob bytes; the earlier Windows CRLF working-tree hash is superseded.
