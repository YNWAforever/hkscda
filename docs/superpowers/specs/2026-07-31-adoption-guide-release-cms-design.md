# Adoption Guide Release CMS Design

**Date:** 2026-07-31
**Status:** Approved in conversation; awaiting written-spec review

## Objective

Add a release-oriented CMS workflow that lets staff prepare a bilingual adoption guide once and coordinate its publication across:

- the public adoption-information page;
- the public Knowledge Hub;
- the underlying document library.

The first rollout will prepare separate cat and dog guide releases. Each release may be saved as a draft with only its Chinese PDF, but it cannot be submitted for approval or published until both `zh-HK` and English PDFs are present and valid.

## Goals

- Give staff one workspace for assembling a bilingual adoption guide release.
- Require admin approval before public publication.
- Preview both affected public surfaces before approval.
- Publish all public projections atomically so users never see a partially updated release.
- Keep superseded releases as archived history rather than deleting their files.
- Reuse the workflow for future cat, dog, and general adoption-guide topics.
- Preserve the existing Documents, Adoption Information, and Knowledge ownership boundaries.

## Non-goals

- Editing PDF contents inside the CMS.
- Automatically translating a PDF or generating the missing English edition.
- Publishing a single-language release.
- Deleting superseded assets or historical releases.
- Replacing the existing fee, estate, or adoption-instruction editors.
- Introducing a general-purpose workflow engine for unrelated CMS content.

## Existing Context and Constraints

The current application separates three concerns:

- Documents owns PDF assets, upload verification, publication state, and document slots.
- Adoption Information owns fees, estates, and the adoption-page presentation.
- Knowledge owns searchable Knowledge Hub posts and their public destinations.

The adoption page currently reads the published `post_adoption_guide` document slot. A Knowledge post currently supports one external or document destination. A coordinated bilingual release therefore cannot be represented safely by updating the existing surfaces independently.

The release domain will orchestrate those existing domains rather than duplicate their responsibilities.

## Chosen Architecture

Introduce a dedicated `adoptionGuideReleases` domain with the same layered shape as the established content domains:

- schemas and domain types;
- repository interfaces and Supabase implementation;
- service-level authorization and workflow rules;
- HTTP handlers and admin routes;
- public projection readers only where the existing readers need extension.

The central release record is the source of coordination and workflow state. Documents remains the source of truth for assets; Knowledge remains the source of truth for public card content; Adoption Information continues to consume published document slots.

### Release Model

Each adoption-guide release contains:

| Field                          | Purpose                                          |
| ------------------------------ | ------------------------------------------------ |
| `id`                           | Stable UUID                                      |
| `topic`                        | Reusable topic identifier                        |
| `species`                      | `cat`, `dog`, or `general`                       |
| `zh_hk_asset_id`               | Chinese PDF asset reference                      |
| `en_asset_id`                  | English PDF asset reference                      |
| `knowledge_post_id`            | Managed Knowledge Hub post reference             |
| `knowledge_title`              | Public card title                                |
| `knowledge_topic`              | Knowledge filter/category value                  |
| `knowledge_short_intro`        | Public summary                                   |
| `knowledge_source_name`        | Displayed source                                 |
| `sort_order`                   | Ordering among releases/cards                    |
| `state`                        | `draft`, `in_review`, `published`, or `archived` |
| `version`                      | Optimistic-concurrency version                   |
| `created_by`, `updated_by`     | Authoring audit references                       |
| `submitted_by`, `submitted_at` | Review audit fields                              |
| `published_by`, `published_at` | Publication audit fields                         |
| `archived_by`, `archived_at`   | Archive audit fields                             |
| `created_at`, `updated_at`     | Record timestamps                                |

Asset and Knowledge post foreign keys protect references. Published releases additionally rely on database invariants enforced by the publication transaction.

### Knowledge Destination Extension

Extend the Knowledge destination model with a bilingual document-pair variant:

```ts
type KnowledgeDestination =
  | { type: "external"; url: string }
  | { type: "document"; assetId: string; url?: string }
  | {
      type: "document_pair";
      zhHkAssetId: string;
      enAssetId: string;
      zhHkUrl?: string;
      enUrl?: string;
    };
```

The public Knowledge card renders two explicit actions for this destination:

- `中文版`
- `English`

Existing external and single-document Knowledge posts remain backward compatible.

## Ownership and Public Projections

An adoption-guide release coordinates, but does not replace, the existing domains:

- **Documents:** validates and publishes the two PDF assets.
- **Adoption Information:** receives the release-managed guide slot projection used by the public adoption page.
- **Knowledge:** receives one release-managed post with a bilingual destination.
- **Adoption Guide Releases:** owns workflow state, readiness, preview, coordinated publication, archive history, and release audit events.

Each release manages a stable slot key derived from its topic/species, with compatibility for the current `post_adoption_guide` reader during migration. The public adoption page presents the active release appropriate to its agreed guide placement and exposes both language actions. The Knowledge Hub presents the same asset pair through one searchable card.

Only the release service may change projections marked as release-managed. Direct edits in Documents or Knowledge must either be disabled for those records or clearly redirect the operator to the adoption-guide workspace.

## Workflow and Permissions

### State Transitions

```text
draft -> in_review -> published -> archived
  ^         |
  |---------|
```

- Staff create and edit drafts.
- Staff may withdraw their own `in_review` release back to `draft`.
- Admins may return an `in_review` release to `draft`.
- Only admins may publish.
- Publishing a replacement archives the previously published release for the same topic/species.
- Archived releases are immutable historical records; a new draft is created for a later update.

### Readiness

A release may remain a draft while incomplete. Submission and publication both require:

- a verified `zh-HK` PDF asset;
- a verified English PDF asset;
- correct asset language metadata;
- PDF media type and safe storage paths;
- required Knowledge title, topic, summary, and source fields;
- valid ordering and topic/species values;
- no stale version conflict;
- no conflicting active release operation.

The CMS shows readiness failures before the user attempts submission.

### Roles

| Action                         | Staff | Admin |
| ------------------------------ | ----- | ----- |
| List and view releases/history | Yes   | Yes   |
| Create and edit a draft        | Yes   | Yes   |
| Submit for review              | Yes   | Yes   |
| Withdraw from review           | Yes   | Yes   |
| Return to draft                | No    | Yes   |
| Preview public projections     | Yes   | Yes   |
| Publish                        | No    | Yes   |

Existing server-side session and role checks remain authoritative. UI controls are convenience guards, not the security boundary.

## CMS Experience

Add `/admin/content/adoption-guides` as the primary workspace.

### Release List

The list supports:

- search;
- topic and species filters;
- workflow-state filters;
- readiness indicators;
- active and archived history;
- links to related managed assets and Knowledge posts;
- clear identification of the currently published release.

### Draft Editor

Use a five-step editor:

1. **Topic and species** — choose a reusable topic and `cat`, `dog`, or `general`.
2. **Chinese PDF** — select or upload the `zh-HK` asset.
3. **English PDF** — select or upload the English asset.
4. **Knowledge card** — edit title, topic, short introduction, source, and ordering.
5. **Preview and submit** — review readiness and both public projections.

The draft editor autosaves only through explicit, versioned mutations or provides a visible Save action; it must never hide a failed save. Pending mutations lock conflicting controls.

### Preview

Preview is generated from draft data without publishing it. It includes:

- the adoption-information guide panel with both language actions;
- the Knowledge Hub card with its topic, summary, source, and both actions;
- readiness and accessibility warnings;
- safe links to preview the selected PDFs.

Preview responses are authenticated, non-cacheable, and do not expose unpublished asset URLs through a public route.

### Cross-workspace Behavior

Documents and Knowledge remain available for unrelated content. Release-managed assets/posts display:

- the owning release and workflow state;
- a link back to the release workspace;
- guarded or disabled controls that could violate release invariants.

The existing Adoption Information editor retains fees and estates. It links to the adoption-guide release workspace for guide changes.

## API Design

All routes are authenticated admin APIs and return `Cache-Control: no-store`.

| Method  | Route                                                    | Purpose                          |
| ------- | -------------------------------------------------------- | -------------------------------- |
| `GET`   | `/api/admin/adoption-guide-releases`                     | Paginated list and filters       |
| `POST`  | `/api/admin/adoption-guide-releases`                     | Create draft                     |
| `GET`   | `/api/admin/adoption-guide-releases/:id`                 | Load release and readiness       |
| `PATCH` | `/api/admin/adoption-guide-releases/:id`                 | Versioned draft update           |
| `POST`  | `/api/admin/adoption-guide-releases/:id/submit`          | Submit ready draft               |
| `POST`  | `/api/admin/adoption-guide-releases/:id/withdraw`        | Staff withdrawal                 |
| `POST`  | `/api/admin/adoption-guide-releases/:id/return-to-draft` | Admin review return              |
| `GET`   | `/api/admin/adoption-guide-releases/:id/preview`         | Authenticated projection preview |
| `POST`  | `/api/admin/adoption-guide-releases/:id/publish`         | Atomic admin publication         |

Mutation payloads carry the expected `version`. A stale version returns `409` and the UI prompts the editor to reload rather than overwriting newer work.

### Error Contract

- `400` — invalid input or release not ready;
- `401` — no valid admin session;
- `403` — authenticated role lacks permission;
- `404` — release or referenced record not found;
- `409` — stale version, illegal transition, duplicate/conflicting release, or publication invariant failure;
- `500` — unexpected provider/internal failure with sensitive details redacted.

Validation errors use stable field paths so the editor can focus the affected step.

## Atomic Publication

Publication is one authenticated Supabase RPC/database transaction. The service performs authorization and request parsing, while the transaction rechecks every invariant against current database state.

The transaction:

1. Locks the requested release and verifies `in_review`, expected version, and admin actor.
2. Locks any currently published release for the same topic/species.
3. Revalidates both assets, language metadata, storage verification, and release readiness.
4. Publishes both document assets.
5. Upserts the release-managed Knowledge post with its bilingual destination.
6. Updates the appropriate release-managed adoption guide slot/projection.
7. Archives the previous published release, if present.
8. Marks the new release `published`.
9. Writes release, document, slot, and Knowledge audit records.
10. Commits all changes together.

Any failure rolls back every step. Public readers therefore see either the previous complete release or the new complete release, never a mixed state.

### Idempotency

The publish operation accepts an idempotency key. Replaying a completed request returns the existing publication result. Reusing a key for a different release or version returns `409`. The transaction also treats the same already-published release/version as a safe repeat rather than duplicating audit rows or posts.

## Initial Content Import

The supplied PDFs are two different Chinese-language guides, not two language editions of one guide:

| Draft release | Source file                                                  | Classification                  |
| ------------- | ------------------------------------------------------------ | ------------------------------- |
| Cat guide     | `What you need to know after adopting a cat (Completed).pdf` | `species=cat`, language=`zh-HK` |
| Dog guide     | `What you need to know after adoption (完成版).pdf`          | `species=dog`, language=`zh-HK` |

The rollout imports them as two separate draft releases. Their matching English assets remain empty. Both drafts show a blocking readiness message and cannot be submitted or published until the correct English PDFs are uploaded and selected.

No existing guide is replaced during import. Replacement and archival happen only when an admin publishes a complete release.

## Migration and Backward Compatibility

Use additive migrations:

- create the adoption-guide release and publish-idempotency tables;
- add workflow constraints, foreign keys, indexes, and row-level policies;
- add the atomic publication RPC;
- extend Knowledge destination persistence for `document_pair`;
- identify release-managed slots/posts without changing unrelated records.

Existing external and single-document Knowledge destinations continue to read and write unchanged. Existing public guide slots remain active until the first coordinated release is published. Historical assets are retained.

The deployment order is:

1. Apply additive database migration.
2. Deploy code that understands both legacy and release-managed records.
3. Import the cat and dog PDFs as incomplete drafts.
4. Add matching English PDFs when supplied.
5. Review both previews.
6. Publish each approved release through the coordinated transaction.
7. Verify both public surfaces and audit/history records.

## Testing Strategy

### Schema and Service Tests

- validate topic, species, IDs, asset languages, Knowledge fields, and pagination;
- allow incomplete drafts but reject incomplete submission/publication;
- cover every allowed and forbidden state transition;
- enforce staff/admin permissions;
- reject stale versions and invalid idempotency reuse;
- redact provider errors.

### Repository and RPC Tests

- use explicit selected columns and stable ordering;
- verify release-managed projection mapping;
- prove publication changes all required tables;
- prove a failure at each transaction stage rolls back every change;
- prove the previous release is archived only on successful replacement;
- prove repeated publication is idempotent;
- verify audit records and actor attribution.

### Component Tests

- render list, filters, readiness, empty/loading/error states, and history;
- cover both asset upload/select flows;
- block submit when either language is missing;
- render both public previews;
- hide or disable admin-only actions for staff;
- handle version conflicts without discarding local work;
- link release-managed records back to their owner.

### Public Regression Tests

- adoption page renders the active bilingual release;
- Knowledge Hub renders one card with `中文版` and `English`;
- legacy single-document and external Knowledge cards still work;
- unpublished draft asset URLs are never exposed publicly;
- archived releases do not appear as current content.

### Verification

Before publication:

- run focused domain, API, component, and public-reader tests;
- run the full test suite, typecheck, and production build;
- apply the migration to preview and exercise staff/admin roles;
- verify both preview surfaces with the imported drafts.

After publication:

- verify the live adoption-information page and Knowledge Hub;
- open both language actions and confirm the intended PDFs;
- confirm the superseded release is archived;
- confirm the audit trail and idempotent retry behavior;
- inspect deployment-specific logs for runtime errors.

## Acceptance Criteria

- Staff can create separate cat, dog, or general adoption-guide drafts.
- A draft can be saved with missing assets, but cannot enter review or publish without both verified language editions.
- Staff can preview the adoption-information panel and Knowledge card together.
- Staff can submit/withdraw; only admins can return or publish.
- Publication updates both public surfaces and asset state atomically.
- A Knowledge card displays `中文版` and `English` actions.
- Replacing a current release archives it without deleting its assets.
- Existing Knowledge destinations and the legacy guide remain functional during migration.
- The supplied cat and dog PDFs are imported as separate `zh-HK` drafts and remain unpublished until matching English PDFs exist.
- Focused tests, the full suite, typecheck, build, preview verification, and post-publication verification pass.
