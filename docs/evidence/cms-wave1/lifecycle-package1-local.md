# CMS lifecycle Package 1 local evidence

Baseline: `20c168459a90c5c92093659a18b139a994451470`
Branch: `codex/completion-20260905`

## Implemented locally

- Typed lifecycle errors, revision summaries, mutation commands, results, and a defensive public DTO projection.
- A Supabase repository boundary that sends mutation, restore, and selected-revision publication through one RPC each.
- Allocated migration `20260905150012_content_revision_lifecycle.sql` with:
  - monotonic parent versions;
  - immutable authoring/public revision snapshots and a published-revision pointer;
  - actor lookup from the authenticated user id;
  - row locks and expected-version conflicts;
  - one-transaction revision and actor-attributed audit writes;
  - selected-revision publication with idempotency-key replay/conflict handling;
  - restore into a new unpublished revision;
  - RLS, direct-role revocations, pinned function search paths, and service-role-only execution;
  - filtered legacy published backfill that excludes internal update media and address fields.
- The publication transaction supplies `published_at`; the client does not supply a public snapshot or audit time.

## Commands and results

```text
bun test src/lib/content/lifecycle.test.ts src/lib/content/lifecycle.repository.server.test.ts
7 pass, 0 fail, 17 expect() calls
```

```text
bunx eslint src/lib/content/lifecycle.ts src/lib/content/lifecycle.test.ts src/lib/content/lifecycle.repository.server.ts src/lib/content/lifecycle.repository.server.test.ts
exit 0
```

```text
bunx tsc --noEmit
exit 0
```

```text
bunx supabase db lint --local
failed to connect to postgres: dial error (connect ECONNREFUSED 127.0.0.1:55322)
suggestion: Make sure Docker is running, then run: supabase start
```

## Acceptance gates still open

This is not database acceptance. The migration has not run against an isolated Postgres instance, so rollback-on-audit-failure, two-writer concurrency, idempotent replay, mismatched-key conflict, RLS roles, backfill counts, and sampled snapshots remain unproved.

Existing authoring methods and public readers have not yet been switched to the lifecycle repository. Until that wiring and Package 2's private-copy publication state machine are integrated, the new migration must not be applied as a production cutover and Package 1 must not be described as accepted.

Legacy public object references retained by the filtered backfill remain public. Inventory and remediation require a separate approved operation.


## Review corrections, 2026-09-05

Six source-review findings corrected before wiring: publication variable ambiguity; JSON-null profile checks; destructive restore cascades; internal cover projection; snapshot mutation at publication; legacy publication-date loss.

Restore now retains update parents using working-copy membership (`is_authoring_active`) and upserts selected historical updates, preserving dependent social-copy and recipient-notification records. Snapshot builders use only active updates. Public readers must overlay publication metadata from the current publication pointer rather than mutate revision JSON.

Red-before: `bun test src/lib/content/lifecycle.test.ts src/lib/content/lifecycle.sql.test.ts` — 2 pass, 7 fail. Green-after: same plus lifecycle.repository.server.test.ts — 14 pass, 0 fail, 27 assertions. SQL tests are source safeguards only; they do not prove execution, atomicity, concurrency, RLS, or migration acceptance.

Database and service/public-reader wiring gates remain open. No migration applied.

## Integrated backend checkpoint

Production admin handler composition now injects a strict lifecycle service. Core content creation/save, profile/update/media/link changes, selected-revision publish, archive and restore use audited RPCs. Saves require `expectedVersion`; publish requires `expectedVersion`, `revisionId`, `idempotencyKey`. Admin detail exposes `version` and `revisionId` from `draft_revision_id`. Child-create results include `childId` while retaining the existing `id` response alias.

Public repository list/detail/map reads now use `read_published_content_snapshots`. The public URL slug, fields, filters, related data and covers derive from saved JSON, while publication time comes from publication metadata. SQL returns only the latest update/selected media for list summaries; detail explicitly requests `detail: true`. Existing authoring history membership is filtered with `is_authoring_active`, preserving operational update parents across restore.

New authenticated routes: `/api/admin/content/$id/revisions` GET and `/api/admin/content/$id/revisions/$revisionId/restore` POST. Route tree must be generated through the normal build (coordinator-owned).

Additional regression evidence: service dispatch test failed on the old separate legacy write, then passed through lifecycle. Public detail test failed on a mutable authoring-table read, then passed with the saved snapshot alone. Public list test failed on leaking full body/history properties, then passed as a summary.

Focused current results:
- lifecycle and snapshot tests: 21 pass, 0 fail; 7 integration skips including before/after hooks (5 named database cases).
- affected service/HTTP tests: 46 pass, 0 fail.
- public/list repository tests after summary projection: 31 pass, 0 fail.

Real SQL acceptance wrappers are in `src/lib/content/lifecycle.integration.test.ts`. Require `CMS_LIFECYCLE_TEST_DATABASE_URL` with an explicit loopback Postgres URI and no query-routing overrides, plus `CMS_LIFECYCLE_TEST_ALLOW_LOCAL_FIXTURES=1`. They do not apply migrations. They seed synthetic actors/content and clean up exact fixture IDs, testing audit-constraint rollback, two-writer conflict, idempotency replay/mismatch, profile-free restore and direct-role privileges. They have not executed because no isolated database is available.

Still open: independent integrated-backend review, generated route tree/typecheck, private media Package2, editor version/review UI Package3, bounded admin histories Package4, and database/storage acceptance. Legacy operational social-copy/recipient notification mutation auditing remains outside the newly wired content authoring operations. No production SQL, data, objects, or deployments changed.
