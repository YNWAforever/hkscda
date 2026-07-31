# Adoption Instructions CMS Design

## Status

Approved through brainstorming on 2026-08-01. This specification covers the CMS for the public `/adoption/instructions` page.

## Goals

- Let staff edit all remaining static page copy without editing source code.
- Keep adoption rules and cat/dog care topics ordered, addable, removable, and editable.
- Preserve the current public wording as the initial published version.
- Keep fees, dog-friendly estates, and bilingual guide PDFs in their existing purpose-built CMS workflows.
- Require draft preview and administrator publication.
- Provide auditable version history and non-destructive restoration.
- Ensure an invalid or incomplete draft can never replace the last published page.

## Non-goals

- A free-form page builder or arbitrary section rearrangement.
- Replacing the existing fee, estate, document, or guide-release data models.
- Changing the public page layout or visual design as part of this work.
- Introducing a separate translation management system; the current Traditional Chinese copy and existing English labels/notices remain explicit fields.

## Current context

The public page currently combines three structured data sources with hard-coded copy:

- published adoption fees;
- published dog-friendly estate rows;
- published post-adoption guide document slots or coordinated guide releases.

The remaining hard-coded content is the page heading and introduction, section labels and notices, twelve adoption rules, and the cat and dog care topic tabs. The existing admin adoption workspace already edits fees and estates and links to the guide-release workspace.

## Chosen architecture

Add a dedicated versioned page-document model for static copy. The public loader reads one published copy revision and combines it with the existing fee, estate, and guide readers. The admin adoption workspace gains a `頁面內容` surface for the new model while retaining the existing `領養費用`, `可養狗屋苑`, and `領養後指南版本` surfaces.

This boundary keeps the page coherent at publish time without duplicating the specialized operational data models. Published revisions are immutable. At most one draft is editable for the singleton page.

## Data model

### `adoption_instruction_pages`

Singleton metadata row keyed by `page_key = 'adoption-instructions'`:

- `page_key` primary key;
- `published_revision_id` nullable reference to the active published revision;
- `draft_revision_id` nullable reference to the active draft;
- `updated_at`, `updated_by`;
- created/updated audit timestamps as required by repository conventions.

### `adoption_instruction_revisions`

Revision rows contain:

- UUID `id`;
- page key/reference;
- monotonically increasing `revision_number`;
- state: `draft`, `published`, or `archived`;
- validated `content` JSONB;
- `source_revision_id` for restore provenance;
- created/updated/published timestamps and actor IDs;
- optimistic-lock version or equivalent revision check.

The migration seeds the current hard-coded wording as published revision 1. Publishing changes the page pointer atomically, archives the previous published revision, and clears the draft pointer. The next edit clones the current published revision into one new draft. Restoring a historical revision clones its content into a new draft; it never rewrites or deletes history.

## Content contract

The JSON document contains plain text only:

- `hero`: eyebrow, title, and description;
- `fees`: section title, dog title, cat title, and disclaimer/notice copy;
- `estates`: section title, introduction, column labels, and empty-state copy;
- `guides`: section title, species headings, Chinese action label, English action label, and legacy/general heading;
- `rules`: ordered items with stable IDs and text;
- `care.cat`: title and ordered topics with stable IDs, value keys, labels, and content;
- `care.dog`: title and ordered topics with stable IDs, value keys, labels, and content.

Validation enforces non-empty required fields, bounded text lengths, stable item IDs, maximum collection sizes, and plain-text values. HTML, scripts, URLs, and arbitrary markup are rejected. Item IDs remain stable when labels or content change so reordering does not create duplicate records or break saved drafts.

## Admin workflow

1. Staff opens `頁面內容` in the existing adoption CMS workspace.
2. The editor loads the current draft, or creates a draft clone from the published revision.
3. Staff edits fields, adds/removes/reorders rule items and care topics, and saves with an expected revision/version.
4. A stale save returns a conflict and preserves the editor's local values for review.
5. `預覽公開頁面` opens the public page shell with the authenticated draft payload in the current admin session; it does not alter the public pointer or expose the draft to anonymous visitors.
6. An administrator reviews the validation/readiness summary and publishes the draft.
7. The publish transaction validates the complete document, records an audit event, archives the previous published revision, and switches the published pointer atomically.
8. Version history lists published and archived revisions. `恢復為草稿` copies a selected revision into a new draft with provenance; publication remains an explicit administrator action.

Fees, estates, and guide PDFs continue to use their existing editors and publication controls. The page-content editor links to those surfaces rather than duplicating their forms.

## Public data flow

`loadPublicAdoptionPage` reads the published copy revision and existing published information concurrently. The route renders the fixed existing layout from the validated copy fields and the existing structured data. A draft is never selected by the public loader.

The public loader selects only a validated published revision through the page pointer. Invalid or incomplete drafts are never eligible for public output. If the provider query fails, the existing route error boundary handles the provider failure and logs it; during rollout, the seed migration completes before the application switches to database-backed copy reads, so a published revision is guaranteed at the cutover boundary.

## Authorization and error handling

- Anonymous users can read only the published public projection.
- Authenticated staff/admin users can read and edit the draft according to the existing admin access rules.
- Only admins can publish or restore.
- Draft and revision tables use RLS and explicit grants; direct anonymous writes are revoked.
- API responses use stable no-store JSON errors: 401 unauthenticated, 403 unauthorized, 409 stale version, 422 validation failure, and sanitized 500 provider failures.
- Audit records include create/update/publish/restore actions and actor IDs, without storing secrets or draft file contents outside the revision document.

## Verification plan

- migration safety tests verify RLS, grants, seed content, version constraints, and publish invariants;
- schema tests cover required copy, item limits, stable IDs, and plain-text rejection;
- repository/service tests cover draft cloning, optimistic locking, publication, archive/restore, and audit events;
- API tests cover authorization, validation, conflict, preview, publish, and restore responses;
- component tests cover tabs, editors, add/remove/reorder controls, loading/error states, and admin-only actions;
- public route tests verify the seeded wording, published-only selection, draft isolation, and provider-error handling;
- production smoke checks verify `/adoption/instructions` remains HTTP 200 and unchanged before the first intentional content publish.

## Rollout and recovery

1. Apply the additive schema migration and seed revision 1.
2. Deploy the CMS and public loader changes.
3. Verify the public page against the seeded revision and existing fee/estate/guide data.
4. Open the admin editor, make a non-publishing draft, preview it, and verify anonymous visitors still see revision 1.
5. Publish only after admin review.

If a published copy change is wrong, restore the last known-good revision into a draft and publish it, or roll back the application deployment. No destructive data deletion is required for normal recovery.

## Acceptance criteria

- All current static wording is editable in the CMS and initially matches production exactly.
- Rules and cat/dog care topics support add, remove, edit, and reorder.
- Fees, estates, and guide releases remain available through their existing CMS controls.
- Draft preview never changes anonymous output.
- Only admins can publish or restore.
- Every publish/restore is versioned and audited.
- Public output always comes from a validated published revision; provider failures use the existing route error boundary and do not substitute draft or empty authoring content.
