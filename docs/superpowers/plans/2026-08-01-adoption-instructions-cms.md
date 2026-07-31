# Adoption Instructions CMS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move every remaining static string on `/adoption/instructions` into a validated, versioned Supabase-backed CMS document while preserving the existing fee, estate, and guide-release workflows.

**Architecture:** Add a singleton `adoption_instruction_pages` pointer row and immutable `adoption_instruction_revisions` JSONB documents. A service/repository boundary owns draft cloning, optimistic saves, admin-only publish, history, and restore; the public reader selects only the validated published revision and combines it with the existing published fees, estates, and guide slots. The current adoption admin workspace gets a page-content tab and a separately authenticated preview route that reuses the public renderer.

**Tech Stack:** TanStack Start/Router, React 19, TypeScript, Zod, Bun tests, Supabase Postgres/RLS/RPC, React Query, Radix Tabs.

## Global Constraints

- The page keeps fixed sections; rules and cat/dog care topics may be added, removed, edited, and reordered.
- The current Traditional Chinese copy and existing English labels/notices remain explicit fields; no translation-management system is introduced.
- The migration seeds the exact current wording as published revision 1 before database-backed reads are enabled.
- Published revisions are immutable, only one draft is editable, and restore creates a new draft without rewriting history.
- Draft preview is authenticated and never changes anonymous output.
- Only an administrator may publish or restore; staff may edit and preview according to existing admin access rules.
- Content is plain text only: HTML, scripts, URLs, and arbitrary markup are rejected.
- Public output selects only a validated published revision; provider failures use the existing route error boundary and never substitute draft or empty authoring content.
- Use the existing fee, estate, and guide-release models and editors as the source of truth for those structured resources.
- Keep API responses `Cache-Control: no-store` and map failures to 401, 403, 409, 422, and sanitized 500 responses.

---

### Task 1: Define the copy contract and seed the versioned page document

**Files:**
- Create: `src/lib/adoptionInstructions/types.ts`
- Create: `src/lib/adoptionInstructions/schemas.ts`
- Create: `src/lib/adoptionInstructions/content.ts`
- Create: `src/lib/adoptionInstructions/schemas.test.ts`
- Create: `supabase/migrations/20260802100000_adoption_instruction_page_cms.sql`

**Interfaces:**
- Produces `AdoptionInstructionContent`, `AdoptionInstructionRevision`, `AdoptionInstructionPageState`, and `adoptionInstructionContentSchema` for every later task.
- `content.ts` exports `ADOPTION_INSTRUCTIONS_PAGE_KEY`, `initialAdoptionInstructionContent`, and `initialAdoptionInstructionContentJson` so tests can compare the application contract with the SQL seed.

- [ ] **Step 1: Write schema tests for the required document and plain-text rules**

  Add tests that parse `initialAdoptionInstructionContent`, accept a reordered topic list with stable IDs, reject an empty required title, reject duplicate rule/topic IDs, reject a string containing `<script>`, and reject a string containing `https://`. Use the exact Zod entry point:

  ```ts
  const parsed = adoptionInstructionContentSchema.safeParse(initialAdoptionInstructionContent);
  expect(parsed.success).toBe(true);
  expect(adoptionInstructionContentSchema.safeParse({
    ...initialAdoptionInstructionContent,
    hero: { ...initialAdoptionInstructionContent.hero, title: "" },
  }).success).toBe(false);
  expect(adoptionInstructionContentSchema.safeParse({
    ...initialAdoptionInstructionContent,
    rules: { ...initialAdoptionInstructionContent.rules, items: [
      initialAdoptionInstructionContent.rules.items[0],
      initialAdoptionInstructionContent.rules.items[0],
    ] },
  }).success).toBe(false);
  expect(adoptionInstructionContentSchema.safeParse({
    ...initialAdoptionInstructionContent,
    hero: { ...initialAdoptionInstructionContent.hero, description: "<script>alert(1)</script>" },
  }).success).toBe(false);
  expect(adoptionInstructionContentSchema.safeParse({
    ...initialAdoptionInstructionContent,
    hero: { ...initialAdoptionInstructionContent.hero, description: "https://example.test" },
  }).success).toBe(false);
  ```

  Also read `supabase/migrations/20260802100000_adoption_instruction_page_cms.sql` as UTF-8 and assert that it contains `initialAdoptionInstructionContentJson`; this keeps the SQL seed reviewable against the application seed rather than silently drifting.

- [ ] **Step 2: Run the focused test to verify the contract is not implemented**

  Run `bun test src/lib/adoptionInstructions/schemas.test.ts`. Expected result: FAIL because the new module and schema do not exist yet.

- [ ] **Step 3: Implement the typed content contract and exact seed document**

  Define the JSON shape with these fields and stable item IDs: `hero` (`eyebrow`, `title`, `description`); `fees` (`sectionTitle`, `dogTitle`, `catTitle`, `itemLabel`, `amountLabel`, `notice`); `estates` (`sectionTitle`, `introduction`, `estateLabel`, `districtLabel`, `notesLabel`, `emptyState`); `guides` (`sectionTitle`, `catTitle`, `dogTitle`, `generalTitle`, `zhHkActionLabel`, `enActionLabel`); `rules` (`title`, `items[]` of `{ id, text }`); and `care.cat`/`care.dog` (`title`, `topics[]` of `{ id, value, label, content }`). Use `z.string().trim().min(1)` with bounded lengths, regex IDs `^[a-z0-9][a-z0-9_-]{0,79}$`, and a shared `plainText` refinement that rejects `<`, `>`, `javascript:`, `https://`, `http://`, and `www.`. Enforce at most 50 rules and 30 topics per species, and reject duplicate IDs within each collection.

  Copy the current values from `src/routes/adoption/instructions.tsx` exactly into `initialAdoptionInstructionContent`; do not retain a second runtime constant in the route. Export the JSON string with `JSON.stringify(initialAdoptionInstructionContent)` for seed-parity tests.

- [ ] **Step 4: Add the additive Supabase schema, seed, grants, and invariants**

  In one migration, create `public.adoption_instruction_pages` keyed by `page_key = 'adoption-instructions'`, `public.adoption_instruction_revisions` with `revision_number`, `state` (`draft`, `published`, `archived`), `content jsonb`, `source_revision_id`, `version`, actor/timestamp columns, and `public.adoption_instruction_publish_requests` for idempotency. Add foreign keys after both tables exist, a unique `(page_key, revision_number)`, partial unique indexes for one draft and one published revision, and checks for positive versions and the singleton page key. Insert the singleton pointer and revision 1 using the exact JSON from the current page.

  Enable RLS, grant server-side access to `service_role`, revoke direct anonymous/authenticated writes, and add the existing staff/admin read/write policies. Add the atomic security-invoker RPCs `ensure_adoption_instruction_draft`, `update_adoption_instruction_draft`, `publish_adoption_instruction_page`, and `restore_adoption_instruction_revision`; each RPC must lock the singleton/revision rows, verify an active actor from `admin_user`, enforce expected version, validate the JSON shape with the database checks, update pointers atomically, and insert an `audit_log` row. Publishing archives the prior pointer, clears the draft pointer, and records the idempotency result. Restoring copies the selected historical content into a new draft with `source_revision_id`.

- [ ] **Step 5: Run contract and migration checks**

  Run `bun test src/lib/adoptionInstructions/schemas.test.ts` and `git diff --check -- supabase/migrations/20260802100000_adoption_instruction_page_cms.sql`. Expected result: the schema tests pass, the migration has no whitespace errors, and the migration contains the singleton seed, RLS, partial unique indexes, and all four RPC names.

- [ ] **Step 6: Commit the standalone contract/migration unit**

  Run:

  ```bash
  git add src/lib/adoptionInstructions supabase/migrations/20260802100000_adoption_instruction_page_cms.sql
  git commit -m "feat: add adoption instructions page schema"
  ```

### Task 2: Implement repository, service, and admin HTTP boundaries

**Files:**
- Create: `src/lib/adoptionInstructions/repository.server.ts`
- Create: `src/lib/adoptionInstructions/service.ts`
- Create: `src/lib/adoptionInstructions/http.server.ts`
- Create: `src/lib/adoptionInstructions/service.test.ts`
- Create: `src/lib/adoptionInstructions/http.server.test.ts`
- Create: `src/routes/api/admin/adoption-instructions.ts`
- Create: `src/routes/api/admin/adoption-instructions/preview.ts`
- Create: `src/routes/api/admin/adoption-instructions/publish.ts`
- Create: `src/routes/api/admin/adoption-instructions/restore.ts`

**Interfaces:**
- `createSupabaseAdoptionInstructionRepository(client)` implements `AdoptionInstructionRepository` with `getAdminPage`, `getPublished`, `ensureDraft`, `updateDraft`, `publish`, `restore`, and `listHistory`.
- `createAdoptionInstructionService({ repository, now })` exposes `getAdminPage`, `ensureDraft`, `updateDraft`, `preview`, `publish`, and `restore`; all inputs are parsed by Task 1 schemas.
- HTTP routes expose `GET /api/admin/adoption-instructions`, `POST /api/admin/adoption-instructions/draft`, `PUT /api/admin/adoption-instructions/draft`, `GET /api/admin/adoption-instructions/preview`, `POST /api/admin/adoption-instructions/publish`, and `POST /api/admin/adoption-instructions/restore`.

- [ ] **Step 1: Write service tests for clone, optimistic locking, publish, and restore behavior**

  Use an in-memory fake repository implementing the interface and assert these exact calls/results: `ensureDraft` clones the published content only when no draft exists; `updateDraft` passes `expectedVersion` and increments the returned version; a stale version throws `AdoptionInstructionConflictError`; `publish` rejects a staff actor before touching the repository and passes `idempotencyKey` to an admin actor; and `restore` passes `sourceRevisionId` while leaving the historical revision unchanged.

- [ ] **Step 2: Run the service tests to verify they fail**

  Run `bun test src/lib/adoptionInstructions/service.test.ts`. Expected result: FAIL because the repository/service modules do not exist.

- [ ] **Step 3: Implement the repository and service interfaces**

  Define `AdoptionInstructionError` with `code: "unauthorized" | "forbidden" | "not_found" | "conflict" | "validation" | "internal"` and `status: 401 | 403 | 404 | 409 | 422 | 500`. Map snake_case Supabase rows into the typed revision/page objects with Zod `safeParse`; throw `new AdoptionInstructionError("internal", 500)` for malformed rows. The repository invokes the four RPCs with `p_actor_user_id`, `p_expected_version`, `p_content`, `p_revision_id`, and `p_idempotency_key`, and maps SQLSTATE `40001`/`23514`/`42501`/`P0002` to conflict, validation, forbidden, and not-found service errors. The service must call `adoptionInstructionContentSchema.parse` before update/publish, require `role === "admin"` for publish/restore, attach ISO timestamps through `now`, and never mutate a published revision in place.

  Use these signatures so later tasks have a stable boundary:

  ```ts
  type AdoptionInstructionActor = { authUserId: string; role: "staff" | "admin" };
  type UpdateDraftInput = { actor: AdoptionInstructionActor; expectedVersion: number; content: unknown };
  type PublishInput = { actor: AdoptionInstructionActor; expectedVersion: number; idempotencyKey: string };
  type RestoreInput = { actor: AdoptionInstructionActor; revisionId: string };
  ```

- [ ] **Step 4: Write HTTP tests for all authorization and error mappings**

  Assert that unauthenticated requests return 401, staff GET/draft/update/preview requests return 200, staff publish/restore requests return 403, malformed content returns 422 with field paths, stale updates return 409, and every response has `cache-control: no-store`. Assert the preview response contains draft content while the public repository mock remains unchanged.

- [ ] **Step 5: Implement the HTTP handlers and route adapters**

  Follow `src/lib/adoptionGuideReleases/http.server.ts`: parse JSON with a Zod error for invalid bodies, call `requireAdmin(request, ["staff", "admin"], client)`, map the authenticated user to `AdoptionInstructionActor`, and wrap all errors in sanitized JSON. Require `role === "admin"` in the publish and restore handlers. The base route owns GET and draft POST/PUT; the preview, publish, and restore route files delegate to the same handler factory. Do not expose the service-role client or raw Supabase errors in response bodies.

- [ ] **Step 6: Run the focused service/HTTP tests and typecheck**

  Run `bun test src/lib/adoptionInstructions/service.test.ts src/lib/adoptionInstructions/http.server.test.ts` and `bun typecheck`. Expected result: both tests pass and TypeScript reports no new errors; TanStack route generation may update its generated route tree as part of typechecking.

- [ ] **Step 7: Commit the domain/API unit**

  Run:

  ```bash
  git add src/lib/adoptionInstructions src/routes/api/admin/adoption-instructions
  git commit -m "feat: add adoption instructions cms service"
  ```

### Task 3: Read published copy and render authenticated previews

**Files:**
- Modify: `src/lib/adoptionInformation/publicPage.server.ts`
- Modify: `src/lib/adoptionInformation/publicPage.functions.ts`
- Modify: `src/routes/adoption/instructions.tsx`
- Create: `src/routes/admin/content/adoption-preview.tsx`
- Modify: `src/lib/adoptionInformation/publicPage.server.test.ts`
- Modify: `src/routes/adoption/instructions.test.tsx`
- Create: `src/routes/admin/content/adoption-preview.test.tsx`

**Interfaces:**
- Extend `PublicAdoptionPageData` with `copy: AdoptionInstructionContent`.
- `createPublicAdoptionPageReader` accepts `loadCopy: () => Promise<AdoptionInstructionContent>` and continues to read fees, estates, and guide slots concurrently.
- The public page keeps the existing fixed layout; the only source change is replacing hard-coded copy with `data.copy`.

- [ ] **Step 1: Add failing reader and rendering tests**

  Extend the public reader fixture with `loadCopy`, assert the returned object includes the supplied copy, and assert an unpublished/draft copy is never selected by the public loader. In `instructions.test.tsx`, pass a copy containing a non-`home` first topic and custom labels, then assert the markup contains those labels and uses the first topic value rather than a hard-coded `home`.

- [ ] **Step 2: Run the focused public tests to verify failure**

  Run `bun test src/lib/adoptionInformation/publicPage.server.test.ts src/routes/adoption/instructions.test.tsx`. Expected result: FAIL because the reader and renderer still require hard-coded arrays and do not expose `data.copy`.

- [ ] **Step 3: Implement published-copy loading**

  Add `createSupabaseAdoptionInstructionRepository(client).getPublished()` to `createPublicAdoptionPageReaderFromClient`. Load copy, existing adoption information, and guide slots in one `Promise.all`; parse the selected revision through `adoptionInstructionContentSchema`; reject a non-published or invalid row. Keep `loadPublicAdoptionPage` wrapping provider failures in the existing `Error("Could not load adoption information")` boundary. Do not add a database-outage fallback that could silently render authoring data.

- [ ] **Step 4: Replace route literals with the validated document**

  Delete `adoptionRules`, `catCareTopics`, and `dogCareTopics` from `src/routes/adoption/instructions.tsx`. Use `data.copy.hero`, `data.copy.fees`, `data.copy.estates`, and `data.copy.guides` for every heading, notice, table label, empty state, guide label, and button. Render rules with `item.id` as the React key. Render each Radix Tabs root with `defaultValue={topics[0]?.value}` and render the section only when it has at least one topic, so add/remove/reorder operations never leave an invalid default tab. Preserve the current classes and layout.

- [ ] **Step 5: Add the authenticated preview route**

  Create `/admin/content/adoption-preview` behind `requireAdminPageAccess("contentManagement")`. The route fetches `GET /api/admin/adoption-instructions/preview` with the browser session and renders `AdoptionInstructionsContent` with the returned page data, without the admin layout. The preview endpoint combines the draft copy with the normal published fees, estates, and guide slots. Anonymous requests to the endpoint receive 401/403 and the public `/adoption/instructions` route never reads the draft pointer.

- [ ] **Step 6: Run public and preview tests**

  Run `bun test src/lib/adoptionInformation/publicPage.server.test.ts src/routes/adoption/instructions.test.tsx src/routes/admin/content/adoption-preview.test.tsx` and `bun typecheck`. Expected result: all focused tests pass, custom copy appears in the rendered page, the draft remains isolated from the public reader, and the preview route is type-safe.

- [ ] **Step 7: Commit the public/preview unit**

  Run:

  ```bash
  git add src/lib/adoptionInformation/publicPage.server.ts src/lib/adoptionInformation/publicPage.functions.ts src/routes/adoption/instructions.tsx src/routes/admin/content/adoption-preview.tsx src/lib/adoptionInformation/publicPage.server.test.ts src/routes/adoption/instructions.test.tsx src/routes/admin/content/adoption-preview.test.tsx
  git commit -m "feat: render adoption instructions from published copy"
  ```

### Task 4: Add the page-content editor to the adoption CMS workspace

**Files:**
- Create: `src/components/admin/content/AdoptionInstructionsManagement.tsx`
- Create: `src/components/admin/content/AdoptionInstructionsManagement.test.tsx`
- Modify: `src/components/admin/content/AdoptionInformationManagement.tsx`
- Modify: `src/components/admin/content/AdoptionInformationManagement.test.tsx`

**Interfaces:**
- `AdoptionInstructionsManagement` owns the React Query fetch/mutations and renders `AdoptionInstructionsManagementView`.
- `AdoptionInstructionsManagementView` receives `{ data, loading, error, pending, onSave, onPreview, onPublish, onRestore }` and remains render-testable without a browser.
- Export `ADOPTION_INSTRUCTIONS_QUERY_KEY` and `buildAdoptionInstructionMutation` so tests can assert request payloads without mocking Supabase.

- [ ] **Step 1: Write component tests for the editor states and controls**

  Render a fixture containing hero fields, two rules, and one topic per species. Assert the `頁面內容` tab is present beside `領養費用` and `可養狗屋苑`, every current section label is visible, add/remove/reorder buttons carry accessible names, draft status/version and validation errors are announced, the preview action points to `/admin/content/adoption-preview`, and publish/restore controls are absent for a staff fixture but present for an admin fixture.

- [ ] **Step 2: Run the focused component tests to verify failure**

  Run `bun test src/components/admin/content/AdoptionInstructionsManagement.test.tsx src/components/admin/content/AdoptionInformationManagement.test.tsx`. Expected result: FAIL because the page-content tab and editor do not exist.

- [ ] **Step 3: Implement the editor view with stable IDs and ordered collections**

  Build controlled inputs for hero, fees, estates, guides, rules, cat topics, and dog topics. New rules/topics receive a generated stable ID and a slug-like `value`; remove updates local state immediately; move up/down swaps array entries without changing IDs; labels/content are plain text inputs/textareas with the same maximum lengths as Task 1. Keep the existing fee and estate editors unchanged and link to `/admin/content/adoption-guides` for document releases. Show the current published revision, active draft version, last-updated actor/time, and field-level validation errors from 422 responses.

- [ ] **Step 4: Implement draft save, conflict preservation, preview, publish, and restore actions**

  Use `fetchAdminJson`/React Query with the exact request bodies `{ expectedVersion, content }`, `{ expectedVersion, idempotencyKey }`, and `{ revisionId }`. On 409, keep the local form values and show the server version so the staff member can reload deliberately. Preview opens the authenticated preview route in a new tab. Publish is disabled for non-admins and disabled while validation issues exist. History rows call restore, then refresh the draft without changing the published badge.

- [ ] **Step 5: Integrate the new surface without changing existing fee/estate behavior**

  Extend the parent tab union with `"page"`, preserve `fees` as the initial tab, and render `AdoptionInstructionsManagement` only for that tab. Keep `invalidateAdoptionInformationQueries` behavior for fee/estate mutations and add a separate `ADOPTION_INSTRUCTIONS_QUERY_KEY` invalidation for page mutations. Update the existing component test to assert all three tabs and the existing guide-release link.

- [ ] **Step 6: Run focused UI tests and typecheck**

  Run `bun test src/components/admin/content/AdoptionInstructionsManagement.test.tsx src/components/admin/content/AdoptionInformationManagement.test.tsx` and `bun typecheck`. Expected result: all editor-state tests pass, existing fee/estate tests remain green, and no generated route/type errors appear.

- [ ] **Step 7: Commit the CMS editor unit**

  Run:

  ```bash
  git add src/components/admin/content/AdoptionInstructionsManagement.tsx src/components/admin/content/AdoptionInstructionsManagement.test.tsx src/components/admin/content/AdoptionInformationManagement.tsx src/components/admin/content/AdoptionInformationManagement.test.tsx
  git commit -m "feat: add adoption instructions page editor"
  ```

### Task 5: Verify migration, behavior, and release safety

**Files:**
- Modify: `src/routes/adoption/instructions.test.tsx` if the final route assertions need additional coverage.
- Modify: `src/lib/adoptionInstructions/http.server.test.ts` if integration fixtures need the final error contract.
- Modify: `docs/superpowers/specs/2026-08-01-adoption-instructions-cms-design.md` only if an implementation-discovered contract correction is approved before release.

**Interfaces:**
- No new runtime interfaces; this task verifies the completed boundaries from Tasks 1–4.

- [ ] **Step 1: Run the complete focused test matrix**

  Run:

  ```bash
  bun test src/lib/adoptionInstructions src/lib/adoptionInformation/publicPage.server.test.ts src/routes/adoption/instructions.test.tsx src/routes/api/admin/adoption-instructions src/routes/admin/content/adoption-preview.test.tsx src/components/admin/content/AdoptionInstructionsManagement.test.tsx src/components/admin/content/AdoptionInformationManagement.test.tsx
  ```

  Expected result: all new and touched-surface tests pass. Any unrelated pre-existing failure must be reported separately from a new regression.

- [ ] **Step 2: Run repository quality checks**

  Run `bun typecheck`, `bun lint`, `bun build`, and `git diff --check`. Expected result: TypeScript, ESLint, production build, and whitespace checks pass. The generated TanStack route tree may change only as a deterministic consequence of the new route files.

- [ ] **Step 3: Apply the migration in the authorized Supabase environment and verify invariants**

  Apply `supabase/migrations/20260802100000_adoption_instruction_page_cms.sql` through the existing authorized migration workflow. Verify one singleton page row, published revision 1 containing the exact seed copy, no draft before the first edit, RLS enabled, anonymous writes rejected, and the four RPCs present. Do not publish a user-authored change during this verification.

- [ ] **Step 4: Exercise the end-to-end draft isolation flow**

  As staff, create/save a draft with a changed hero title, reorder a topic, preview it, and confirm the authenticated preview shows the change. Fetch anonymous `/adoption/instructions` before and after the draft save and assert the response still contains the revision-1 title. As admin, publish with an idempotency key, assert the public page changes only after publish, restore revision 1 into a new draft, and confirm history still contains every prior revision.

- [ ] **Step 5: Capture final smoke evidence and commit verification metadata**

  Record the migration revision, test commands, deployment/route HTTP status, and the anonymous-versus-preview-versus-published observations in the task report. Keep `.superpowers/sdd/task-1-report.md` changes separate from feature commits unless explicitly requested.

- [ ] **Step 6: Commit the verified integration state**

  Run:

  ```bash
  git add src docs supabase/migrations/20260802100000_adoption_instruction_page_cms.sql
  git commit -m "test: verify adoption instructions cms workflow"
  ```
