# Legacy HKSCDA import assessment — 2026-09-06

Historical structure-only assessment. Update: a later record export has now been staged locally; see [data-staging-results.md](data-staging-results.md). The findings below describe the original structure-only input. No source SQL executed, production records changed, assets uploaded, messages sent, or payment agreements activated.

## Evidence

Source: `C:\Users\laich\Downloads\hkscda_data_structure.sql`, 42,589 bytes; SHA256 `d6ae164b2a9c1923ff8e94fab59af26c988f42dbc2a83c79be527576bf3d8e13`.
MariaDB 10.11.18/phpMyAdmin structure dump generated 2026-09-06 06:06; 49 CREATE TABLE definitions, zero INSERT/REPLACE/COPY statements. This is not evidence that the legacy database itself is empty. Complete column inventory: [source-schema-inventory.json](source-schema-inventory.json).

Target: existing Supabase project `iihqjzilgawhfdhdevam`. Read-only information_schema queries checked current public column metadata, including adoption, supporter, donation/payment/receipt, content, documents, sponsorship and volunteer tables. Full constraints, RLS, triggers and migration parity have NOT been certified for import. Existing migration history is incomplete relative to the repository; no blanket schema replay is safe.

## Proposed mapping (all 49 source tables accounted for)

These are candidate destinations, not executed mappings. Resolve actual lookup values, target checks, conflicts and missing fields against the record export before implementing writes.

| Legacy tables | Candidate destination / handling |
|---|---|
| arrival_sources, living_areas, positions | arrival_source, living_area, animal_position; map integer IDs to UUIDs; positions.mobile to phone; retain unmapped district reference privately. |
| animals | Split approved public profile into animals and operational/chip/location/desex/remarks into animal_profile_internal. Do not copy private medical notes to public descriptions. Review age, gender and status codes; preserve birthday and otherwise unmapped fields in restricted staging until supported. Deleted/deceased/adopted records must not become publicly adoptable. |
| adoption_fees, animals_adoption_fees | adoption_fee with validated integer cents; animal-fee associations need destination verification before import. |
| adoption_statuses | Map semantics to coordinator_status, including closed/final behavior; never equate legacy integer codes with current status IDs. |
| animal_age_choices, animal_character_choices, animal_coat_choices | Resolve labels into adoption_case.preferences; preserve source IDs and unmapped choice metadata. |
| advertising_sources, adoption_advertising_source | Preserve attribution in restricted case assessment/source metadata after checking accepted schema. Do not overwrite canonical source arbitrarily. |
| members, adoptions | supporter + adopter_profile + adoption_case. Use explicit legacy member links where present; application snapshots remain distinct from canonical identity. HKID, income, birth dates, addresses and assessments remain restricted. |
| blacklists | Restricted review against adopter_profile; do not automatically blacklist someone from a name or shared email match. Unmatched entries remain quarantined. |
| applicant_existing_animals | Preserve linked application pet details in case assessment/existing-pet representation; no invented animal records. |
| matches | animal_match after case/animal/status mappings; is_approved alone does not establish completed adoption. |
| success_applications | successful_adoption after required case/animal/profile/supporter references resolve. Missing approval_date is a blocking row error; pickup_date is an integer and its encoding must be established from data. |
| adoption_followups | adoption_followup; preserve historic narrative. Explicitly map required status/title fields without inventing completed contact or dates. |
| adoption_file, files | adoption_attachment and classified asset records; private object paths by default. Legacy files.token is not imported as an access credential. Asset bytes required; path strings alone cannot restore files. |
| medicals, medical_types | No matching medical table appeared in current public metadata search. Preserve in restricted staging; a reviewed medical-history destination is required. Do not discard fees, dates, veterinarian or volunteer provenance. |
| donations, payment_method | Candidate donation/payment/receipt history, subject to verified settlement and receipt evidence. donations.payment_ID references payment_method.ID; it is NOT a provider transaction reference. Preserve allocation and fee breakdowns without double counting. No fabricated provider reference, paid status, consent, receipt issue time or currency. |
| sponsorships | Historical animal sponsorship allocations. Deduplicate against donation history before totals. Do not convert into an active sponsorship_pledge or recurring debit mandate merely because year_month exists; animal allocation/history destination needs review. |
| volunteers, volunteers_volunteer_dows, volunteers_volunteer_positions, volunteers_volunteer_timeslots, volunteer_dows, volunteer_positions, volunteer_timeslots | Basic identity may map to supporter after resolution. Preserve availability/skills and sensitive profile fields in restricted staging pending a suitable profile model. Do not fabricate volunteer_registration rows: current registrations require an activity and status token, and historical profile data does not establish attendance or consent. |
| news, events, past_events, upcoming_events, rescues, rescue_images | Draft content_item/revisions + classified content_media after supported content types, duplicate events, dates, sanitization and image mapping are checked. Preserve original public/private/draft/deleted flags in provenance; no automatic publication. |
| albums, albums_files | Preserve gallery ordering/relationships; gallery destination needs content-model review. Shared files must not inherit public visibility from one reference. |
| audit_reports | Candidate annual_reports + document_assets after original file is provided and document classification verified; default unpublished. |
| adoption_reports | Preserve historical monthly aggregate reports separately; do not manufacture individual adoptions from aggregate counts. |
| sliders | Draft CMS placement candidate after current slot model is checked; do not replace current homepage automatically. |
| global_options | Allowlist only reviewed non-secret content/settings. Exclude credentials, provider activation and unknown configuration values. |
| users, roles | Exclude authentication/authorization migration. Optional sanitized legacy actor ID/display-name map only; never import password hashes, remember tokens or grant admin access. |
| password_resets, migrations | Exclude entirely: authentication tokens and MariaDB application migration history are not target business records. |

## Import method and acceptance gates

1. Obtain structure AND data export (or one UTF-8 CSV/JSON per business table with headers, primary keys and relationship IDs) plus linked uploads. Exclude password_resets and user password/remember_token fields; sanitize global_options and files.token. Keep raw exports and personal data outside Git and public storage. Record per-file hashes and source export timestamp/timezone.
2. Restore only to an isolated MariaDB environment with outbound integrations disabled, after SQL review. Never feed MariaDB DDL directly to Supabase. Extract typed records to restricted staging; keep originals for traceability. Validate utf8mb3/utf8mb4 text, NULL versus blank, zero dates, integer timestamps and date-only fields without assuming their timezone.
3. Introduce a reviewed import batch manifest and unique mapping (source system, source table, legacy primary key) to target UUID. Validate duplicate source IDs and all logical references (only three foreign keys are declared in the dump). Never reuse numeric IDs as UUIDs or merge by name alone. Candidate email/phone matches require conflict handling; shared contacts and blank emails do not prove identity. Never infer marketing consent or replace newer canonical fields.
4. Rehearse in isolated Postgres with the verified target schema and synthetic or approved protected target matching inputs. Dependency order: lookups; animals/internal data; supporters/profiles; cases/matches/outcomes/followups; classified files; financial history; draft content. Unmapped or conflicting records remain quarantined with reasons. No silent loss or required-field fabrication.
5. Parse exported money as decimal strings into integer cents. Reject overflow and unresolved fractional cents; report sums by date/currency/category and overlapping allocations. Confirm currency and settlement evidence. Reuse receipt/reconciliation safeguards; historical receipts retain their original numbers and evidence without generating or sending replacements. Financial records and audit entries commit atomically. Reuse an appropriate existing atomic RPC only after its deployed version and side effects are verified; otherwise implement a reviewed import-specific transactional path.
6. Disable import-triggered email/payment/outbox actions by using an explicit no-notification import path; do not disable general production safeguards. Test invalid references, conflicting identities, malicious HTML/asset paths, private-file access and mid-transaction failure. A second identical import must create zero extra rows or financial totals. Report source rows = accepted + quarantined + excluded for every table; verify all resulting references, money totals, receipt uniqueness and private/public visibility.
7. Produce the concrete proposed insert/update counts and conflict report, backup/restore evidence, rollback rehearsal and owner review sample before requesting production import approval. No production import is authorized by this assessment. Recheck target schema and data changes immediately before execution.

## Rollback proposal

Prefer append-only first import; existing target updates are separately reviewed. Every inserted row/object carries batch provenance through a restricted manifest. Store before-images for any approved updates. Rehearse failure rollback and reverse dependency deletion of batch-only rows in staging. Verify no later references or edits before reverting; do not blindly delete shared supporters/assets or issued financial records. For committed financial history use an audited reversal procedure, not unaudited deletion. Preserve audit evidence and reconciliation totals. Establish an actual recoverable backup before production writes; backup availability is not claimed here.

## Measured acceptance

- PASS: source classified as schema-only; all 49 tables inventoried and assigned a candidate handling policy.
- PASS: read-only target column comparison; isolated documentation only.
- NOT RUN: record counts, duplicates, orphan checks, row conversion, asset verification, financial reconciliation, import/reimport and rollback tests — source rows/assets absent.
- NOT READY: production import, full database parity, owner acceptance and publication. Actual import candidate cannot be produced from schema alone.

## Required next input

Provide a local path to a business-data export with records and the associated uploads folder/archive. In phpMyAdmin this means an export including Data, not Structure only. Preserve legacy primary keys and relationship columns. Do not send passwords, reset tokens or payment/API credentials. The next step is a dry-run with actual accepted/rejected counts, followed by a concrete production approval request if the rehearsal passes.
