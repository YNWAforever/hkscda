# HKSCDA Adoption Coordinator Design

## Summary

Build a heavier adoption coordinator phase that restores the richer workflow implied by the legacy SQL dump while keeping the current TanStack Start, Supabase, and admin conventions. The target user is an adoption coordinator who can review applications, manage adopter records, match animals to applicants, track follow-ups/files, finalize successful adoptions, and manage workflow statuses from the admin UI.

Primary source studied: `/Users/willylai/Downloads/hkscda (1).sql`.

## Legacy Structure Findings

The SQL dump is a MySQL-style schema export with no inserted lookup/status data. It provides the old domain shape, but not the exact original `adoption_statuses` rows.

Important legacy tables:

- `adoptions`: application/case intake, applicant identity/contact, household and assessment fields, requested/preferred animal traits, current status, approved animal, linked member, and processed flag.
- `adoption_statuses`: configurable status labels with `case_close_flag`.
- `animals`: internal animal record with code, sequence, birthday, arrival source/date, personality/health/story, position/cage, chip/desex info, adoptable/support flags, deleted/died/adopted dates, and status.
- `members`: adopter/person record with HKID, contact, household/address, living area, and blacklist flag.
- `matches`: candidate application-to-animal links with `is_approved`.
- `success_applications`: final approved adoption linking application, member, animal, case number, fees, approval date, pickup date, and approving user.
- `adoption_followups`: home visit/follow-up observations, environment, score, volunteer, remarks.
- `adoption_file` + `files`: attachments for application cases.
- `applicant_existing_animals`, `blacklists`, `adoption_fees`, `animals_adoption_fees`, `animal_*_choices`, `positions`, `arrival_sources`, `medicals`, and `adoption_reports`: useful supporting modules for later depth.

## Current App Gap

The current Supabase app has a much slimmer shape:

- `animals`: public-card oriented fields, UUID primary key, type/name/gender/age/description/notes/status/image.
- `adoption_applications`: public form submissions with one applicant name, contact, address, housing, family size, existing pets, reason, and simple `pending/approved/rejected` status.
- Admin applications currently live inside `/admin?section=applications` and update status directly from the browser.

The next phase should add an internal coordinator layer rather than forcing every legacy concern into the existing public-facing tables.

## Design Goals

1. Preserve existing public application submission and animal pages.
2. Add a proper internal coordinator workflow for applications, animals, adopters, matches, follow-ups, files, and successful adoption finalization.
3. Make statuses configurable in admin so missing legacy status values can be added later without schema changes.
4. Keep authorization server-side, using Supabase Auth plus `admin_user` roles from the donor ops phase.
5. Record status changes and finalization actions in audit/history tables.
6. Keep scope broad enough for real coordinator operations, but defer low-usage legacy modules that do not block the application-to-adoption workflow.

## Status System

Create a shared status framework instead of hardcoded enums for coordinator workflows.

Status categories:

- `adoption_case`: application/case status.
- `animal_lifecycle`: internal animal status.
- `match`: candidate match status.
- `followup`: follow-up/task status.
- `final_outcome`: final adoption outcome status.

Each status has:

- `category`
- stable `key`
- Chinese and English labels
- display order
- active/hidden flag
- system flag
- close/final flags where relevant
- optional color/tone

Seed only the statuses needed for the MVP, for example:

- Adoption case: `new`, `screening`, `contacted`, `home_visit`, `matching`, `approved`, `rejected`, `withdrawn`, `closed`.
- Animal lifecycle: `available`, `reserved`, `fostered`, `adopted`, `not_adoptable`, `medical_hold`, `deceased`.
- Match: `proposed`, `shortlisted`, `approved`, `declined`, `cancelled`.
- Follow-up: `open`, `scheduled`, `completed`, `cancelled`.
- Final outcome: `adopted`, `rejected`, `withdrawn`, `cancelled`.

Admin status UI:

- Staff with the right admin role can add statuses, edit labels, reorder statuses, hide/show statuses, and set close/final behavior.
- System statuses cannot be deleted or have their keys changed.
- Status key edits for non-system statuses are allowed only before the status is used.
- Workflows resolve behavior from flags, not from hardcoded labels.

## Data Model

Use modern Supabase UUID tables and map legacy concepts into clear modules.

Core tables:

- `adoption_case`: internal application/case record. It can reference the current `adoption_applications` row for backwards compatibility and stores normalized applicant assessment data.
- `adopter_profile`: adopter/person record. Prefer linking to `supporter` from donor ops where possible, with adopter-specific fields for HKID, household, living area, blacklist flag, and privacy-sensitive details.
- `animal_match`: candidate matches between `adoption_case` and `animals`, with status, notes, and approved flag.
- `successful_adoption`: final record linking case, adopter/supporter, animal, case number, fee, approval date, pickup date, and approving admin.
- `adoption_followup`: follow-up/home visit/task records linked to a case and optionally an animal/adopter.
- `adoption_attachment`: metadata for uploaded files linked to cases, animals, adopters, or follow-ups.
- `coordinator_status`: configurable status definitions.
- `coordinator_status_history`: append-only record of status changes.

Animal extension:

- Add internal animal fields in a separate `animal_profile_internal` table keyed by `animal_id`. This avoids widening the public `animals` table with operational fields.
- First-batch fields: internal code, arrival date, arrival source, current position, cage/location notes, chip flag and remarks, desex flag/date/remarks, adoptable flag, support pool flag, adopted date, deceased date, and internal remarks.

Lookup tables:

- Add normalized lookup tables for living areas, arrival sources, positions, and adoption fees in this phase.
- Defer animal age/character/coat choices unless the first implementation batch expands the public application form to collect those preferences.

## Admin Experience

Add a coordinator area under admin, separate from the donor ops views.

Primary views:

- Applications/cases list: search, filter by status, animal type, assigned animal, created date, close/final state.
- Case detail: applicant profile, public submission data, assessment answers, requested animal/preferences, status controls, notes, files, follow-ups, matches, finalization panel.
- Match panel: add one or more candidate animals, mark a match approved/declined, and optionally reserve the animal.
- Animal pipeline: list animals by lifecycle status and type, view current cases/matches, update internal animal status.
- Adopter profile: contact/identity/household data, case history, successful adoptions, blacklist indicator.
- Status admin: manage coordinator statuses by category.
- Final adoption flow: approve selected match, create/update adopter profile, create successful adoption record, update animal lifecycle status, close case, and audit everything.

Avoid a marketing-style page. This should be a dense, operational interface consistent with admin/donor ops: tables, detail panes, filters, status chips, forms, and audit/history sections.

## Authorization And Privacy

- Public users can submit applications only through server routes/functions.
- Staff/admin actions go through server routes using Supabase service role after verifying `admin_user`.
- Use existing `staff` and `admin` roles for coordinator access in this phase. `treasurer` remains donation/payment oriented and does not receive coordinator permissions by default.
- Sensitive fields such as HKID, birthday, address, blacklist status, and files are never fetched through unauthenticated client queries.
- API responses with personal data must use `cache-control: no-store`.
- Every status change, match approval, finalization, attachment upload/delete, and blacklist-related action writes audit/history rows.

## Public Application Flow

Keep the existing public `/adoption/apply` experience working.

On submission:

- Continue inserting into the current `adoption_applications` table for compatibility.
- Create an internal `adoption_case` in `new` status.
- Upsert/link the applicant as a `supporter` with the `adopter` role, then create or update the related `adopter_profile` private extension record.
- Store public-form fields without requiring the full legacy assessment form immediately.

## Error Handling

- Validation errors return 400 JSON with specific messages.
- Missing/invalid admin auth returns 401/403.
- Invalid status transitions return 409 with a clear reason.
- Finalization must be transactional enough to avoid a case closing without animal/adopter/final record updates.
- If file upload succeeds but metadata insert fails, surface a clear retry path and leave an audit note.

## Testing

Use Bun tests for pure logic and focused route/service tests.

Coverage targets:

- status key/label validation
- system status protection
- status ordering and filtering
- application case creation from public submission
- status transition history
- match approval rules
- final adoption transaction behavior
- animal status update behavior
- adopter/supporter linking
- authorization for coordinator routes
- no-store headers for PII responses

Manual verification:

- submit public adoption form
- see case in admin list
- edit case status
- create adopter profile/link supporter
- add candidate animal match
- approve match/finalize adoption
- confirm animal status changes
- add follow-up and attachment
- add/edit/reorder statuses in status admin
- verify protected system statuses cannot be broken

## Phasing Within The Heavy Scope

Phase A: foundation

- coordinator status tables and seed data
- adoption case/adopter/match/final adoption schema
- server-side admin APIs
- status admin UI

Phase B: coordinator workflow

- case list/detail
- status changes and history
- matching panel
- animal lifecycle updates
- final adoption flow

Phase C: supporting operations

- follow-ups/tasks
- attachments
- adopter history/blacklist indicator
- animal internal profile fields
- exports/report readiness

Phase D: deeper legacy parity

- medicals
- detailed fees by animal
- positions/arrival source management
- monthly adoption reports
- full volunteer linkage

## Design Defaults

- Use existing `staff` and `admin` roles for coordinator access in this phase. Do not add a new role until permissions need to diverge.
- Store shared person/contact identity in `supporter` where possible, ensure the `adopter` supporter role, and store adoption-specific private fields in `adopter_profile`.
- Seed bilingual status labels in the migration using the status keys listed above. Labels can be renamed in admin after launch.
- Include the first-batch animal internal fields listed under `animal_profile_internal`; defer medicals and detailed animal choice tables to Phase D unless implementation uncovers a hard dependency.
