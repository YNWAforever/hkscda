# Donor Ops CRM Foundation Design

## Goal

Build the first Phase 2.1 CRM slice for treasurer/admin donor operations. The feature gives staff one supporter-centered workspace for finding donors, reviewing donation and receipt history, updating consent, entering offline gifts, and preparing audited exports.

## Scope

This phase is donor ops first. It does not migrate adoption applications or build the adoption coordinator pipeline yet. The model remains ready for later adopter/volunteer/foster roles, but this slice actively manages donor records and financial CRM workflows.

In scope:

- Supporter search and list views.
- Supporter detail profile with contact info, language, roles, tags, consent, donations, receipts, payments, messages, and audit-relevant timeline entries.
- Manual supporter entry and contact/tag/language edits.
- Consent changes recorded as append-only channel events.
- Manual/offline donation and payment entry for treasurer/admin users.
- Receipt issue/reissue/void actions where permitted.
- Supporter and donation CSV exports with audit log entries.

Out of scope:

- Adoption application migration and pipeline design.
- Automated welcome series or editable template workflows.
- WhatsApp automation.
- AI search.
- Recurring donation self-service.

## Workspace Design

The admin CRM is supporter-centric.

`Supporters` becomes the main donor-ops entry point. The list is dense and operational: search, filters, last gift, lifetime giving, receipt-needed flags, and current email/WhatsApp consent. Selecting a supporter opens a profile page or detail panel where donor operations happen in context.

The supporter profile has:

- Header: name, email, phone, language, roles, tags, soft-delete status, and quick actions.
- Summary cards: lifetime giving, last gift, pending/manual payments, issued receipts, current consent state.
- Timeline: donations, payment status changes, receipts, consent changes, sent emails, and audited staff actions.
- Tabs or sections: donations/payments, receipts, consents, messages, audit trail.

Existing `Payments` remains a queue for reconciliation. The durable CRM source of truth is the supporter profile.

## Data Model

Use the Phase 2 donations MVP tables as the foundation:

- `supporter` is the root donor record.
- `supporter_role` marks donor/adopter/volunteer/foster. This phase manages donor roles only.
- `donation`, `payment`, `receipt`, `consent`, and `message` feed the supporter timeline.
- `audit_log` records supporter updates, receipt actions, manual donation entry, and exports.

Consent editing appends new `consent` rows. The latest row per supporter/channel is the current state.

Manual entry creates or updates a supporter, ensures the donor role, and optionally records an offline/manual donation plus payment. Money remains integer HKD cents.

Add only schema support needed for this slice:

- Search indexes for supporter email/name/phone and donation/payment lookup.
- Any missing audit action consistency needed for exports, supporter edits, receipt actions, and manual entries.
- No adoption migration.

## API Design

Admin APIs are authenticated and role-gated through Supabase Auth plus the existing `admin_user` roles.

- `GET /api/admin/supporters`: search/list supporters with filters for query, tag, role, consent, receipt-needed, last-gift range, and donation purpose.
- `GET /api/admin/supporters/:id`: supporter detail with summary, related donations/payments/receipts/consents/messages, and assembled timeline.
- `POST /api/admin/supporters`: manual supporter entry; dedupes by email and optionally phone.
- `PATCH /api/admin/supporters/:id`: update donor ops fields such as name, phone, language, tags, and soft-delete status.
- `POST /api/admin/supporters/:id/consents`: append consent changes for email and/or WhatsApp with source and timestamp.
- `POST /api/admin/donations/manual`: create manual/offline donation and payment for an existing or newly created supporter.
- `GET /api/admin/exports/supporters.csv`: export supporter CSV with filters and audit logging.
- `GET /api/admin/exports/donations.csv`: export donation CSV with filters and audit logging.

Receipt actions can reuse or extend the existing admin receipt endpoints, but must be accessible from supporter detail and must write audit logs.

## UX Workflows

### Find A Supporter

Staff search by name, email, phone, tag, receipt number, payment reference, or donation purpose. Results show enough context to identify the right person without opening every record.

### Review Supporter Detail

The detail page gives treasurer/admin users a complete donor picture: contact fields, language, roles, tags, consent state, donation history, receipt history, and timeline.

### Edit Donor Ops Fields

Staff/admin can update name, phone, language, and tags. Soft-delete hides a supporter from default lists but preserves audit history.

Consent uses a dedicated editor that records channel, opt-in/out status, source, timestamp, and actor where available.

### Manual Entry

Treasurer/admin can create a supporter and record an offline/manual gift in one flow. The flow validates amount, purpose, method, receipt request, donor role, and payment reference before writing.

### Export

Treasurer/admin can export supporter and donation CSVs from the same filters used in the UI. Every export writes `audit_log` with actor, filters, entity, and timestamp.

## Failure Handling

- Duplicate email updates merge into the existing supporter record.
- Manual donation entry validates all fields before any write.
- Receipt actions refuse ineligible gifts unless the gift is an eligible succeeded donation.
- Consent edits append history; they do not overwrite prior rows.
- CSV export is role-gated and audited.
- API errors return actionable messages and do not expose secrets or provider internals.

## Implementation Structure

Add a focused CRM module instead of expanding `src/routes/admin/index.tsx`.

- `src/lib/crm/`: schemas, search parameter parsing, query helpers, timeline assembly, consent latest-state logic, CSV generation, and tests.
- `src/routes/api/admin/supporters...`: supporter search/detail/manual entry/update/consent APIs.
- `src/routes/api/admin/donations/manual.ts`: manual donation entry.
- `src/routes/api/admin/exports/*.csv.ts`: CSV exports.
- `src/components/admin/crm/`: supporter list, detail, timeline, consent editor, manual donation dialog, and export bar.

Keep `src/routes/admin/index.tsx` as the admin shell/router. Move donor CRM behavior into focused components.

## Testing

Add focused tests for:

- Search parameter validation and normalization.
- Supporter dedupe behavior by email.
- Latest consent state from append-only consent rows.
- Timeline assembly order and labels.
- Manual donation validation.
- CSV column generation and escaping.
- Role-gated API behavior where practical.

Manual smoke checks:

- Search supporters.
- Open supporter detail.
- Edit tags/language/phone.
- Append consent change.
- Add manual donation/payment.
- Issue/reissue/void receipt where eligible.
- Export supporter and donation CSVs and confirm audit rows.

## Open Decisions

- Supporter detail may be a route (`/admin/supporters/:id`) or a large detail drawer. Default to a route for shareability, refresh safety, and room for timeline sections.
- CSV exports can begin as direct downloads; queued/export history can wait until export volumes require it.
- Adoption pipeline remains deferred to the next CRM slice.
