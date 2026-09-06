# Legacy record staging results — 2026-09-06

Acceptance: PASS for private local staging and repeatability; HOLD for application-table / production import.

## Source and scope

Resolved supplied path to `C:\Users\laich\Downloads\Earnestproperty-20260906T134053Z-1-001\Earnestproperty\hkscda_data.sql` (the supplied hkscda\_data.sql path did not exist). This file is 28,086,302 bytes, SHA256 `7a9454278c84c797a7a75bd56bfd416db852c2758483dc999f0e344a06a64225`. It contains 454 INSERT statements across 41 of the 49 structure tables; inserted column sets match the inspected structure inventory. No DDL was executed. SQL text was decoded as literals and inserted using bound SQLite parameters.

## Measured results

- 150,992 source rows accounted for: 150,918 staged + 74 excluded. First pass had zero preexisting/unchanged rows.
- 74 excluded: 37 users, 3 roles, 2 password resets, 17 migration-history rows and 15 global-options records. All files.token values removed before staging. Original export remains untouched.
- Private local database: `backups/legacy-import-20260906/verified-staging.sqlite`, verified inside this repository and Git-ignored, bound to the source hash. The earlier unbound staging.sqlite is retained locally only and is not the verified candidate.
- Second pass: 0 inserts; 150,918 unchanged records. No duplicate primary keys in the supplied source (first pass unchanged = 0). This is source-key idempotency, not evidence that canonical supporter identities are deduplicated.
- 9,797 distinct rows flagged in the local quarantine table for unresolved references: 4 adoption_file, 17 adoption_advertising_source, 5 rescue_images, 3,315 volunteer weekday links, 3,222 volunteer position links and 3,234 volunteer timeslot links. Source rows are retained; quarantine does not silently delete them. These are SELECTED relationship checks, not an exhaustive relational audit. A row without a flagged reference is not automatically accepted for target import.
- Staged domain counts include 5,144 animals, 19,254 adoption applications, 1,513 members, 6,632 volunteers, 686 medical records, 294 follow-ups and 25,853 file metadata records.
- Only 7 donations and 6 sponsorship records are present. Their decimal totals are respectively 410,300 and 40,600 cents before any currency/settlement/overlap validation. No payment records, financial transactions or receipts were created in the application.
- Repeated normalized email groups: members 21, applications 3,552, volunteers 445, donations 1. Repeated applications or shared contacts do not prove duplicate people. No canonical identities merged and no existing supporters overwritten.
- No rows present for albums, albums_files, animals_adoption_fees, applicant_existing_animals, matches, past_events, success_applications or upcoming_events. This does not prove those tables should be empty in the original system.
- 0 asset file contents verified. Source SQL has metadata/paths, not the uploaded photos/documents themselves. Other property-related folders beside the export were not treated as HKSCDA assets.

See [data-profile.json](data-profile.json) for aggregate counts and [repeat-profile.json](repeat-profile.json) for the final parser revalidation against the same database.

## Verification and independent review

13 synthetic tests pass. Initial six tests failed before implementation (missing module), then passed. Review boundary regressions reproduced an accepted unsupported quote mode, missing containment/source binding helpers, and an executable-comment mode bypass before fixes; all now pass. Tests exercise literal strings containing SQL punctuation, unsupported expressions, truncated input, credential exclusion, file-token redaction, transactional rollback on a later conflict/invalid statement, exact cents, source mismatch, repository path containment, and SQL mode/comment rejection.

Independent agent review found repository-path containment, source provenance, SQL-mode validation and partial-check labeling issues. These were fixed; a follow-up caught executable comments, now allowlisted to known phpMyAdmin encoding directives; the MariaDB M! equivalent is explicitly rejected. Direct test execution now discovers all classes. Data loading uses a single transaction, and synthetic mid-batch failure preserves the prior record count. This is a local rollback test, not a production backup/restore rehearsal.

No source rows or secrets appear in tracked artifacts. Tests and reports use synthetic values or aggregates. Full frontend build/browser tests were not run because this change is an offline Python staging utility with no application code edits.

## Remaining gates and proposed next package

1. Confirm export completeness, especially the small financial history and absent successful-adoption rows; obtain the actual HKSCDA asset directory/archive.
2. Resolve or retain quarantined orphan records with provenance. Confirm legacy status meanings and required-field handling. Review repeated contact details against canonical supporter identity without name-only merges.
3. Build reviewed target field transformations in isolated Postgres using verified target constraints/RLS and migration state; current staging preserves source fields and has NOT populated application tables. Medical history, volunteer profiles/availability, historical sponsorship allocation and unmapped fields need supported restricted destinations.
4. Rehearse target insert/update reconciliation, private access, no-notification behavior, and rollback. Produce concrete inserts/updates/exclusions, target conflict checks and backup evidence before requesting production write approval.

No production writes, deployments, payment activation, provider calls, messages, public content publication or asset uploads were performed. The safe local staging phase is complete; live migration is not ready for approval yet.
