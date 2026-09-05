# CMS bounded reads Package 4 local checkpoint

## Implemented

`20260905163559_content_bounded_authoring_reads.sql` defines service-only, security-invoker RPCs with pinned search paths. Admin list filters use profile EXISTS before counting and parent paging, avoiding a client materialized ID limit. Parent limit50 and stable updated_at/id ordering. Each list parent gets at most one eligible cover and latest public active update with no update body. No full relation history leaves this query.

`repository.server.ts` production admin list uses this projection and batches private cover signing: one database RPC and at most one Storage signing request for both1 and50 items. The old exported contentListRead implementation remains compatibility-only and its historical unit assertions do not prove the new SQL.

Detail uses one bounded projection plus the initial parent lookup. Link/media/update/social-copy/notification histories each request21 rows with20 exposed and a hasMore signal. The editor offers previous/next record pages, disabling navigation while dirty, and obtains update bodies only after explicit staff expansion via a content-owned update lookup. All history has stable ID tie-breaks. Private previews remain short-lived. Revision history independently uses limit20/cursor.

## Evidence

- Bounded SQL source safeguard red1fail against allocated empty migration, then1pass. These checks are explicitly source safeguards.
- Production adapter/read/HTTP tests46pass. Editor and published snapshot tests8pass, ensuring public snapshot reads remain distinct.
- Private cover batching regression red3pass1fail -> green combined34pass0fail (repository, compatibility-reader, SQL safeguard). Tests exercise1 and50 rows with one projection and one signing batch.
- Typecheck passed after initial detail/editor paging wiring. Latest batching typecheck finishing separately.
- ESLint0errors, one existing component-export fast-refresh warning.
- `contentRead.integration.test.ts` has an explicit loopback, no-routing-overrides and fixture-opt-in gate. It creates1201 profiles with100 updates and100 media per parent inside a rollback-only transaction, checks complete page25/count1201, capped summaries, paged histories and denied role grants, and includes EXPLAIN ANALYZE. Execution:1 skipped because no local DB configured.

## Limits

No SQL was applied and no database query plan, latency, or response-size measurement is claimed. No indexes were invented without measurements. Actual isolated EXPLAIN before/after and latency/size acceptance remain gated. Browser history paging is not runtime-verified because the available frontend fixture has no authenticated CMS data. Shared editor/HTTP/types changes are included in this checkpoint; no generated route changes required.

## Final combined evidence and self-review

- Cover/latest summary is now independent of history pagination, avoiding null cover or older summary on page2. Regression red4pass1fail -> green6pass0fail including SQL safeguard.
- Broad CMS/editor/reconcile run (excluding earlier adultCatCopy scan timeout):157pass22gatedskips1failure. The remaining failure was existing serviceSloganCopy tracked-file scan timeout13.6s against5s; no CMS behavioral assertion failed.
- Latest tsc reports only concurrent `src/lib/donations/deliveryJobs.server.test.ts:310` mock type mismatch; no CMS errors. Focused final lint0errors.
- Added concurrent historical-slug publication acceptance source. Automatic approval review rejected the initial combined source-edit/test command as possible DB mutation. Read-only inspection then verified loopback/protocol/no-routing guards and absence of both DB URL and fixture opt-in. A subsequent source-only edit/format was approved; the new concurrent test was not executed. No DB operations ran.

## Superseding local acceptance

Actual disposable database+Storage results now recorded in `database-storage-acceptance-local.md`:19pass0fail across lifecycle/read/media. Detail preview signing additionally changed from up to21 individual calls to one deduplicated batch for the20-row page plus its independentcover; regression red5pass1fail ->green6pass. Timeline bodyLoaded:false verified read-only with explicit expansion/no form; metadata retry and uncertain-success upload recovery unit regressions passed. Earlier unavailable-DB statements above describe the earlier checkpoint and are superseded only by the precisely scoped local evidence.


Actual integrated browser acceptance completed on 2026-09-05T19:20:39Z:11 scenarios passed, zero pageerrors, synthetic fixtures cleaned. See `browser-acceptance-local.md` for executed coverage, prior red/green findings, and explicitly scoped local CSP/network transport accommodations.
