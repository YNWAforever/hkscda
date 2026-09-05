# CMS editor Package 3 local checkpoint

No deployment, migration execution or commit. Backend review approved proceeding locally; browser/SQL gates remain explicit.

## Changes

- `ContentEditor.tsx`: shared dirty state for content/profile/update/media/link; saved revision/version status; publication disabled until clean. Status/publication date are no longer editable draft fields. Staff explicitly saves draft then publishes selected saved revision.
- Dirty panels retain the version at their first edit; unrelated panel refetches cannot silently rebase pending input. Version conflicts preserve local form text and display compare/latest-reload actions. Comparison uses a separate request, leaving loaded draft and expected version intact. Explicit reload confirms discard, resets mutation errors and remounts forms.
- Main/profile input survives failed saves; profile no longer unconditionally resets on cache refresh. Pending authoring uses a disabled fieldset, preventing delayed-response edits from being discarded. Shared operation gate coalesces double clicks. Router navigation and browser unload warn when dirty. Archive and restore confirmations retained.
- `ContentRevisionPanel.tsx`: authenticated history capped at 20 rows with beforeVersion cursor. Separate selected-revision lookup scopes content+revision IDs. Comparison shows headline/slug/summary/body alongside current saved values; snapshot child data available on demand. Restore creates a new draft and refetches, retaining public pointer.
- `editorState.ts/.test.ts`, lifecycle repository/service, HTTP facade and tests, `scripts/verify-content-publishing.mjs` support these flows. Revision detail uses existing GET revisions endpoint with revisionId query; no new generated route.
- Cross-lifecycle correction: SQL1 published_slug is derived from selected revision and separately unique for published items, preserving the public URL through draft slug edits. Legacy pointer backfill included. SQL2 preparation checks occupied published slug before public copy; unique index remains final concurrent enforcement.

## Verification

- Editor state first red due absent module, then focused editor/state tests 11 pass / zero fail; includes all dirty panels, failed/conflict retention, explicit reload, and delayed-operation double-click coalescing.
- HTTP/lifecycle service/editor/state focused earlier 29 pass / zero fail. Bounded history repository test verifies limit20 and cursor; repository+editor+state 17 pass / zero fail before added double-click test.
- Public slug source safeguards red8pass1fail -> green9pass; isolated lifecycle cases16skipped, including published-slug draft edit collision. No database concurrency proof.
- Prior package3 typecheck exit0; final typecheck/lint after dirty-version freeze recorded below when finished.
- Browser harness execution failed closed before launching: explicit loopback URL, disposable staff storage-state, seeded content ID and opt-in missing. Frontend agent confirms its public-only fixture cannot supply authenticated lifecycle state. No genuine two-tab/browser acceptance claim. Harness covers dirty publish guard, real B save/A409, retained A text, nondestructive comparison, refresh cancellation and nested profile dirty guard.

## Remaining gates

Actual database/storage/seeded editor acceptance, including live draft/public isolation and revision restore UI, remains unavailable locally. Package4 must bound legacy detail histories and profile-filter joins; current revision history alone is bounded. Operational social-copy/recipient status writes remain separate existing workflows and are not claimed migrated to authoring version/audit RPCs.

## Independent review corrections

Root identified and corrections applied: structured lifecycle HTTP errors preserve AdminApiError409 through the real browser client; failed refetch with stale cached data cannot clear local form state; operation gate coalesces only the same panel/action and rejects another pending panel; revision children use labeled summaries instead of raw JSON. HTTP-client regression reproduced missing status before fix. Focused14pass0fail including retained-cache reload and different-panel gate tests. Final typecheck exit0. Lint before these surgical corrections had0errors and one existing FastRefresh export warning.
