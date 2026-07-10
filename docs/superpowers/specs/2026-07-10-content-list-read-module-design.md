# Content List Read Module Design

Date: 2026-07-10

## Goal

Deepen content list loading into one module that keeps the existing admin, public, and story-map contracts while replacing per-row hydration with a fixed number of bulk reads. The change must improve loading speed without adding a database migration or changing single-content detail and authoring behavior.

## Current Behavior

`listAdminContent`, `listPublicContent`, and `listPublicMapStories` first query a page of `content_item` rows and then call `hydrateContentDetails`. That helper awaits `hydrateContentDetail` once per row. Each detail performs six sequential related reads:

1. `rescue_story_profile`
2. `content_link`
3. `content_media`
4. `story_update`
5. `social_copy_variant`
6. `recipient_notification_draft`

The list paths therefore approach `1 + 6N` reads, or one optional story-filter read plus `1 + 6N` when profile filters are active. With the current maximum page size of 50, that can reach approximately 301 reads before the optional filter query.

The list outputs discard links, social copies, notification drafts, full content bodies, and most detail-only fields after hydration. They retain only `ContentSummary` data: the content row, story profile, cover image, and latest public update.

## Selected Approach

Add a deep `contentListRead.server.ts` module. It owns the complete query plan and summary assembly for:

- admin content lists
- public content lists
- public story map points

The existing content repository interface remains unchanged. `createSupabaseContentRepository` delegates its three list methods to this module. Single-content detail loading, content mutations, publishing, and authoring continue to use the existing repository implementation.

This approach was selected over:

- an internal bulk helper inside `repository.server.ts`, which would reduce reads but leave query planning and assembly inside the already broad repository implementation
- PostgREST embedded relations, which would reduce HTTP round trips but make per-parent update ordering, media association, payload size, and public-data sanitization harder to reason about and test

## Module Ownership

`src/lib/content/contentListRead.server.ts` owns:

- applying the existing content and story-profile filters
- querying the ordered `content_item` page and exact total
- bulk loading page-scoped story profiles, media, and public story updates
- grouping related rows by content ID
- attaching media to public story updates
- selecting the latest public update per content item
- resolving the cover image URL
- projecting admin summaries, public summaries, and story map points
- public-only sanitization for story profile fields and CTA URLs

`src/lib/content/repository.server.ts` continues to own:

- single-content detail hydration
- content creation and updates
- story profile, update, media, and link mutations
- publishing and archiving
- social copy and notification draft persistence

The public repository interface does not gain new methods. The new module is an implementation detail behind the existing list methods.

## Data Flow

Each list request follows this plan:

1. Run the existing `storyFilterContentIds` query only when `animalType`, `publicStatus`, or `rescueRegion` is active.
2. Query the requested `content_item` page with the existing filters, ordering, range, and exact count behavior.
3. If the page is empty, return immediately without related reads.
4. In parallel, bulk query page-scoped rows from:
   - `rescue_story_profile` by `content_item_id`
   - `content_media` by `content_item_id`
   - `story_update` by `content_item_id`, restricted to `visibility = public`
5. Build lookup maps once, preserving the `content_item` page as the only source of result ordering.
6. Assemble `ContentSummary` values or public story map points without loading links, social copies, or notification drafts.

The expected query count is:

- four reads without story-profile filters: content page plus three related bulk reads
- five reads with story-profile filters: one filter read, content page, and three related bulk reads
- one read for an empty unfiltered page
- two reads for an empty filtered page

The count is independent of page size.

## Compatibility

The following behavior remains unchanged:

- API routes and response shapes
- `ContentSummary` and public story map point types
- pagination, total counts, filtering, and ordering
- cover image resolution
- latest-public-update selection
- media attached to the latest public update
- admin access to the complete story profile
- public removal of `internalAddress` and `internalLocationNotes`
- public rejection of unsafe CTA URLs
- filtering of stories that cannot produce a valid public map point
- cache keys and client loading behavior

The bulk module must preserve exact list output semantics. Missing story profiles, cover media, or public updates produce `null` fields as they do today.

## Error Handling

Any failed content-page or related bulk query rejects the complete list request. The module does not return partial summaries because they could present incomplete public or admin information as valid data.

Missing related rows are valid and map to existing `null` or empty values. An empty page is also valid and skips the related bulk reads.

Existing HTTP error mapping remains unchanged because repository errors continue to propagate through the same service and HTTP modules.

## Testing And Acceptance

Add focused tests for the new read module using the repository's existing fake Supabase pattern, extended to record query calls and filters.

Query-count contract tests must prove:

- one-row and fifty-row unfiltered pages both use exactly four reads
- filtered pages use exactly five reads
- empty unfiltered pages use one read
- empty filtered pages use two reads
- query count does not grow with page size

Output parity tests must cover:

- complete admin story profiles
- public removal of internal story profile fields
- unsafe public CTA URLs becoming `null`
- cover media URL selection
- latest public update selection while excluding internal updates
- media attached to the latest public update
- missing profile, media, and update rows
- stable page ordering
- public story map projection and invalid-point filtering
- propagation of failures from each bulk query

Existing content mapping, service, HTTP, admin content, and public story tests must continue to pass. No wall-clock timing benchmark is required; deterministic query-count contracts are the performance regression gate.

## Out Of Scope

- database migrations, views, functions, or new indexes
- changes to single-content detail hydration
- changes to the content editor or authoring mutations
- API response or type changes
- client cache or pagination changes
- unrelated repository refactors
- live production timing benchmarks

## Rollback

Rollback requires restoring the three repository list methods to their previous implementation and removing the new read module. No schema or data rollback is required.

## Spec Self-Review

- No incomplete markers or unresolved decisions remain.
- The fixed query counts match the approved bulk-read data flow.
- Public and admin compatibility requirements are explicit.
- Single-content detail and authoring behavior are explicitly outside the change.
- The scope is small enough for one implementation plan.
- No migration is required.
