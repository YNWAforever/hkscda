# Story & Promotion Center — completion design

Status: approved by the user on 2026-09-14; ready for an implementation plan.

## Summary

The Story & Promotion Center (spec `2026-07-05-story-promotion-center-design.md`) is substantially built — DB schema and RLS, public-safe projections, the revision lifecycle, and private media all exist and are sound. What is missing is the work that makes the authoring → publish → social/adopter loop usable end to end: there is no create screen, publish validation is not field-level, adopter drafts are manual, several list filters and the linked-record picker do not exist, social copy is read-only, and the public story card/detail ignore the content's own CTA and animal type.

This design closes those gaps inside the existing layered content domain. It deliberately does not clean up dead code, change public cache headers, or rewrite the editor.

## Current state (from the 2026-09-14 audit)

- **DB:** all seven spec tables exist with the spec columns; RLS is enabled everywhere; `treasurer` is denied; internal location fields are stripped from the published snapshot. `read_content_admin_summaries` and `read_content_authoring_detail` are service_role-only reads.
- **Public safety:** multiple independent projections (`toPublicContentDetail`, `buildPublicContentSnapshot`, SQL snapshot, `projectPublicStory`) all strip internal fields and non-public updates/media. No leak found.
- **Gaps addressed here:** no `/admin/content/new`; publish errors are generic (the field-level `rules.ts` validator is unreachable on the lifecycle path); adopter drafts are manual and there is no no-recipient warning; four list filters are absent from UI and schema; linked records use a raw ID box; social copy cannot be edited; public CTA is hardcoded and animal type is not shown as text; there is no related-stories section.
- **Out of scope (unchanged):** `contentListRead.server.ts` is an unused parallel read path with a large test suite; `$id/media-finalize.ts` duplicates `$id/media.ts`; `listPublicContent` is unreachable; `/api/stories` is deliberately cacheable while the spec says `no-store`.

## Goals

1. Staff can create a content draft from the admin UI and reach the editor.
2. Publish failures return field-level errors the editor renders.
3. Saving a story update with `should_generate_adopter_drafts` creates adopter drafts automatically, or a non-blocking warning when none can be resolved.
4. The admin list supports publish-date, map-visibility, update-presence, and notification-draft-state filters, applied before pagination.
5. Linked records are chosen through a search picker, not a raw ID.
6. Social copy variants are editable and saveable.
7. Public story cards/detail use the content's own CTA, show animal type, and offer related stories.

## Non-goals

- Dead-code cleanup (`contentListRead.server.ts`, duplicate `media-finalize`, unreachable `listPublicContent`).
- Changing the `/api/stories` cache header.
- Rewriting the editor into tabs.
- Direct social-API publishing or automatic sending.
- New content types or a rich-text editor.

## Workstreams

### WS1 — Admin authoring loop

#### Create flow

- New route `src/routes/admin/content/new.tsx`, guarded by `requireAdminPageAccess("contentManagement")`. TanStack Router resolves the static `new` segment ahead of `$id`, so it no longer falls through to the editor's not-found state.
- New `src/components/admin/content/ContentCreateForm.tsx` with fields matching `contentInputSchema`: `type`, `title`, `slug`, `summary`, `body`, `ctaLabel`, `ctaUrl`, `seoTitle`, `seoDescription`, `ogTitle`, `ogDescription`. No cover — the editor adds media after creation and cover is not required for a draft.
- Slug: a pure `suggestSlug(title)` helper derives a slug when the title is ASCII; otherwise the field starts empty and is required manually. The schema enforces `^[a-z0-9]+(?:-[a-z0-9]+)*$`; the slug remains editable.
- Submit calls the existing `POST /api/admin/content`. `201` navigates to `/admin/content/$id`; `400` renders field-level errors from the response; `409` shows the slug-conflict message.
- `ContentManagement` gains a **建立內容** toolbar button linking to the new route.

#### List filters

Add an admin-only schema so the public search is untouched:

```ts
export const adminContentSearchSchema = contentSearchSchema.extend({
  publishedFrom: z.string().date().optional(),
  publishedTo: z.string().date().optional(),
  mapVisibility: z.enum(["on", "off"]).optional(),
  hasUpdate: z.enum(["yes", "no"]).optional(),
  draftState: z.enum(notificationDraftStatuses).optional(),
});
```

`publicContentSearchSchema` is unchanged; these filters never reach `/api/stories`. Semantics:

- `publishedFrom`/`publishedTo` filter `content_item.published_at`.
- `mapVisibility` requires `rescue_story_profile.show_on_map` = on/off.
- `hasUpdate` = `EXISTS (story_update for the item)`.
- `draftState` = `EXISTS (recipient_notification_draft for the item with that status)`.

Filters are applied **inside the admin-summaries read before pagination** by extending that read's parameters with the new predicates and `EXISTS` clauses; rows are never loaded and filtered in the app. Repository → handler → `ContentManagement` controls (date pair, two selects, draft-state select).

#### Linked-record search

- New `GET /api/admin/content/link-search?linkedType=<…>&q=<…>&limit=<≤20>`, admin-gated (`staff`/`admin`), `no-store`, following the route → `-handlers.ts` → `http.server.ts` → service → repository pattern.
- Response `{ results: [{ id, label, sublabel }] }`, hard-capped at 20. One bounded query per `linkedType`:
  - `animal` → name + type/code
  - `adoption_case` → case reference + adopter
  - `successful_adoption` → reference + animal
  - `supporter` → name + a masked contact hint (never the full address/phone)
  - `volunteer_activity` → title + date
- **Privacy:** results return only a minimal label/sublabel; no full contact values, internal notes, or private fields.
- New `src/components/admin/content/LinkedRecordPicker.tsx` (type select + debounced query + result list). Choosing a result fills `linkedType`/`linkedId`/`relationship` and submits through the existing `POST /api/admin/content/$id/links`. It replaces the raw "紀錄 ID" input in the editor's linked-records section.

#### Editable social copy

- Extend the existing status schema: `socialCopyUpdateSchema = { status?, copyText?, hashtags? }`; status-only calls keep working.
- Extend the service + repository `updateSocialCopy` to persist `copyText`/`hashtags` with an audit row, like other mutations.
- `SocialCopyPanel`: replace the read-only text with an editable textarea and a hashtags field plus Save, keeping the copy/archive actions and adding a dirty-state indicator.

### WS2 — Publishing & draft correctness

#### Field-level publish errors

- On the lifecycle publish path, before invoking the publish RPC, the service loads the content detail and runs the existing pure `validatePublishableContent` (`rules.ts`). The SQL RPC remains authoritative; the app check is the UX gate.
- Extend the validator for parity with the SQL rules: explicit rescue `animalType` and `publicStatus` checks, alongside title/slug/summary/cover/rescue-region/map fields. Remove the `publishedAt` requirement because the RPC sets it.
- On issues, the service returns a typed validation result and the publish handler responds
  `400 { error: { message, code: "validation" }, issues: [{ field, message }] }` with admin `no-store`.
- The editor already maps `body.issues` into `PublishValidationPanel`/`validationIssues`; it will populate from real failures.

#### Auto adopter drafts on save

- In the story-update create path, after the update persists, if `shouldGenerateAdopterDrafts` is true, run the existing recipient-resolution + draft-builder flow automatically and return `{ update, notificationDrafts: { created, warning } }`.
- Zero recipients: the update still saves and the response carries a non-blocking `warning`. Generation failures are caught and surfaced as a warning too; they never roll back the update.
- Idempotent: drafts dedupe per update/contact/channel, so the existing manual regenerate action does not duplicate.
- `ContentTimeline`/editor show "已建立 N 份通知草稿" or the warning text.

### WS3 — Public presentation

- **CTA:** `StoryCard` and `StoryDetail` use the content's `ctaLabel`/`ctaUrl` when present (already URL-validated at write time), otherwise the current donate CTA. `StoryContentGrid` already behaves this way for events/markets/reports.
- **Animal type:** render the `animalType` label as text on the story card and in the detail facts.
- **Related stories:** a new bounded public query returns up to 3 other **published** rescue stories, preferring the same `animalType` and then the same `rescueRegion`, excluding the current one, via the public-safe projection; `StoryDetail` renders a **相關故事** section.

## Error handling

- Publish validation returns field-level issues (not a generic failure).
- Zero resolvable recipients and draft-generation failures are non-blocking warnings; the update persists.
- Slug conflicts keep staff in the editor and show the existing conflict message.
- Linked-record search returns empty results rather than erroring on an unknown type or blank query.
- No public response exposes `internal_address`/`internal_location_notes`, internal updates, notification drafts, or social copies.

## Testing

- **WS1:** `adminContentSearchSchema` unit tests; repository tests (fake client) proving filters apply before pagination with `EXISTS` for update/draft presence; `ContentCreateForm` render + submit/redirect + 409 + 400 issues; `suggestSlug` pure test; `link-search` handler/service/repo tests (bounded ≤20, per-type mapping, admin gate, no full contact); `LinkedRecordPicker` selection; `SocialCopyPanel` edit→save.
- **WS2:** per-content-type publish validation (event/charity_market/report/rescue); service returns `issues`; HTTP publish returns `400 { issues }`; editor renders `PublishValidationPanel` from a real failure; auto-draft on save; zero-recipient warning; generation-failure warning with update persisted; idempotent regeneration; recipient resolution from linked adoption records; draft status transitions.
- **WS3:** card/detail CTA from content fields; animal-type text; related stories bounded, published-only, excludes current, public-safe; `StoryDetail` timeline asserted with real updates; internal-field leak regression tests.

Gates: `bun test`, `bunx tsc --noEmit`, `bun run lint`, `bun run build`.

## Acceptance

A staff member can create a draft, edit it, add a cover/links/updates, publish (seeing field-level errors when invalid), generate/edit/mark social copy, and save an update with the drafts toggle to receive drafts or a warning. `/stories` and `/stories/$slug` show the correct CTA, animal type, and related stories, with no internal fields.

## Sequencing

1. WS2 — publishing and draft correctness (small, unblocks correct publishing).
2. WS1 create flow.
3. WS1 remaining (filters, link search, social-copy editing).
4. WS3 — public presentation.

## Risks

- The filters change the admin-summaries SQL read; a migration must apply the new predicates before pagination and keep the read service_role-only with its `search_path` pinned, satisfying `supabaseMigrations.test.ts`.
- `link-search` touches five domains' tables; queries must be bounded and return no PII beyond a label.
- Auto-generation on save is a behaviour change; idempotency and the no-rollback guarantee are the main correctness risks.
