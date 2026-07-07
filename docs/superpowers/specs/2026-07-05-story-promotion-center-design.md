# Story And Promotion Center Design

## Summary

Build a unified `故事及宣傳中心` for rescue stories, public-safe rescue map browsing, event and charity market promotion pages, report sharing, social copy generation, and adopter update drafts.

V1 should feel like one publishing workflow rather than separate mini tools. Staff create or link content once, then reuse it on the public story hub, story detail pages, map filters, social captions, and adopter update drafts.

## Current Context

The app already has:

- Public animal, adoption, donation, volunteer, sponsor, report, and social sections.
- Admin navigation and role-based access gates for animals, adoption coordination, payments, supporters, volunteers, and access management.
- `animals`, adoption coordinator tables, successful adoption records, supporter CRM records, volunteer activities, and supporter timeline patterns.
- Public-first visual language documented in `docs/brand-guidelines.md` and `docs/DESIGN-SPEC.md`: warm rescue tone, Chinese-first copy, photo-led cards, dashed accents, rescue rose, guardian navy, soft salmon, lavender, and warm cream.

The app does not yet have a general publishing domain for rescue stories, charity market posts, report/news posts, or reusable social copy.

## Goals

1. Give staff one admin area for rescue stories and promotional content.
2. Give the public one clear `/stories` entry point for Story Wall, rescue map, events, markets, and reports.
3. Support a hybrid CMS: content can be manually created or linked to existing animals, adoption cases, supporters, successful adoptions, and volunteer activities.
4. Make Story Wall the emotional lead: each animal can have a card, photos, medical/care updates, rescue region, and adoption/sponsorship CTA.
5. Show rescue locations publicly only at district or approximate-area level.
6. Generate editable Facebook, Instagram, and WhatsApp copy that staff can copy manually.
7. Generate adopter update drafts after relevant story updates, without sending automatically.
8. Keep public data safe by separating internal details from public-safe fields.

## Non-Goals

- Direct publishing or scheduling to Facebook, Instagram, WhatsApp, or other social APIs.
- Public exact rescue addresses or exact foster/adopter locations.
- Charity market stock, product catalog, checkout, payment, order, or booth operations.
- Automatic adopter notifications.
- A full newsroom workflow with multi-step editorial approvals.
- Replacing the adoption coordinator, supporter CRM, volunteer management, or animal admin screens.

## Chosen Product Shape

Use a unified content platform with strict V1 depth:

- Rescue story, event, charity market, and report content share the same publishing model.
- Rescue stories get an additional profile and update timeline.
- Public pages read only published, public-safe content.
- Admin pages can see full links, draft state, internal address notes, social copy variants, and notification drafts.

The public route should be `/stories`, with detail pages at `/stories/$slug`. The admin route should be `/admin/content`.

## Access Model

Extend the existing `AdminAccessArea` union with `contentManagement`.

`admin` and `staff` can access content management. `treasurer` cannot see it in the sidebar and cannot call admin content APIs.

Public APIs expose only published content. Admin APIs require the existing admin identity gate and return `cache-control: no-store`.

## Data Model

### `content_item`

The main publishing record.

Fields:

- `id`
- `slug`
- `type`: `rescue_story | event | charity_market | report`
- `title`
- `subtitle`
- `summary`
- `body`
- `cover_media_id`
- `status`: `draft | published | archived`
- `published_at`
- `cta_label`
- `cta_url`
- `seo_title`
- `seo_description`
- `og_title`
- `og_description`
- `created_by`
- `updated_by`
- `created_at`
- `updated_at`

`slug` must be unique. Published rows require title, slug, summary, cover media, and published date.

### `content_link`

Connects content to existing records without copying whole domain objects.

Fields:

- `id`
- `content_item_id`
- `linked_type`: `animal | adoption_case | successful_adoption | supporter | volunteer_activity`
- `linked_id`
- `relationship`: `primary_subject | related_case | adopter | volunteer_context | other`
- `created_at`

The same content item can link to multiple records, but each rescue story should have at most one `primary_subject` animal.

### `rescue_story_profile`

Story Wall and rescue map metadata for `content_item.type = rescue_story`.

Fields:

- `content_item_id`
- `animal_type`: `cat | dog | mixed | unknown`
- `public_status`: `rescued | medical_care | foster_recovery | ready_for_adoption | adopted | sponsor_needed | closed`
- `rescue_region`
- `rescue_date`
- `show_on_map`
- `public_map_label`
- `public_lat`
- `public_lng`
- `internal_address`
- `internal_location_notes`
- `is_featured`

`public_lat` and `public_lng` are approximate district-level coordinates only. Exact addresses remain internal.

### `story_update`

Timeline updates for a rescue story.

Fields:

- `id`
- `content_item_id`
- `kind`: `medical | care | photo | foster | adoption | general`
- `title`
- `body`
- `occurred_at`
- `visibility`: `public | internal`
- `should_generate_adopter_drafts`
- `created_by`
- `updated_by`
- `created_at`
- `updated_at`

Only public updates appear on public story detail pages.

### `content_media`

Reusable media for content and updates.

Fields:

- `id`
- `content_item_id`
- `story_update_id`
- `storage_bucket`
- `storage_path`
- `alt_text`
- `caption`
- `sort_order`
- `is_cover`
- `created_at`

The first cover image is used for Story Wall cards and default OG/social copy context.

### `social_copy_variant`

Editable copy drafts for manual social posting.

Fields:

- `id`
- `content_item_id`
- `story_update_id`
- `platform`: `facebook | instagram | whatsapp`
- `language`: `zh-HK`
- `copy_text`
- `hashtags`
- `status`: `draft | copied | archived`
- `created_by`
- `updated_by`
- `created_at`
- `updated_at`

Copy generation is deterministic template-based in V1. Staff can edit before copying.

### `recipient_notification_draft`

Adopter update drafts generated from story updates.

Fields:

- `id`
- `story_update_id`
- `content_item_id`
- `adoption_case_id`
- `supporter_id`
- `channel`: `email | whatsapp`
- `recipient_name`
- `recipient_contact`
- `subject`
- `body`
- `status`: `draft | copied | sent_manually | dismissed`
- `created_by`
- `updated_by`
- `created_at`
- `updated_at`

Drafts are created only for linked adoption records that can be resolved to an adopter/supporter. The system does not send messages automatically.

## Admin UI

Add a new sidebar group `宣傳` with one nav item, `宣傳內容`.

Admin screens:

- `/admin/content`: content list with filters for type, status, publish date, map visibility, update presence, and notification draft state.
- `/admin/content/new`: create content.
- `/admin/content/$id`: edit content, links, Story Wall profile, media, updates, social copy, and notification drafts using tabs inside the detail route.

Editor sections:

- Basic content: type, title, slug, summary, body, cover, CTA, SEO/OG fields.
- Linked records: search animals, adoption cases, successful adoptions, supporters, and volunteer activities.
- Story Wall settings: animal type, public status, rescue region, rescue date, featured flag, map visibility.
- Updates timeline: medical, care, photo, foster, adoption, or general updates.
- Social copy: generate, edit, copy, and mark copied.
- Notification drafts: generate from an update, review recipients, copy text, mark sent manually, or dismiss.

The editor should be compact and operational, matching existing admin screens. It should not become a marketing landing-page builder.

## Public UI

Add `/stories` as a unified public hub.

Public page order:

1. Short intro with Chinese-first positioning.
2. Story Wall cards as the primary content.
3. Rescue map section using district-level points and filters.
4. Events, charity markets, and report cards using the same content card system.

Story cards show:

- Cover image.
- Animal name or story title.
- Animal type.
- Public status.
- Rescue region.
- Latest public update.
- Adoption/sponsorship or learn-more CTA.

Story detail pages show:

- Cover and media gallery.
- Story body.
- Medical/care/photo/foster/adoption timeline.
- Public rescue region, never exact address.
- Linked adoption/sponsorship CTA when available.
- Related stories or recent updates when useful.

The design should use existing brand tokens and avoid hardcoded colors in React components.

## Data Flow

1. Staff creates a `content_item` as draft.
2. Staff optionally links existing domain records through `content_link`.
3. Rescue stories add `rescue_story_profile`, media, and `story_update` rows.
4. Staff publishes content when validation passes.
5. Staff generates social copy variants from content fields and optional latest update context.
6. When a story update is saved with `should_generate_adopter_drafts = true`, the server resolves linked adoption records and creates adopter notification drafts.
7. Public APIs return only published content, public story profile fields, public updates, and public media.

## Publishing Rules

All published content requires:

- Type.
- Title.
- Slug.
- Summary.
- Cover image.
- Published date.

Published rescue stories additionally require:

- Rescue story profile.
- Animal type.
- Public status.
- Rescue region.

Map-visible stories require:

- `show_on_map = true`.
- `public_map_label`.
- Approximate `public_lat` and `public_lng`.
- No exact address in public fields.

Adopter notification draft generation requires:

- A story update.
- At least one linked adoption case or successful adoption.
- A resolvable supporter/adopter contact.

If no recipient can be resolved, the update still saves and the admin UI shows a non-blocking warning.

## API Design

Public endpoints:

- `GET /api/stories`: list published content with filters for type, animal type, public status, and rescue region.
- `GET /api/stories/$slug`: detail for one published content item.
- `GET /api/stories/map`: district-level map stories only.

Admin endpoints:

- `GET /api/admin/content`
- `POST /api/admin/content`
- `GET /api/admin/content/$id`
- `PATCH /api/admin/content/$id`
- `POST /api/admin/content/$id/publish`
- `POST /api/admin/content/$id/archive`
- `POST /api/admin/content/$id/social-copy`
- `POST /api/admin/content/updates/$updateId/notification-drafts`
- `PATCH /api/admin/content/notification-drafts/$id`

Public and admin responses should be `no-store` where they contain dynamic content or privileged state.

## Error Handling

- Publish validation returns field-level errors instead of a generic failure.
- Missing linked records block publish only when the missing record is used for required public context.
- Social copy generation failure does not block content save.
- Notification draft generation failure does not roll back the story update.
- Map endpoints never expose `internal_address` or `internal_location_notes`.
- Slug conflicts return a clear error and keep staff in the editor.

## Testing Plan

Migration and policy tests:

- Tables, constraints, indexes, and foreign keys.
- RLS/grants for public published reads and admin/staff management.
- Treasurer denied for admin content management.
- Public-safe location columns separated from internal location fields.

Domain tests:

- Publish validation for each content type.
- Rescue story public status and map visibility rules.
- Public-safe map mapping.
- Social copy generation for Facebook, Instagram, and WhatsApp.
- Adopter notification recipient resolution from linked adoption records.
- Notification draft status transitions.

API tests:

- Public list/detail/map return only published content.
- Public responses do not include internal address, internal notes, draft updates, or notification drafts.
- Admin CRUD authorization.
- Publish/archive actions.
- Social copy generation and notification draft creation.
- `cache-control: no-store` on dynamic/admin responses.

UI tests:

- Admin nav visibility by role.
- Content list filters.
- Editor validation and publish errors.
- Story Wall card rendering.
- Story detail timeline rendering.
- Rescue map filters.
- Social copy copy action state.
- Notification draft review actions.

Verification commands:

```bash
bun test
bun run lint
bun run build
```

## Implementation Notes

- Keep the publishing domain under `src/lib/content/` or a similarly named isolated module.
- Keep public mapping functions separate from admin row mapping so internal fields cannot leak by accident.
- Reuse existing admin layout, access helpers, status badge patterns, and data table patterns.
- Prefer small pure helpers for status labels, filters, publish validation, public-safe mapping, social copy generation, and notification recipient resolution.
- Do not introduce a rich text editor in V1 unless the repo already has one by implementation time; a structured textarea/markdown-like body is enough.
