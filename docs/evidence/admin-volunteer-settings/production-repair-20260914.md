# Production volunteer repair — 2026-09-14

Explicit user approval obtained in the debugging task before production changes.
Target: HKSCDA Supabase project `iihqjzilgawhfdhdevam`.

## Cause
Deployed volunteer policy endpoints required the September 13 schema while production still had 33 migration ledger entries through `20260912074747`. Policy/terms tables and the settings RPC were absent; public policy and terms GETs returned 500.

## Execution
- Verified all 38 candidate files against the frozen migration-release-manifest.json; zero hash mismatches.
- Created a private custom-format production database backup and separate schema dump including permissions. Captured the prior ledger and record counts privately.
- Restored the backup into a new local database, `volunteer_repair_20260914`, on the existing isolated local policy cluster. The first rehearsal transaction rolled back because restore ownership was supabase_admin; the rehearsal was rerun as that owner.
- All 38 exact migrations passed against the restored production data.
- Applied all 38 files in order in ONE production transaction, deliberately replacing the runbook's per-file commits to avoid exposing a partial schema to the already-deployed application. Each file has its own exact source-version/name/statements ledger row in the same transaction. Historical ledger entries were preserved. Ledger drift guard, advisory lock, table write locks and bounded lock/statement timeouts were used.
- Commit succeeded, with a transactional PostgREST schema reload notification. Ledger now has 71 entries.

## Verification
- Public GET /api/volunteer/activities: 200.
- Public GET /api/volunteer/policy: 200, sessions empty.
- Public GET /api/volunteer/policy?view=terms: 200, published terms returned.
- Browser /volunteer: no policy-load error or page error; appropriate no-open-sessions state.
- Settings list RPC executed in a read-only transaction: 9 drafts, 0 published versions, 0 upcoming activities.
- Counts unchanged: animals 292; donations 6; volunteer registrations 5; activities 12; adoption applications 5. Counts are not full row-content equality proof.
- No staff policy publication, participant reclassification, payment action, or outbound email was performed.

## Limits and next action
The authenticated admin browser session was not available; the settings database read was verified directly. Refresh the signed-in settings page. Staff must resolve draft fields and publish intended policies/activities before admissions open.
Database backup excludes external Storage object bytes. Local restore used no-owner/no-acl; original permissions were separately captured but full role/ACL disaster recovery was not rehearsed. Backup remains private locally and is not committed.
