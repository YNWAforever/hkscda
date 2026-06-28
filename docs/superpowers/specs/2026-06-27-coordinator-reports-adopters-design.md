# HKSCDA Coordinator Phase C3A Reports And Adopters Design

## Summary

Build the next coordinator slice as Phase C3A: report/export readiness plus a full adopter profile task and history surface. This phase builds directly on the Phase C task timeline and the existing adoption coordinator foundation.

The staff outcome is practical: coordinators can find an adopter, understand their adoption history and open follow-up work, create adopter-only tasks, and export operational reports for cases, adopters, successful adoptions, animals, and coordinator tasks.

## Current Context

The app already has:

- Internal adoption cases under `/admin/applications`.
- Case detail with status controls, matching, finalization, and reusable task panel.
- Animal pipeline under `/admin/coordinator/animals`.
- Coordinator task center under `/admin/coordinator/tasks`.
- `adopter_profile`, `successful_adoption`, `adoption_case`, `adoption_followup`, and `animal_profile_internal` tables.
- Existing task links to `adoption_case_id`, `adopter_profile_id`, and `animal_id`.
- Existing donor CRM CSV export helpers and export audit patterns in `src/lib/crm/`.

Phase C3A should reuse these pieces instead of creating a separate reporting subsystem.

## Goals

1. Add a coordinator adopter list and detail surface.
2. Show adopter contact, household, blacklist, case history, successful adoption history, and linked tasks.
3. Allow adopter-only tasks from the adopter detail page using the existing coordinator task API.
4. Add direct CSV exports for coordinator cases, adopters, successful adoptions, animal pipeline, and tasks.
5. Reuse current list filters where possible so exports match what staff are seeing.
6. Audit every export with actor, entity type, normalized filters, row count, and timestamp.
7. Keep all adopter and export responses role-gated to `staff` and `admin`, with `cache-control: no-store`.

## Non-Goals

- Attachment upload/download.
- Queued export jobs or export history UI.
- Editing every private adopter field.
- Public adopter self-service.
- Staff-user assignment tables.
- Automated adoption reports or charts.
- Donor CRM changes beyond reusing supporter identity where useful.

## Data Model

No new core tables are required.

Use existing tables:

- `adopter_profile`: adopter-specific identity, household, living area, and blacklist fields.
- `supporter`: shared name/email/phone/language identity where the adopter profile has a linked supporter.
- `supporter_role`: confirms the `adopter` role.
- `adoption_case`: case history and open-case relationship.
- `successful_adoption`: completed adoption history.
- `adoption_followup`: coordinator tasks linked to adopter profiles.
- `audit_log`: export audit rows.

Add only migration support if implementation finds missing indexes needed for search or export speed, such as:

- `adopter_profile(supporter_id)`
- `adoption_case(adopter_profile_id, created_at desc)`
- `successful_adoption(adopter_profile_id, approval_date desc)`
- `adoption_followup(adopter_profile_id, due_at)`

The spec assumes direct queries through server repositories, not client-side Supabase queries.

## Domain Types

Add coordinator adopter types in `src/lib/adoptions/types.ts`:

- `AdopterSummary`
- `AdopterDetail`
- `AdopterCaseHistoryRow`
- `AdopterSuccessfulAdoptionRow`
- `CoordinatorExportKind`
- `CoordinatorExportResult`

`AdopterSummary` should include:

- adopter profile id
- supporter id
- display name
- email
- phone
- living area label when available
- blacklist flag
- open case count
- successful adoption count
- open task count
- latest case date

`AdopterDetail` should add:

- private profile fields already stored in `adopter_profile`
- linked supporter identity
- case history
- successful adoptions
- linked coordinator tasks

## API Design

Add adopter routes:

- `GET /api/admin/adoptions/adopters`
- `GET /api/admin/adoptions/adopters/$id`

Adopter list filters:

- `q`
- `blacklisted`: `all`, `yes`, `no`
- `hasOpenCases`: boolean
- `hasOpenTasks`: boolean
- `page`
- `pageSize`

Add export routes:

- `GET /api/admin/adoptions/exports/cases.csv`
- `GET /api/admin/adoptions/exports/adopters.csv`
- `GET /api/admin/adoptions/exports/successful-adoptions.csv`
- `GET /api/admin/adoptions/exports/animals.csv`
- `GET /api/admin/adoptions/exports/tasks.csv`

Each export route should:

1. Authenticate `staff` or `admin`.
2. Parse and normalize filters.
3. Fetch export rows through the adoption coordinator service.
4. Build CSV using shared CSV escaping behavior.
5. Insert an `audit_log` row before returning the response.
6. Return `text/csv`, `content-disposition: attachment`, and `cache-control: no-store`.

The export routes are direct download endpoints in this phase. If row counts become large later, a queued export phase can reuse the same service methods.

## UI Design

### Adopter List

Add `/admin/coordinator/adopters`.

Layout:

- Dense filter bar with search, blacklist, open cases, and open tasks.
- Export button using current filters.
- Table rows showing adopter name, phone/email, blacklist state, open case count, successful adoption count, open task count, and latest case date.
- Row action navigates to adopter detail.

### Adopter Detail

Add `/admin/coordinator/adopters/$id`.

Sections:

- Header: display name, contact summary, supporter link id, blacklist badge, and key counts.
- Profile: household/living area/address-sensitive fields already available to staff.
- Cases: case history with links to case detail.
- Successful adoptions: case number, animal, approval date, pickup date, adoption fee.
- Tasks: reusable `TaskPanel` with `defaultLinks={{ adopterProfileId }}` so staff can create adopter-only follow-up work.

The page should be operational and compact, matching the existing admin coordinator style. It should not become a CRM marketing profile.

### Export Controls

Add compact export actions to:

- Case list.
- Animal pipeline.
- Task center.
- Adopter list.

Export buttons should be ordinary admin controls, not large promotional cards. They should preserve current filters when the matching export supports those filters.

## Data Flow

Adopter list:

1. Browser calls `/api/admin/adoptions/adopters` through `fetchCoordinatorJson`.
2. Server verifies coordinator auth and uses the service role repository.
3. Repository returns summaries assembled from adopter profile, supporter, cases, successful adoptions, and tasks.
4. Browser renders no-store data through TanStack Query.

Adopter detail:

1. Browser calls `/api/admin/adoptions/adopters/$id`.
2. Server returns the profile, case history, successful adoptions, and linked tasks.
3. The task section reuses the existing task create/update routes.

Exports:

1. Browser builds a CSV URL from the current filter state.
2. Server authenticates, normalizes filters, fetches rows, builds CSV, writes audit, and returns the file.
3. Browser triggers a direct download.

## Authorization And Privacy

- `staff` and `admin` can read adopter views and create adopter-linked tasks.
- `treasurer` does not receive coordinator adopter access by default.
- API responses use `cache-control: no-store`.
- Sensitive adopter fields never flow through public routes.
- Export audit rows must include actor id, export kind, filters, row count, and source route.
- CSV output must neutralize spreadsheet formula prefixes, matching donor CRM export behavior.

## Error Handling

- Missing auth returns 401 before repository work.
- Non-coordinator roles return 403 before repository work.
- Invalid UUID returns 400 before repository work.
- Unknown adopter profile returns 404.
- Invalid filters return 400 with JSON error messages.
- Export repository failures return 500 with a generic public message.
- Export audit failure should fail the export instead of returning an unaudited file.

## Testing

Automated tests:

- Adopter search schema normalization.
- Adopter list row aggregation counts.
- Adopter detail assembly with linked cases, successful adoptions, and tasks.
- Adopter-only task payload support through existing task helpers.
- CSV escaping and formula-prefix neutralization.
- Export service audit rows for each export kind.
- Export routes require coordinator auth and return no-store CSV headers.
- Export filters match case, task, animal, and adopter list filter helpers.
- Navigation active state for `/admin/coordinator/adopters`.

Manual smoke checks:

1. Open `/admin/coordinator/adopters`.
2. Search by adopter name, phone, or email.
3. Filter blacklisted adopters and open-task adopters.
4. Open adopter detail.
5. Confirm case history links to case detail.
6. Confirm successful adoption rows render.
7. Create an adopter-only task and see it in the task panel and task center.
8. Export adopters, tasks, cases, animals, and successful adoptions.
9. Confirm audit rows are written for each export.
10. Run `bun test`, `bun run lint`, and `bun run build`.

## Phasing

Phase C3A1:

- Adopter schemas, repository/service methods, HTTP handlers, and tests.
- `/admin/coordinator/adopters` list and `/admin/coordinator/adopters/$id` detail.
- Navigation updates.

Phase C3A2:

- Shared coordinator export service and CSV builders.
- Export routes and route tests.
- Export buttons on adopter list, case list, animal pipeline, and task center.

Phase C3A3:

- Polish counts, empty states, and manual smoke fixes.
- Full verification and PR.

## Open Decisions

- Adopter profile editing remains read-only in this phase except for tasks. A later phase can add controlled updates for household and blacklist fields.
- Export volume is assumed small enough for direct downloads. Queueing waits until operational data size demands it.
- Attachments remain the next separate coordinator phase.
