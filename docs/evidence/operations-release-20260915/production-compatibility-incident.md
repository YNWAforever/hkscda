# Production volunteer compatibility incident — 2026-09-15 HKT

## Confirmed observations

Production alias hkscda.vercel.app serves deployment dpl_8eHgFMwm2ecwH2e4TzQ3PkJ8TQLZ, main commit 0469cfbbb989ae0c01aa3b078dfd25692016513a (merged PR125). Vercel reports READY.

Runtime logs, 2026-09-14 18:04–18:08 UTC:
- GET /api/admin/volunteers/people: repeated 500, directory_read / PGRST202.
- POST /api/admin/volunteers/bulk: repeated 500, bulk command / PGRST202.
- GET /api/admin/volunteers/calendar: repeated 500, PGRST202.
- GET /api/volunteer/policy: both successful reads and 500 member_booking / PGRST202.
- GET /api/admin/content-review: 500 also observed; no database error code available in the sampled log.

An unauthenticated public GET /api/volunteer/policy returned HTTP200 with sessions=[] and has_more=false. This does not exercise authenticated member history or demonstrate recovery.

## Dependency trace

Directory repository calls volunteer_admin_directory_read(uuid,jsonb), introduced by 20260913180745. Bulk repository calls volunteer_bulk_command(uuid,jsonb), introduced by 20260914160736. Authenticated member profile reads call volunteer_member_registrations(uuid,integer,integer,integer), introduced by 20260914160716. The public session-summary path is distinct.

PGRST202 identifies unresolved RPC lookup through PostgREST. Missing database migrations or a stale/mismatched exposed function signature/schema cache remain to be distinguished. No production ledger/catalog query has been executed for this incident, so the exact missing migration set is not yet confirmed.

## Prepared diagnostic and repair sequence

Use scripts/check-volunteer-compatibility.ts against the explicitly approved HKSCDA target. It runs a read-only transaction checking the migration ledger, exact RPC signatures and role grants; no supporter, payment or attendance row values are needed. It requires VOLUNTEER_COMPATIBILITY_READ_APPROVED=1 and an approved target URL, never a printed credential.

After the read-only result, prepare only the actual missing migrations from the committed manifest, inspect any schema/ledger drift, verify backup and rehearse against a separate restore. Existing migration files must not be replayed if already applied. If the functions and ledger are current, investigate cache/exposure/signature configuration before proposing SQL. Schema reload and migration application both remain separate production changes requiring approval.

The existing release-runbook.md documents eight required migration versions (two earlier repairs plus six PR125 additions), local clean/upgrade/restore proof, and database-before-app release sequencing. Those are candidates to compare, not permission to apply all eight blindly. No policy publication, booking, payment, notification or factual-history changes are proposed.

No production SQL, schema reload, code workaround, merge or deployment was performed during this investigation. The user must approve the explicitly gated production compatibility read before proceeding to a precise production repair candidate.

## Approved production read completed

The user explicitly approved the metadata-only check. Supabase project identity HKSCDA / iihqjzilgawhfdhdevam was verified. The query ran in BEGIN READ ONLY and confirmed transaction_read_only=on. No application records were selected or changed.

The current ledger has 71 entries, ending at 20260913113000. Six of ten checked RPC capabilities are absent: directory, member registrations, bulk command, settings snapshot, editorial command and editorial queue. Four existing RPCs retain service-only execution grants. The legacy alias repair check is false. These results confirm actual schema gaps, not merely a PostgREST cache issue.

Exactly eight repository migrations are newer than the latest production ledger entry:
1. 20260913180745_volunteer_admin_directory_read.sql
2. 20260913182552_volunteer_legacy_list_alias_fix.sql
3. 20260914160716_volunteer_member_booking_correctness.sql
4. 20260914160736_volunteer_bulk_operations.sql
5. 20260914161341_admin_content_quality_review.sql
6. 20260914162305_animal_nonpublic_review_transition.sql
7. 20260914163506_volunteer_policy_read_summary.sql
8. 20260914164558_editorial_verified_actor.sql

Their exact source files and hashes are in migration-manifest.json; prior local clean/upgrade/restore evidence is in migration-rehearsal.json and restore-rehearsal.json. Historical ledger gaps before the latest entry must not be treated as permission to replay older migrations. The existing production repair note explains earlier release history but does not substitute for fresh backup/rehearsal.

Proposed next approval: make a private current backup, rehearse these exact eight migrations on an isolated restored copy, stop on drift/failure, then apply only still-missing files to production in order with ledger recording and PostgREST reload. Re-run compatibility and read-only endpoint smoke checks. No policy activation, live test bookings, messages, payment actions or deletion of factual history. Production application is already current; no code merge or redeploy is proposed. This production-change step has NOT been performed or approved by the metadata-read approval.

## Approved repair completed — 2026-09-15 HKT

The user explicitly approved backup, isolated restored-copy rehearsal, application of the eight missing migrations and verification. The repair completed at 2026-09-14T18:42:44Z (2026-09-15 02:42 HKT).

- Created a fresh private custom-format production database backup (1,697,171 bytes; SHA256 e0b43720e83c4858a724e762c13e0b68c6c6a9c61c05ab3a6fa75eaf64b2f8c6) and a separate schema/permissions dump (1,149,555 bytes). These remain ignored locally and are not committed. External Storage object bytes are not included in the database backup.
- Verified the exact eight migration file hashes against the committed manifest.
- Restored to a new isolated database. Initial local owner mismatch stopped creation; a subsequent no-ACL restore caused the compatibility gate to reject existing RPC grants, and its migration transaction rolled back. A new restore retained ACLs (owner mapping to local supabase_admin only); all eight migrations then passed, with existing service-only grants validated. No production writes occurred during failed rehearsals.
- Applied the eight migrations in order within one production transaction, with an advisory lock, exact ledger drift assertion, bounded lock/statement timeouts, public-table write locks, original migration-version/name/statements ledger entries, and transactional PostgREST reload notification.
- Compared order-independent row-content fingerprints and counts for all 124 preexisting public tables inside the transaction. Existing values were identical. The comparison excludes only the two newly added nullable activity closure columns; both new operation/editorial tables were empty. No existing facts were deleted or modified.
- Post-commit compatibility: ready=true, zero blockers; migration ledger increased from 71 to 79, retaining historical entries.
- Existing verified actors exercised directory, bulk list, member registrations and settings read RPCs first inside a read-only SQL transaction, then through the real PostgREST API. All four returned HTTP200. Actor identifiers and record contents were not placed in evidence. No new authentication sessions or test accounts were issued.
- Public application policy, terms and activities GETs returned HTTP200. Headless mobile browser /volunteer passed: no original load error, zero JavaScript errors, policy HTTP200.

The native browser-control tool failed to start, so no signed-in administrator/member browser journey is claimed. API and database read verification establish that the missing-RPC failure is repaired; the user should refresh the already signed-in pages. A post-repair Vercel error-log query timed out, so no zero-error observation-window claim is made.

No policy publication, live booking, attendance adjustment, payment, outbound message, code merge or application deployment occurred. The private backups and isolated restored databases were retained for recovery. This update supersedes the earlier pending-approval status above.
