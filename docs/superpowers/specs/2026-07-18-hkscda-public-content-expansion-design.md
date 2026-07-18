# HKSCDA Public Content and Service Expansion Design

**Date:** 2026-07-18

**Status:** Approved for implementation planning

**Delivery model:** Three vertical pull requests

**Application stack:** TanStack Start, React, TypeScript, Tailwind CSS, Supabase, Vercel

## 1. Purpose

Expand HKSCDA's public information, donation, rescue-story, adoption, volunteer, and knowledge experiences while keeping public content editable through the existing Supabase-backed admin system.

The supplied brief describes the project as Next.js. The repository is actually a TanStack Start application using file-based routes, server handlers, service/repository modules, Supabase, and Vercel. Implementation must follow the repository's current architecture rather than introduce Next.js conventions.

## 2. Approved Product Decisions

1. Deliver the work as three independently deployable pull requests.
2. Create CMS slots for missing documents, but publish only documents that actually exist.
3. Show the Chinese or English wedding form according to the donation-page language, with a link to the alternate language.
4. Store public PDFs in Supabase Storage and store their object metadata in CMS records.
5. Show the two post-adoption guides on both `/adopt` and `/knowledge` using the same document records.
6. Keep public rescue stories in the existing story CMS. An optional internal case link must never expose operational case data.
7. Show visit-time groups dynamically from the applicant's selected animal species and store dog and cat windows separately.
8. Keep the controlled donation purpose and add `custom_purpose` as an optional note.
9. Keep existing activity-specific group registration. `/volunteer/group` is a separate, activity-agnostic enquiry flow.
10. Preserve `/report/audit` as the route for compatibility while changing all visible and SEO text to annual reports.
11. Use `/donate?purpose=medical` as the canonical CTA URL. The public URL uses the controlled purpose key, not the translated label `醫療`.

## 3. Delivery Strategy

Each pull request contains its own additive migration, service and repository changes, admin UI, public UI, tests, and deployment verification. No pull request should depend on an unmerged application change from a later phase.

### PR 1: Annual Reports and Donation Documents

- Shared document-asset registry and Storage integration
- `annual_reports` CMS module
- `/report/audit` redesign
- Donation `custom_purpose`
- Chinese and English wedding donation forms
- Private receipt-template configuration slot

### PR 2: Rescue and Adoption Information

- Rescue-story publishing controls and donation CTA
- Species-specific visit-time options
- `adoption_fees` CMS and public tables
- `dog_friendly_estates` CMS and public reference list
- Adult-cat definition correction
- Post-adoption guide downloads on `/adopt`

### PR 3: Volunteer and Knowledge Content

- Individual-volunteer title and eligibility disclaimer
- `/volunteer/group` enquiry form and admin workflow
- `knowledge_posts` CMS and `/knowledge`
- Shared post-adoption guide entries on `/knowledge`
- Global rescue-service slogan correction
- Navigation and sitemap completion

## 4. Shared Document Model and Storage

### 4.1 Public document asset registry

Create `document_assets` as the canonical registry for public downloadable documents.

| Column            | Type        | Notes                                                                         |
| ----------------- | ----------- | ----------------------------------------------------------------------------- |
| `id`              | uuid        | Primary key                                                                   |
| `kind`            | text        | Constrained to `annual_report`, `wedding_form`, or `adoption_guide` initially |
| `title`           | text        | Display title; supplied content is bilingual where needed                     |
| `language`        | text        | `zh-HK`, `en`, or `bilingual`                                                 |
| `bucket_name`     | text        | Public document bucket                                                        |
| `object_path`     | text        | Unique canonical Storage path                                                 |
| `mime_type`       | text        | Must be `application/pdf`                                                     |
| `byte_size`       | bigint      | Used for validation and public file-size labels                               |
| `checksum_sha256` | text        | Optional integrity and duplicate-upload check                                 |
| `is_published`    | boolean     | Defaults to false                                                             |
| `sort_order`      | integer     | Defaults to zero                                                              |
| `created_at`      | timestamptz | Defaults to `now()`                                                           |
| `updated_at`      | timestamptz | Maintained on mutation                                                        |

Public APIs return a resolved CDN URL only for published assets. Database records retain the bucket and object path so files can move between Supabase projects without rewriting stored absolute URLs.

### 4.2 Storage layout

Use an existing public document bucket when suitable. If a new bucket is required, obtain explicit approval before provisioning it.

Proposed public object paths:

```text
transparency/annual-reports/annual_report_2526.pdf
transparency/annual-reports/annual_report_2425.pdf
donations/wedding/wedding_gift_return_plan_zh.pdf
donations/wedding/wedding_gift_return_plan_en.pdf
adoption/guides/what_to_know_after_adoption_zh.pdf
adoption/guides/what_to_know_after_adopting_a_cat_en.pdf
```

The missing 2023-24 annual report reserves this path but is not seeded as published:

```text
transparency/annual-reports/annual_report_2324.pdf
```

### 4.3 Fixed public document slots

Create `site_document_slots` for stable public document purposes that have language variants.

| Column              | Type        | Notes                                  |
| ------------------- | ----------- | -------------------------------------- |
| `id`                | uuid        | Primary key                            |
| `slot_key`          | text        | For example `wedding_gift_return_plan` |
| `language`          | text        | `zh-HK` or `en`                        |
| `document_asset_id` | uuid        | References `document_assets(id)`       |
| `is_published`      | boolean     | Defaults to false                      |
| `created_at`        | timestamptz | Defaults to `now()`                    |
| `updated_at`        | timestamptz | Maintained on mutation                 |

Enforce uniqueness on `(slot_key, language)`. Public pages resolve the slot and language rather than hard-code a Storage URL.

### 4.4 Admin-only receipt template

The donation receipt template is explicitly backend/admin-only. It must not be placed in the public document bucket. Store it in an existing private bucket under:

```text
admin/templates/donation_receipt_template.pdf
```

Store the bucket/object reference under the existing settings mechanism with key `donation_receipt_template_url`. Despite the legacy key suffix, the value should be an object reference or private path, not a permanent public URL. Admin access obtains a short-lived signed URL when needed.

If the source `Donation_Receipt_Template.pdf` is still unavailable, create the setting without a value and keep the feature unpublished.

### 4.5 Upload lifecycle

1. An authenticated admin requests a constrained upload target from the admin API.
2. The server validates role, document kind, language, path prefix, MIME type, and maximum size.
3. The browser uploads directly to Supabase using a signed upload URL.
4. The admin API verifies the resulting object and creates or updates metadata.
5. Publishing is a separate mutation and is blocked if the object cannot be verified.
6. Replacing a file uploads a new version before atomically changing metadata.
7. Referenced assets cannot be deleted until dependent records are removed or reassigned.

This flow avoids sending large PDF bodies through a Vercel Function.

## 5. PR 1 Detailed Design

### 5.1 Annual report CMS

Create `annual_reports` with the requested domain identity while using the normalized document registry.

| Column              | Type        | Notes                                                  |
| ------------------- | ----------- | ------------------------------------------------------ |
| `id`                | uuid        | Primary key                                            |
| `title`             | text        | Report title                                           |
| `year_label`        | text        | For example `2025-26`; normalize display to an en dash |
| `document_asset_id` | uuid        | References `document_assets(id)`                       |
| `is_published`      | boolean     | Defaults to false                                      |
| `sort_order`        | integer     | Newest first                                           |
| `created_at`        | timestamptz | Defaults to `now()`                                    |
| `updated_at`        | timestamptz | Maintained on mutation                                 |

The input brief requests a raw `file_url` column. The normalized foreign key intentionally replaces it: public API responses expose `fileUrl`, but the database keeps a portable Storage object reference.

Seed and publish only:

- Annual Report 2025-26 from `2025-2026 Annual report.pdf`
- Annual Report 2024-25 from `2024-2025 Year-End Review Winter Edition.pdf`

Do not create a visible placeholder for 2023-24. An admin can upload and publish it later.

Admin location: `Transparency > Annual Reports` within the existing content workspace. The module supports upload, title/year editing, ordering, publish/unpublish, replacement, and guarded deletion.

### 5.2 `/report/audit`

Keep the slug and remove the current sensitive income, expenditure, surplus, and chart UI entirely.

Exact visible copy:

- Page title: `年度報告 Annual Report`
- Description: `我們每年發表協會年度報告電子書，分享救援成果與資金運用摘要。`
- Primary action: `查看報告 / View Report`

Render published reports newest first in a responsive repeated-item grid: three columns on wide desktop and one column on mobile. Each item includes a PDF icon, title, year label, file size, and a new-tab link with `rel="noopener noreferrer"`.

Loading failures show a quiet retry state and do not restore the removed audit figures. An empty published list explains that reports are temporarily unavailable and provides the existing organisation contact path.

Update breadcrumbs, metadata, structured data, and navigation labels from audit report terminology to annual report terminology.

### 5.3 Donation custom purpose

Add nullable `custom_purpose text` to `donation`. Apply a bounded schema rule, trim whitespace, convert an empty value to null, and reject control characters. A 200-character maximum is sufficient for the examples in the brief.

The `/donate` form keeps controlled values:

- `general` - 一般營運
- `medical` - 醫療
- `sponsorship` - 助養

Always show an optional field directly below the purpose controls:

`其他捐款用途（婚宴／活動／粉絲籌款 等）`

Pass `customPurpose` through the request schema, donation service, repository insert, admin finance detail, and exports. Payment-provider metadata should continue using the controlled purpose; custom text must not become a Stripe or PayPal routing key.

The search parser accepts only controlled keys. `/donate?purpose=medical` preselects medical; translated or unknown values fall back to general without throwing.

### 5.4 Wedding donation section

Place a full-width section below the existing donation form.

Exact copy:

- Title: `💍 Share the Love – 婚宴回禮計劃`
- Intro: `以婚禮分享愛心，賓客祝福化作救援能量。填寫表格，我們會與您聯絡安排感謝證書及小卡。`
- Action: `下載表格 / Download Form`

Use the page's existing `zh-HK`/`en` control to choose the primary form. Also provide a smaller alternate-language link. Preserve both supplied fillable PDFs without flattening their AcroForm fields.

Source mapping:

- `HKSCDA_Wedding Donation Form (2021)-Chi_fillable_update.pdf` -> Chinese asset
- `HKSCDA_Wedding Donation Form (2021)-Eng_fillable_update.pdf` -> English asset

### 5.5 PR 1 acceptance criteria

- No financial audit totals or charts remain on `/report/audit`.
- Only the two supplied annual reports are visible and downloadable.
- The wedding form selected by language opens in a new tab and remains fillable.
- A donation saves both controlled purpose and optional custom purpose.
- Existing checkout, compensation, webhook, receipt, and export behavior remains intact.
- Missing 2023-24 and receipt-template files do not create broken links.

## 6. PR 2 Detailed Design

### 6.1 Rescue stories

Continue using the existing story content model and admin editor. Do not expose operational adoption or rescue-case tables directly.

Add or standardize:

- `is_published boolean not null default true`
- optional internal `case_id uuid` where an appropriate case relationship exists

Public story repository queries must enforce publication in the database query and again in mapping as defense in depth. Public response types must contain only editorial story fields.

Update list and detail headings and metadata from `Rescue Stories` or generic `故事` to `救援個案`.

Add the CTA to each story card and detail page:

- Label: `支援醫療費用 ｜ 立即捐助`
- URL: `/donate?purpose=medical`
- Component: reuse the established adoption/donation action primitive

The CTA must not trigger the global floating prompt at the same time in a way that creates overlapping primary actions.

### 6.2 Species-specific visit windows

The approved interaction is dynamic rather than one combined static select.

Dog shelter options:

- `weekday_afternoon` - 平日下午 (Weekday Afternoon)
- `weekend_afternoon` - 週末下午 (Weekend Afternoon)

Cat shelter options:

- `weekday_morning` - 平日早上 (Weekday Morning)
- `weekday_afternoon` - 平日下午 (Weekday Afternoon)
- `weekday_evening` - 平日晚上 (Weekday Evening)
- `weekend_morning` - 週末早上 (Weekend Morning)
- `weekend_afternoon` - 週末下午 (Weekend Afternoon)

Behavior:

- Dog selected: show dog windows only.
- Cat selected: show cat windows only.
- Both selected: show two separately labelled groups.
- Changing species removes now-inapplicable windows only after an explicit form-state update; draft restoration applies the same normalization.

Add `dog_time_windows text[]` and `cat_time_windows text[]` to the visit-preference record. Retain the legacy combined field during a compatibility window and provide a deterministic read fallback for old submissions. New writes use the grouped columns.

### 6.3 Adoption fees

Create `adoption_fees`:

| Column         | Type        | Notes                            |
| -------------- | ----------- | -------------------------------- |
| `id`           | uuid        | Primary key                      |
| `animal_type`  | text        | Constrained to `dog` or `cat`    |
| `item_name`    | text        | Bilingual supplied label         |
| `price_hkd`    | text        | Preserves ranges and `0` exactly |
| `sort_order`   | integer     | Within species                   |
| `is_published` | boolean     | Defaults to true                 |
| `created_at`   | timestamptz | Defaults to `now()`              |
| `updated_at`   | timestamptz | Maintained on mutation           |

Seed exactly in this order.

Dogs:

| Item                     | HK$         |
| ------------------------ | ----------- |
| Typical Species 一般品種 | 1,000       |
| Mongrel 唐狗             | 0           |
| PROHEART Injection       | 300–600     |
| 5-in-1 Vaccine           | 250         |
| Desex (Female)           | 1,500–2,000 |
| Desex (Male)             | 1,000–1,500 |

Cats:

| Item                     | HK$         |
| ------------------------ | ----------- |
| Typical Species 一般品種 | 1,000       |
| DSH 唐貓                 | 500         |
| 4-in-1 Vaccine           | 250         |
| Desex (Female)           | 1,500–2,000 |
| Desex (Male)             | 1,000–1,500 |
| Bath                     | 400         |
| Small Cage               | 150         |
| Big Cage Rental          | 400         |

Render two accessible tables side by side on desktop and stacked on mobile. Static footer note:

`All prices subject to adjustment; HKSCDA reserves the right to amend.`

### 6.4 Dog-friendly estates

Create `dog_friendly_estates` with `id`, `estate_name`, `district`, nullable `notes`, `sort_order`, `is_published`, `created_at`, and `updated_at`.

Display the published list in the adoption information section on `/adopt`; no search or filtering is needed. Exact title and disclaimer:

- `可養狗屋苑參考名單`
- `以下名單僅供參考，請向屋苑管理處查詢最新規定。`

An empty CMS list should hide the table but retain the disclaimer and contact path rather than invent estate data.

### 6.5 Adult-cat definition

Replace exact occurrences of:

`半歲以下仍屬幼貓`

with:

`半歲或以上為成貓`

Also audit adjacent code copy, metadata, FAQ content, seed content, and editable CMS records for contradictory age rules. The canonical rule is: a cat aged six months or older is an adult cat.

Do not perform an unbounded database replacement. Produce a reviewed migration for known seed/CMS records and an audit query for remaining matches.

### 6.6 Post-adoption guides

Register the two supplied guides as document assets:

- `What you need to know after adoption (完成版).pdf` - Chinese
- `What you need to know after adopting a cat (Completed).pdf` - English

Show both in an unframed download section on `/adopt`. The same asset IDs are reused by `/knowledge` in PR 3. No duplicate Storage objects or CMS rows are allowed.

### 6.7 PR 2 acceptance criteria

- Unpublished rescue stories never appear in list, detail, map, metadata, or public APIs.
- Story CTAs preselect the controlled medical purpose.
- Visit windows render and persist correctly for dog, cat, and both-species applications.
- Old adoption submissions remain readable.
- Fee ordering, values, ranges, and footer copy exactly match the approved content.
- Estate content is CMS-controlled and always accompanied by the disclaimer.
- No contradictory adult-cat definition remains in known code or seeded content.
- Both post-adoption guides download from `/adopt` using the shared asset registry.

## 7. PR 3 Detailed Design

### 7.1 Individual volunteer page

Keep the existing activity-connected volunteer registration behavior unchanged.

Update public copy:

- Page/section title: `個人義工報名`
- Eligibility disclaimer: `只接受21歲以上個人義工申請`

The schema and UI must enforce the approved age policy consistently. Existing activity-level rules may be stricter, but they may not permit an under-21 individual through this public flow.

Add a clear route link to `/volunteer/group` for registered organisations.

### 7.2 Group enquiry model

Create `group_enquiries`:

| Column                       | Type        | Notes                                                |
| ---------------------------- | ----------- | ---------------------------------------------------- |
| `id`                         | uuid        | Primary key                                          |
| `organisation_name`          | text        | Required                                             |
| `contact_person`             | text        | Required                                             |
| `email`                      | text        | Required and normalized                              |
| `phone`                      | text        | Required and normalized                              |
| `activity_type`              | text        | Constrained enum-like value                          |
| `other_activity_description` | text        | Required only for `other`                            |
| `participant_count`          | integer     | Optional expected group size; positive when supplied |
| `participant_age_profile`    | text        | Optional age range or audience description           |
| `preferred_date_notes`       | text        | Optional preferred date or date range                |
| `message`                    | text        | Optional                                             |
| `status`                     | text        | `new`, `in_progress`, `resolved`, `closed`           |
| `notification_status`        | text        | `pending`, `sent`, `failed`                          |
| `notification_error`         | text        | Safe internal diagnostic, nullable                   |
| `assigned_to`                | uuid        | Nullable admin user reference                        |
| `admin_notes`                | text        | Internal only                                        |
| `created_at`                 | timestamptz | Defaults to `now()`                                  |
| `updated_at`                 | timestamptz | Maintained on mutation                               |

Public submission uses the same Turnstile, rate-limit, schema-validation, safe-error, and request-id conventions as existing public forms. Use an idempotency key or bounded duplicate guard so a browser retry does not create repeated enquiries.

### 7.3 `/volunteer/group`

Exact top-level copy:

- Page title: `團體活動查詢`
- Disclaimer: `本頁僅供註冊團體使用。`

Required fields:

- Organisation name
- Contact person
- Email
- Phone
- Activity type

Optional planning fields:

- Expected participant count
- Participant age range or audience
- Preferred date or date range
- Message / additional notes

Activity options:

- `團體義工工作坊`
- `入校講座`
- `貓狗舍教育參觀活動`
- `其他活動查詢`

When `其他活動查詢` is selected, show and require `請描述活動內容`. `Message / additional notes` remains optional.

Persist the enquiry before attempting notification. Notification failure must not roll back the record. Show a neutral success state once persistence succeeds and let staff retry a failed notification from admin.

### 7.4 Group enquiry administration

Add `/admin/volunteers/group-enquiries` with bounded search, status filter, pagination, assignment, internal notes, and notification retry. List requests select only summary columns; load full content on detail open.

All status, assignment, note, and notification-retry actions write to the existing audit log. Public fields are escaped in outbound email templates.

### 7.5 Knowledge posts

Create `knowledge_posts` with the requested fields plus document support and ordering:

| Column              | Type        | Notes                                   |
| ------------------- | ----------- | --------------------------------------- |
| `id`                | uuid        | Primary key                             |
| `title`             | text        | Required                                |
| `topic`             | text        | Required                                |
| `short_intro`       | text        | Required                                |
| `external_url`      | text        | Nullable HTTPS URL                      |
| `document_asset_id` | uuid        | Nullable reference to a shared document |
| `source_name`       | text        | Optional attribution                    |
| `is_published`      | boolean     | Defaults to false                       |
| `sort_order`        | integer     | Defaults to zero                        |
| `created_at`        | timestamptz | Defaults to `now()`                     |
| `updated_at`        | timestamptz | Maintained on mutation                  |

Exactly one of `external_url` or `document_asset_id` is required. Enforce HTTPS for external links. Public links open in a new tab with safe rel attributes.

Seed these published external posts:

1. `【年廿八】清潔家居不想貓狗中毒 — 教你如何選清潔劑`
   - Topic: `家居安全`
   - Intro: `農曆年前大掃除，清潔劑選擇不當或對貓狗造成危險，了解如何安全選用。`
   - Source: `香港01 (何東緯)`
   - URL: `https://www.hk01.com/article/288651`
2. `《寵物保險邊間好 2026？》— 熱門產品保費、保障比較`
   - Topic: `寵物保險`
   - Intro: `比較2026年香港熱門寵物保險計劃的保費與保障範圍，助你為毛孩揀選最合適方案。`
   - Source: `10Life Blog`
   - URL: `https://www.10life.com/zh-HK/blog/Pet-Owners-Alert-Comparing-Pet-Insurance-Coverage`

Create two additional document entries that reference the PR 2 post-adoption guide assets.

### 7.6 `/knowledge`

Page title: `養貓狗知識專區`

Render published entries in a responsive repeated-item grid. Each item shows title, topic, short intro, source when available, and `閱讀更多 / Read More`. Document entries use a PDF/download label instead of pretending to be external articles.

Do not fetch page content after hydration when a TanStack route loader can deliver the initial published list during SSR. Use a stable loading skeleton only for client transitions.

### 7.7 Global service slogan

Replace exact occurrences of:

`日夜堅守前線動物救援`

with:

`本會以預約方式進行拯救與援助服務，並非 24 小時當值。`

Audit header/footer copy, heroes, SEO metadata, structured data, site configuration, FAQ entries, and seed content for equivalent 24-hour claims. Preserve the exact approved replacement sentence wherever the source phrase occurs.

### 7.8 Navigation and sitemap

- Add `/knowledge` to the appropriate public information/navigation group.
- Add a contextual `/volunteer/group` link from `/volunteer`; include it in global navigation only if the existing hierarchy remains scannable.
- Add `/knowledge` and `/volunteer/group` to the repository's sitemap implementation.
- Keep `/report/audit` in the sitemap with updated annual-report metadata.
- Ensure mobile and desktop navigation expose the same destinations.

### 7.9 PR 3 acceptance criteria

- `/volunteer` displays the exact title and age disclaimer without changing activity registration behavior beyond enforcing the approved age floor.
- A valid group enquiry is stored once and sends or queues a staff notification.
- Notification failure preserves the enquiry and is visible/retryable in admin.
- `/knowledge` renders only published entries, including the two approved links and shared guides.
- External URLs are validated and safely opened.
- The obsolete 24-hour rescue claim is absent from known code and seed content.
- New routes appear in navigation where approved and in the sitemap.

## 8. Admin Architecture

Extend the existing admin content workspace rather than create a second CMS framework.

Content modules:

- Transparency / Annual Reports
- Documents
- Rescue Stories
- Adoption Fees
- Dog-friendly Estates
- Knowledge Posts

Operational module:

- Volunteers / Group Enquiries

All modules use the established admin-session fetch helpers, role mapping, service layer, repository layer, typed schemas, no-store admin responses, and audit-log conventions.

Performance requirements:

- List endpoints are paginated and return summary projections only.
- Detail/editor requests load on demand.
- Lookup requests are deduplicated and cached for the editor session where safe.
- Mutations invalidate only affected list/detail queries.
- Upload progress does not hold the entire content list in a loading state.
- Stable row and toolbar dimensions prevent layout shifts.

## 9. Access Control and Data Safety

- Anonymous users can select only published public records through explicit public endpoints or tightly scoped RLS policies.
- Public clients receive no direct write grants for CMS, donation, enquiry, or operational tables.
- Admin writes occur through authenticated server handlers using the existing role checks.
- Storage upload paths are server-generated and constrained by document kind.
- Public document bucket permits reads; writes and deletes require authorised server-mediated operations.
- Private receipt templates require signed admin downloads.
- Story-to-case links are admin-only and omitted from public selects and response types.
- `group_enquiries` contact details, internal notes, and notification errors are admin-only.
- Destructive document deletion is blocked while references exist.

## 10. Indexes and Query Shape

Add indexes that match public and admin access paths, subject to migration review:

```text
document_assets(kind, is_published, sort_order)
annual_reports(is_published, sort_order, created_at desc)
adoption_fees(animal_type, is_published, sort_order)
dog_friendly_estates(is_published, sort_order)
knowledge_posts(is_published, sort_order, created_at desc)
group_enquiries(status, created_at desc)
group_enquiries(notification_status, created_at desc)
```

Do not use `select('*')` on public list queries or large admin lists. Query-plan evidence is required for any list that can grow without a hard bound.

## 11. Error Handling

- Public loaders return safe Traditional Chinese error copy and a retry path.
- One failed optional content module must not blank the full page.
- Missing or unpublished document assets produce no broken public anchor.
- Invalid donation query parameters fall back safely.
- Invalid custom-purpose input returns a field-level validation error before payment creation.
- Group enquiry persistence and notification are separate outcomes.
- Admin APIs use existing 400/401/403/404/409 response conventions and no-store headers.
- Storage replacement failures retain the previously published asset.

## 12. Migration and Seed Policy

- Use one or more additive migrations per PR under `supabase/migrations/`.
- Prefer nullable columns or safe defaults during deployment handover.
- Include explicit grants, revokes, RLS policies, constraints, indexes, and rollback notes.
- Seed only supplied and verified assets.
- Do not seed a live link for the missing 2023-24 report or receipt template.
- Preserve the exact supplied adoption-fee values and approved visible copy.
- Run repository migration-safety tests before applying migrations.
- Review generated SQL before `supabase db push`.
- Apply `supabase db push` only to the intended linked project and verify the project identity first.

## 13. Testing Strategy

Follow test-driven development during implementation.

### Unit and schema tests

- Donation custom-purpose normalization and limits
- Controlled purpose query parsing
- Species-to-window normalization and legacy fallback
- Knowledge link/document exclusivity
- Group enquiry conditional description and duplicate protection
- Publication filters and safe public mapping

### Repository and service tests

- Selected-column query shape and pagination bounds
- Published-only public lists
- Storage metadata lifecycle and reference guards
- Donation persistence and checkout compensation
- Enquiry persistence despite notification failure
- Admin audit-log writes

### Route and component tests

- Annual report exact copy and removal of sensitive audit UI
- Language-aware wedding-form links
- Story list/detail CTA and publication behavior
- Dog, cat, and both-species visit fields
- Fee tables, estate disclaimer, and shared guide links
- Volunteer eligibility copy and conditional group field
- Knowledge external/document actions
- Admin loading, empty, error, success, and permission states

### Browser and artifact verification

- Mobile and desktop screenshots for every changed public route and admin module
- Keyboard navigation, focus order, visible focus, form labels, live error announcements, and table semantics
- PDF links return `application/pdf`
- Wedding PDFs retain fillable fields after upload/download
- Annual reports and guides open without authentication
- Receipt template cannot be fetched anonymously
- No overlapping fixed donation/help actions on story pages

## 14. Deployment and Rollback

For each PR:

1. Confirm target Supabase and Vercel project identities.
2. Upload only the assets needed by that phase.
3. Apply the reviewed additive migration with `supabase db push`.
4. Verify tables, constraints, policies, indexes, and seed counts.
5. Deploy the application to Vercel.
6. Verify the deployment-specific URL before production alias verification.
7. Run live public, admin, Storage, and submission checks.
8. Record deployment and migration evidence in the PR.

Rollback favors unpublishing content and reverting the application while leaving additive schema in place. Published metadata must never point at an object removed during rollback.

## 15. Supplied and Missing Assets

Supplied:

- Chinese wedding donation form
- English wedding donation form
- Chinese post-adoption guide
- English post-adoption cat guide
- 2024-25 year-end review
- 2025-26 annual report

Missing:

- 2023-24 annual report
- `Donation_Receipt_Template.pdf`

The missing assets do not block the three-phase implementation. Their CMS/settings slots remain empty and unpublished until an admin supplies verified PDFs.

## 16. Out of Scope

- Changing the `/report/audit` URL slug
- Building a general-purpose page builder
- Exposing operational rescue/adoption cases publicly
- Search or filtering for the estate list
- Replacing the existing activity-specific volunteer registration system
- Generating or rewriting the supplied PDF content
- Creating the missing annual report or receipt template
- Provisioning new paid/cloud resources without explicit approval

## 17. Completion Definition

The programme is complete when all three PRs are merged, their migrations and assets are verified in the intended Supabase project, Vercel production serves the approved pages and copy, the admin can manage every new CMS domain within its permissions, and the live browser/PDF/submission checks pass without exposing unpublished or private data.
