# HKSCDA Coordinator Ops Workbench Design

## Summary

Build the next coordinator phase as a heavier operations slice: a manual adoption case intake workbench plus a reporting control center. This phase builds on the merged coordinator foundation: case workflow, animal pipeline, task center, adopter list/detail, status admin, and audited CSV exports.

The staff outcome is practical. Coordinators can create internal adoption cases without a public form submission, link or create the adopter record safely, add the first follow-up task in the same flow, then review export history and monthly operational summary counts from one reporting page.

## Current Context

The app already has:

- Internal adoption case list/detail under `/admin/applications`.
- Coordinator status admin under `/admin/coordinator/statuses`.
- Animal pipeline under `/admin/coordinator/animals`.
- Coordinator task center under `/admin/coordinator/tasks`.
- Adopter list/detail under `/admin/coordinator/adopters`.
- Audited coordinator CSV exports for cases, adopters, successful adoptions, animals, and tasks.
- Shared service/repository/HTTP patterns in `src/lib/adoptions/`.
- Staff/admin coordinator route protection through existing admin auth helpers.

This phase should extend those patterns. It should not introduce a separate reporting platform or a parallel case-management domain.

## Goals

1. Add `/admin/coordinator/intake` for manual adoption case creation.
2. Let staff search and link an existing supporter/adopter or create a new supporter/adopter inline.
3. Let staff optionally link a requested animal.
4. Let staff choose an active initial case status.
5. Let staff optionally create an initial follow-up task before saving the case.
6. Redirect staff to the new case detail after a successful create.
7. Add `/admin/coordinator/reports` for export history and monthly coordinator summaries.
8. Let staff regenerate coordinator exports from stored audit metadata and current data.
9. Audit manual intake and regenerated exports.
10. Keep all new APIs staff/admin gated and `cache-control: no-store`.

## Non-Goals

- Stored CSV snapshots in Supabase Storage.
- Full saved report presets.
- Complex visual dashboards or chart-heavy analytics.
- Attachment upload/download.
- Public-facing adoption form changes.
- A complete adopter profile editor.
- Staff assignment tables.
- Treasurer access to coordinator intake or reports.

## Routes And UI

### Manual Intake Page

Add `/admin/coordinator/intake`.

The page is a compact workbench, not a long public-form clone. It has four sections:

1. **Adopter identity**
   - Search existing supporter/adopter records by name, phone, or email.
   - Select a matching adopter profile when available.
   - Select a supporter without an adopter profile and create the profile during submit.
   - Create a new supporter and adopter profile inline when no existing record fits.

2. **Case details**
   - Animal type.
   - Optional requested animal search/select.
   - Applicant name, phone, email, address.
   - Housing type, family size, existing pets, reason, and preference notes.

3. **Initial workflow**
   - Initial status from active `case` statuses.
   - Optional initial follow-up task using the current task fields: title, priority, due date, assignee, volunteer, contact channel, and remarks.

4. **Review and create**
   - Summarize linked or new supporter/adopter identity.
   - Summarize case details.
   - Summarize optional task details.
   - Submit once.

On success, the page navigates to `/admin/applications/$id`.

### Reports Page

Add `/admin/coordinator/reports`.

The page is operational and dense:

- Month selector.
- Export kind filter.
- Actor filter/search.
- Summary tiles for the selected month.
- Export history table.

Monthly summary tiles:

- Public intake cases.
- Manual intake cases.
- Successful adoptions.
- Currently open cases.
- Overdue tasks.
- Exports run.

Export history table columns:

- Timestamp.
- Actor id and any available display identity.
- Export kind.
- Row count.
- Normalized filters preview.
- Source route/action.
- Download again action.

`Download again` regenerates the CSV from stored audit metadata and current database state. It does not return an exact historical snapshot.

### Navigation

Add coordinator nav items:

- `Intake` -> `/admin/coordinator/intake`
- `Reports` -> `/admin/coordinator/reports`

The active-state behavior should match existing path-specific coordinator nav items.

## Server Architecture

Extend the existing adoption coordinator layers.

### Schemas

Add schemas in `src/lib/adoptions/schemas.ts`:

- `manualCaseIntakeSchema`
- `manualCaseIdentitySchema`
- `manualCaseInitialTaskSchema`
- `coordinatorReportHistorySearchSchema`
- `coordinatorMonthlySummarySearchSchema`
- `coordinatorExportRegenerateSchema`

The intake schema should require exactly one identity path:

- existing adopter profile id
- existing supporter id with adopter profile creation
- new supporter/adopter input

### Service

Add methods in `src/lib/adoptions/service.ts`:

- `createManualCase(args)`
- `listCoordinatorExportHistory(rawSearch)`
- `getCoordinatorMonthlySummary(rawSearch)`
- `regenerateCoordinatorExport(args)`

`createManualCase` should:

1. Parse and validate the input.
2. Verify the requested initial status is an active `case` status.
3. Validate the requested animal if provided.
4. Resolve or create supporter/adopter identity.
5. Create the adoption case with source `manual_intake`.
6. Create the optional initial task when supplied.
7. Insert an `audit_log` row for manual intake.
8. Return the created case id and optional task id.

`regenerateCoordinatorExport` should:

1. Load the audit row by id.
2. Confirm it is a supported coordinator export audit row.
3. Extract stored export kind and normalized filters.
4. Reuse the existing coordinator export generation path.
5. Write a new audit row with action `coordinator_export.regenerate`.
6. Return current CSV data and filename.

### Repository

Add repository methods in `src/lib/adoptions/repository.server.ts`:

- Search identity candidates for manual intake.
- Find supporter/adopter by id.
- Create supporter.
- Ensure adopter role.
- Create adopter profile for an existing or new supporter.
- Create manual adoption case.
- Create initial task linked to the new case/adopter.
- List coordinator export audit history.
- Load a coordinator export audit row.
- Build monthly summary counts.

The manual intake create path must be atomic. Implement it as a Postgres RPC that resolves or creates the supporter/adopter identity, creates the adoption case, optionally creates the initial task, and writes the manual intake audit row in one database transaction. The service must not report success unless the case and required audit row are both written.

## Data Model And Migrations

Add small, additive database support.

Add to `adoption_case`:

- `source text not null default 'public_form'`
- `created_by uuid null references auth.users(id)`

Existing rows remain public-form cases:

- rows with `public_application_id` keep `source = 'public_form'`
- manual cases use `source = 'manual_intake'`

Add indexes:

- `adoption_case(source, created_at)`
- `adoption_case(created_by, created_at)`
- `audit_log(action, timestamp)`
- `audit_log((detail->>'kind'), timestamp)` for coordinator export history filtering.

Manual intake audit detail:

```json
{
  "source": "manual_intake",
  "supporterId": "...",
  "adopterProfileId": "...",
  "requestedAnimalId": "...",
  "initialStatusId": "...",
  "createdInitialTask": true
}
```

Coordinator export audit detail:

```json
{
  "kind": "cases",
  "filters": {},
  "rowCount": 123,
  "sourceRoute": "/api/admin/adoptions/exports/cases.csv"
}
```

Regenerated export audit detail:

```json
{
  "kind": "cases",
  "filters": {},
  "rowCount": 123,
  "sourceAuditLogId": "...",
  "sourceRoute": "/api/admin/adoptions/reports/exports/.../download"
}
```

## API Design

Add routes:

- `GET /api/admin/adoptions/intake/identity-search`
- `POST /api/admin/adoptions/intake/cases`
- `GET /api/admin/adoptions/reports/exports`
- `GET /api/admin/adoptions/reports/summary`
- `GET /api/admin/adoptions/reports/exports/$id/download`

All routes require `staff` or `admin`.

Responses:

- JSON routes return `cache-control: no-store`.
- CSV regeneration returns `text/csv`, `content-disposition: attachment`, and `cache-control: no-store`.

## Data Flow

### Manual Intake

1. Browser searches identity candidates with a debounced request.
2. Staff selects an existing record or enters a new identity.
3. Browser builds a validated manual intake payload.
4. Server validates status, animal, identity, and optional task.
5. Repository resolves/creates supporter and adopter records.
6. Repository creates case and optional task.
7. Service writes manual intake audit.
8. Browser redirects to the created case detail page.

### Reports

1. Browser requests monthly summary and export history with selected filters.
2. Server reads aggregate counts and audit rows.
3. Browser renders summary tiles and export history.
4. Staff clicks download again.
5. Server reloads the audit row, regenerates the current export, writes a regenerate audit row, and returns CSV.

## Authorization And Privacy

- `staff` and `admin` can access intake and reports.
- `treasurer` does not receive coordinator intake/report access by default.
- Sensitive identity and report data never flows through public routes.
- Export history is metadata only; CSV snapshots are not stored.
- Regenerated downloads are newly audited.
- All responses are `no-store`.
- CSV output keeps formula-prefix neutralization from existing coordinator export helpers.

## Error Handling

- Missing auth returns 401 before repository work.
- Non-coordinator roles return 403 before repository work.
- Invalid identity path returns 400.
- Missing existing supporter/adopter returns 404.
- Invalid or inactive initial case status returns 400.
- Requested animal not found returns 404.
- Optional initial task validation errors return 400.
- Unknown export audit row returns 404.
- Non-export or unsupported export audit row returns 400.
- Export regeneration failures return a generic 500 JSON response.
- Manual intake should not return success unless the case and required audit row are both written.

## Testing

Automated tests:

- Manual intake schema accepts the three identity paths and rejects ambiguous identity input.
- Service creates a case for existing adopter, existing supporter with new adopter profile, and new supporter/adopter.
- Service creates optional initial task and records the task id in audit details.
- Repository maps identity search candidates without leaking public-only routes.
- HTTP routes enforce auth before service work.
- Invalid status, requested animal, and identity ids map to expected HTTP errors.
- Reports filters normalize month/export kind/actor inputs.
- Export history reads coordinator export audit rows only.
- Export regeneration rejects unsupported audit rows.
- Export regeneration writes a new audit row.
- Monthly summary counts public intake, manual intake, successful adoptions, open cases, overdue tasks, and exports.
- Intake/report nav active-state tests.
- UI helper tests build stable manual intake payloads and report query params.

Manual smoke checks:

1. Create a manual case with an existing adopter.
2. Create a manual case with an existing supporter that has no adopter profile.
3. Create a manual case with a new supporter/adopter.
4. Create a manual case with an optional initial task.
5. Confirm redirect to case detail.
6. Confirm task appears in case detail and task center.
7. Confirm audit rows exist for manual intake.
8. Open reports and filter by month/export kind.
9. Regenerate a prior coordinator export.
10. Confirm regenerate audit row exists.
11. Run `bun test`, `bun run lint`, and `bun run build`.

## Deployment Note

This phase does not require deployment work. Before any Vercel deployment work, upgrade the local Vercel CLI from the outdated installed version to the latest release with `npm i -g vercel@latest` or `pnpm add -g vercel@latest` for best compatibility.

## Open Decisions Resolved

- Scope is the heavier combined ops phase.
- Manual intake uses hybrid create/link.
- Initial follow-up task is optional.
- Reports focus on export history and monthly summary counts.
- Export history stores metadata and regenerates downloads from current data.
