# Confirmed source and reference-table rehearsal — 2026-09-06

The user confirmed that the supplied legacy export is complete, including its 7 donation and 6 sponsorship rows. This resolves the source-completeness question. It does not establish receipt/settlement/currency correctness, supply missing asset bytes, resolve status meanings, or authorize production writes.

## Completed local package

Prepared stable, source-table-scoped UUID mappings and imported 14 arrival sources, 19 living areas and 11 adoption-fee definitions into application-shaped PostgreSQL tables in container `hkscda-legacy-lookups-20260906`. The container used network mode none and no published ports. All 44 rows are inactive pending review. No real people, financial transactions or public animal/content rows were imported into application tables.

Read-only production metadata verified column types, nullability/defaults and checks for these three tables. The local copy reproduces those table shapes, adds a restricted import manifest/audit schema and applies restrictive RLS without application role policies. It is NOT a full Supabase clone and does not prove production database/auth/policy parity. Production lookup deduplication/collision checks are still pending; local UUIDs are candidate mappings, not approved target IDs.

Measured evidence: [lookup-rehearsal.json](lookup-rehearsal.json), [lookup-mapping.json](lookup-mapping.json).

- Baseline: all three target tables and import manifest/audit were empty.
- Forced failure after inserts: transaction rolled back; all counts remained zero.
- Successful package: 44 target rows, 44 manifest records and 44 audit entries committed together.
- Repeat: zero additional rows or audit entries.
- Modified target row: replay rejected the conflict rather than overwriting it.
- Local delete transaction followed by rollback preserved all 44 committed rows.
- Anonymous local role: zero visible lookup rows; private manifest read denied.
- 18 synthetic tests passed. New lookup tests failed before implementation; source-key mismatch test failed before a review-requested provenance guard was added. Actual database assertions establish transaction/repeat behavior beyond unit tests.
- Independent review found no blocker for the stated offline rehearsal and requested the source-key guard. Added and reran mapping generation successfully; all 44 real staged keys match their payload IDs.

Target timestamps are import timestamps; original source timestamps remain in private staging. Fee conversion uses exact decimal-to-cents validation; values stay inactive and do not establish paid donations or approve a new fee schedule.

## Newly measured target compatibility gates

Current production animals checks allow types cat/dog/sponsor, genders male/female, and statuses available/adopted/fostered. Source has 5,144 animals: 3,805 cats and 1,339 dogs; gender f=2,665, m=2,478, missing=1. Status codes are A=4,058, D=179, F=414, S=492, missing=1. Their meanings need an authoritative mapping; no letter-to-status guess was applied.

Source contains 224 deleted animal rows and 163 with death dates (these counts may overlap), 98 without birthdays, and 299 explicitly marked adoptable. No missing names or duplicate nonempty internal codes were found. These facts do not justify automatic public listing or inventing ages/genders.

The live `public read available` policy exposes available animals publicly. The live `admin full access` policy also uses only auth.role() = authenticated, while repository migration `20260627091500_tighten_animals_admin_policy.sql` replaces it with staff/admin authorization. This observed policy drift must be resolved through a separately reviewed production change before importing private animal history. No policy was changed in production during this task.

The live supporter table has unique(email), and adopter_profile has unique(supporter_id). Duplicate/shared source contacts therefore require canonical identity resolution without name-only matching, silent profile replacement or fabricated email addresses. Legacy adoptions with explicit member references can preserve those links, but conflicts against existing target identities remain unverified.

## Pending input and next scope

- Supply the meaning of A/D/F/S or the old application source/status legend.
- Supply the HKSCDA uploads/photos/documents archive path. No file contents have been restored.
- Keep the 9,797 relationship-quarantined rows and unmapped medical/volunteer/sponsorship history private until resolved or supported by reviewed target models.
- Complete target collision checks, identity mapping, remaining model mappings, application-level access and rollback rehearsal before preparing a production import candidate. This local lookup package is not approval-ready for production.

Production unchanged. No deployment, schema mutation, asset publication, messages or payment activation occurred.
