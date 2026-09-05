# HKSCDA CMS Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax.

**Goal:** Make general content publishing recoverable, audited, private where required, and predictable at scale.

**Architecture:** Keep thin authenticated routes and the existing service/repository separation. Introduce an atomic versioned content lifecycle, managed private media, and bounded read projections. Reuse adoption-guide release conventions without replacing unrelated CMS domains.

**Tech Stack:** TypeScript, TanStack Start/Router, React Query, Bun, Supabase Postgres/Storage, Vercel.

## Global constraints and evidence

- This is an unexecuted plan against source HEAD `20c168459a90c5c92093659a18b139a994451470`.
- Source repository: `C:/Users/laich/Documents/HKCSDA/HKCSDA/hkscda`. Paths below are relative to it.
- Preserve unrelated edits; implement in a verified isolated checkout. Stage explicit files.
- Live database parity is **unverified**: the connected Supabase account exposes two unrelated projects, not production project `iihqjzilgawhfdhdevam`. No production RLS, bucket, migration, or data claims follow from source.
- No production migration, seeding, object copying/deletion, deployment, or main merge without explicit release authorization. Local implementation and isolated tests do not require renewed broad design questions.
- Use real approved imagery, Traditional Chinese first, existing semantic style tokens, server-only secrets, and current role authorization.
- Generate migration filenames with `supabase migration new`; record the resulting exact paths in the execution log. Never invent timestamps.
- Existing safeguards: authenticated staff/admin CMS routes; RLS and direct-table grant restrictions; signed uploads with 8 MiB and JPEG/PNG/WebP limits; paginated lists with batched queries; versioned adoption-guide/payment publishing. Preserve these.

Findings covered: F1 public storage for internal images; F2 non-atomic audits; F3 stale publication/concurrent overwrite; F4 create-time publication bypass; F5 orphan uploads; F6 unbounded related rows/sequential hydration.

## Package 1: Atomic content revisions and publication

**Order:** First; establishes persistence consumed by Packages 2–3.

**Evidence:** `src/lib/content/service.ts:218–244,344–352`; `repository.server.ts:674–685,750–758`; `schemas.ts:82–83`. Creation accepts published status without publication validation; writes precede separate audit insertion.

**Modify:** `src/lib/content/{types.ts,schemas.ts,service.ts,repository.server.ts,http.server.ts,rules.ts}`; `src/routes/api/admin/content/-handlers.ts`; `src/lib/adminRouteAuditing.test.ts`.

**Create:** `src/lib/content/{lifecycle.ts,lifecycle.test.ts,lifecycle.repository.server.ts,lifecycle.repository.server.test.ts,lifecycle.integration.test.ts}`; `src/routes/api/admin/content/$id/revisions.ts`; `src/routes/api/admin/content/$id/revisions/$revisionId/restore.ts`. Generate migration using `supabase migration new content_revision_lifecycle`.

**Contract/defaults:** Retain staff/admin publishing authority. Introduce a monotonic content version, immutable revision snapshots, and a published-revision pointer. Snapshots include the content fields, profile, public updates, and selected media references needed to reproduce public output. Existing authoring records remain the working copy. All authoring mutations increment the parent version; public readers use the published snapshot. Restore creates a new draft revision.

- [ ] Add service regressions before changing behavior. A create request containing `status: "published"` returns 400; draft creation succeeds. Publication without cover/profile fails. A failed audit insertion leaves content/version/pointer unchanged.
- [ ] Define the repository command with `actorUserId`, `contentId`, `expectedVersion`, operation, and operation-specific validated input. Define results containing `contentId`, `version`, and `revisionId`. Require a publication idempotency key. Return 409 for stale versions and 404 for missing records.
- [ ] Implement transactions that lock the parent, verify version, apply related changes, store the revision, and insert one actor-attributed audit event. Build snapshots from database state, not a client-supplied public payload. Publish only the validated selected revision.
- [ ] Keep draft saves separate from public publication. Route existing profile/update/media/link mutations through the same parent-version boundary so child changes cannot invalidate a reviewed revision silently.
- [ ] Add public-projection tests excluding internal updates, addresses, links, notification recipients, and unapproved media.
- [ ] Add isolated database tests: inject an audit constraint failure; issue two updates with version 7 concurrently; replay one publication key; reuse that key with different content. Expect rollback, one winner/one conflict, one publication event, and conflict respectively.
- [ ] Enable RLS on new tables; deny anon/authenticated direct mutation. Pin privileged function search paths and revoke default PUBLIC/anon/authenticated execution; grant only required service-role access. Test privileges with each role.
- [ ] Run `bun test src/lib/content/lifecycle.test.ts src/lib/content/lifecycle.repository.server.test.ts src/lib/content/service.test.ts src/lib/adminRouteAuditing.test.ts`; expect zero failures. Commit this reviewed package separately.

**Acceptance:** A failed operation cannot leave an unaudited committed change; stale writes cannot overwrite; published output remains stable through draft edits; rollback preserves history. Covers F2–F4.

## Package 2: Private media and recoverable upload finalization

**Order:** After Package 1; before public snapshot cutover.

**Evidence:** `ContentEditor.tsx:1174,1382–1399`; `repository.server.ts:709–725`; `supabase/migrations/20260831160000_content_media_storage_bucket.sql:14–20`. Internal updates accept attachments, all uploads enter a public bucket, and upload/metadata/cover writes are separate.

**Modify:** `src/components/admin/content/{contentMediaUpload.ts,contentMediaUpload.test.ts,ContentEditor.tsx,ContentEditor.test.tsx}`; `src/lib/content/{schemas.ts,service.ts,repository.server.ts,http.server.ts}`; existing media/upload-target route wiring.

**Create:** `src/lib/content/{mediaLifecycle.server.ts,mediaLifecycle.test.ts,mediaLifecycle.integration.test.ts}`; `src/routes/api/admin/content/$id/media-finalize.ts`; `src/routes/api/admin/content/$id/media-preview.ts`; `scripts/reconcile-content-media.ts`. Generate `supabase migration new content_private_media_sessions`.

**Contract/defaults:** The server returns an `uploadSessionId`, allocated object path, and signed upload target. Finalization consumes the session plus parent `expectedVersion` and validated metadata, returning one media ID. New draft/internal objects use a private bucket. Publication creates immutable public copies only for approved revision references; authenticated previews use short-lived signed download URLs.

- [ ] Write regressions for anonymous retrieval of a known internal/draft object, expired preview URLs, foreign-content session reuse, duplicate finalization, and invalid bytes/MIME. Expect denial, denial, 400/404, the same media ID, and rejection.
- [ ] Allocate server-owned paths and record content ownership, expected media properties, expiry, and completion state. Keep 8 MiB and JPEG/PNG/WebP restrictions at both request and bucket boundaries.
- [ ] Verify the stored object before finalization. Commit media metadata, cover selection, revision version, and audit together. Retries reuse the session/object rather than upload another random path.
- [ ] Make public-copy preparation idempotent. Publish the database pointer only after required copies exist; failed preparation leaves the old public revision intact. Prevent internal references entering the public snapshot.
- [ ] Implement reconciliation with dry-run as default, a 24-hour grace period, and an explicit apply switch. Protect every object referenced by a revision or active session; report incomplete sessions separately.
- [ ] Test interrupted upload, metadata failure, cover failure, audit failure, and publication-copy failure. After retries, expect one logical media record and no broken public pointer. Verify cleanup preserves shared/revision references.
- [ ] Run `bun test src/lib/content/mediaLifecycle.test.ts src/components/admin/content/contentMediaUpload.test.ts src/components/admin/content/ContentEditor.test.tsx`; then execute storage integration tests against an isolated project.

**Acceptance:** New private assets cannot be downloaded anonymously; failed uploads recover without duplicates; cleanup is reviewable. Previously public URLs require a separately authorized inventory/remediation step; copying objects privately does not retract cached/public copies. Covers F1/F5.

## Package 3: Editor saves, conflicts, and reviewed publication

**Order:** After Packages 1–2.

**Evidence:** `src/components/admin/content/ContentEditor.tsx:118–137,311–318,501–522`: dirty state is local, Publish uses persisted content independently, and full-form saves lack version checks.

**Modify:** `src/components/admin/content/{ContentEditor.tsx,ContentEditor.test.tsx}`; `src/lib/content/{http.server.ts,http.test.ts}`.

**Create:** `src/components/admin/content/{editorState.ts,editorState.test.ts,ContentRevisionPanel.tsx}`; `scripts/verify-content-publishing.mjs`.

- [ ] Model shared editor state containing loaded version, saved revision, dirty panels, pending operation, and conflict. Include profile/media/update panels, not only the main text form.
- [ ] Show saved/unsaved status. Default to explicit “save draft” followed by publication of that saved revision; disable Publish while any panel is dirty. Preserve current text on validation, network, or conflict errors.
- [ ] Send expected version with mutations and revision/version/idempotency key with publication. Show a readable 409 conflict with reload/compare actions; never automatically overwrite.
- [ ] Add revision comparison and “restore as draft.” Warn before leaving with unsaved work. Retain existing archive confirmation and field-level publication errors.
- [ ] Add a browser regression: editor A loads version 3, editor B saves version 4, A saves; expect conflict and retained local text. Edit a headline and click Publish without saving; expect disabled publication. Save a draft of live content; public page remains unchanged until Publish.
- [ ] Test restore, refresh while dirty, failed save, delayed save response, duplicate click, and nested-panel edits. Run `bun test src/components/admin/content/editorState.test.ts src/components/admin/content/ContentEditor.test.tsx src/lib/content/http.test.ts`, then run `node scripts/verify-content-publishing.mjs` against the isolated app. Use the installed Playwright library and seeded test identities; require an explicit test base URL and reject the production hostname.

**Acceptance:** Visible publication matches the reviewed saved revision; conflicts and failures preserve work. Covers F3.

## Package 4: Bounded CMS reads

**Order:** Can run alongside Package 3 after the new persistence contracts stabilize.

**Evidence:** `contentListRead.server.ts:194–208,376–387,498–527` fetches all related history/prefilter IDs despite bounded parent pagination; `repository.server.ts:443–499` hydrates six independent relations sequentially.

**Modify:** `src/lib/content/{contentListRead.server.ts,contentListRead.server.test.ts,repository.server.ts,repository.server.test.ts,service.ts,types.ts}`; editor history queries.

**Create:** `src/lib/content/contentRead.integration.test.ts`. Generate `supabase migration new content_read_projections`.

- [ ] Keep the existing 50-item cap and batched approach. Add fixtures with 1,201 matching profiles, 100 updates per content item, and large media histories.
- [ ] Replace profile-ID materialization with database joins/EXISTS. Return only cover/latest-update summary fields for lists; paginate detail histories and omit update bodies until requested.
- [ ] Add a stable ID sort tie-breaker. Parallelize independent detail queries where a single projection is unnecessary. Use security-invoker views or tightly granted functions matching the established access model.
- [ ] Assert complete counts and no missing matches beyond 1,000 profiles; bound related rows by page size. Compare isolated EXPLAIN plans and response sizes before/after; add indexes only for measured query needs.
- [ ] Run `bun test src/lib/content/contentListRead.server.test.ts src/lib/content/repository.server.test.ts` and isolated read integration tests.

**Acceptance:** Results remain complete and payload size does not grow with full history. Report actual latency measurements; do not infer production performance. Covers F6.

## Verification and controlled rollout

- [ ] Require isolated test database/storage coordinates; reject production project identifiers in integration setup. Absent credentials mean integration verification is blocked, not passed.
- [ ] Apply migrations from a clean schema and an existing-data fixture. Run `bun test src/lib/content/lifecycle.integration.test.ts src/lib/content/mediaLifecycle.integration.test.ts src/lib/content/contentRead.integration.test.ts` and `bun run test:rls`; require all named cases to execute. Check transaction concurrency, role grants, storage downloads, and migration/security advisors.
- [ ] Run `bun run typecheck`, `bun test`, `bun run lint`, `bun run build`, and `bun run verify:brand` individually; distinguish pre-existing failures from regressions.
- [ ] Prepare read-only production parity/inventory reports after the owner supplies access to the correct project. List pending migrations, public internal-media references, and reconciliation actions without exposing secrets.
- [ ] Obtain explicit release authorization for a concrete migration/backfill/object-remediation plan. Backfill published snapshots before switching public readers; verify samples and counts. Preserve previous pointers for rollback; do not drop legacy columns in the first release.
- [ ] Deploy only after authorization, verify authenticated roles and public content/media behavior, and document rollback evidence. Owner gates are correct test/live access, approval of legacy public-asset remediation, and release authorization.
