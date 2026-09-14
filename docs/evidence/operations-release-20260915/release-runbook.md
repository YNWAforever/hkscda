# Operations release runbook

Candidate branch: `feat/hkscda-operations-release-20260915`. Baseline: `9e2b0f4ffb2dee051319b02d1413fa2576475434`. The fetched main branch equalled the audit baseline before implementation. The final candidate incorporates newer upstream `33b158340dc8fcc137c3ccb3302e514f3676475e` (PR124) after a local rebase; no remote merge occurred. Existing six admin groups, canonical IDs, factual records, authentic photos, and unrelated working files were preserved.

## Approval boundary

This candidate is local. No production database access, production changes, public preview, push, PR publication, merge or deployment is authorized by this implementation task. The repository is public; a branch push may publish source and trigger a Vercel preview. Obtain explicit approval for the concrete publication/release action before performing it. Do not reuse the audit's rejected production SQL request through another interface.

## Database before application

1. Record the approved target project, database, current migration ledger, application SHA, backup/PITR availability and recovery owner. Use the provider's approved access method; never infer the target from local fixture configuration.
2. Compare the actual ledger with the repository manifest. If missing, apply the existing `20260913180745` directory and `20260913182552` legacy-alias migrations in order. Never replay an already-applied migration or duplicate these repairs under new timestamps. A drift exception requires inspection, not bypass.
3. Apply only the missing new files in order:
   - `20260914160716_volunteer_member_booking_correctness.sql`: cancellation, waitlist, destination terms, member read projection.
   - `20260914160736_volunteer_bulk_operations.sql`: persistent exact selections, operations/groups, draft/legacy guards, audited batch commands, summaries and delivery/history reads.
   - `20260914161341_admin_content_quality_review.sql`: editorial classification and stale publication locking.
   - `20260914162305_animal_nonpublic_review_transition.sql`: permits deliberate nonpublic transitions without requiring publish approval.
   - `20260914163506_volunteer_policy_read_summary.sql`: service-only read projection for policy settings.
   - `20260914164558_editorial_verified_actor.sql`: verified/unbanned editorial actor enforcement.
4. Run `bun scripts/check-volunteer-compatibility.ts` with the specifically approved `VOLUNTEER_COMPATIBILITY_DATABASE_URL` and `VOLUNTEER_COMPATIBILITY_READ_APPROVED=1`. It runs a read-only transaction, checks the ledger, required volunteer/editorial RPCs, service-only grants and the legacy alias capability. It prints blockers, never credentials or SQL definitions. A nonzero exit blocks dependent application release.
5. Only after database checks pass, release the reviewed application SHA through the approved repository workflow. A main merge deploys production. Do not activate unresolved operating policies or classify/clean up production content as part of deployment.

## Compatibility and recovery

A web rollback does not roll back database state. Existing mutation signatures remain available, but new guards also constrain an older application: policyless publication and unreviewed editorial publication may fail, as intended. Keep the new schema/facts in place during an application rollback; do not disable guards just to make old UI writes succeed.

Bulk operations persist exact groups and idempotency identities. After timeout, retrieve status and retry the same group/operation; never generate a replacement operation before inspecting the existing result. Applied groups remain applied; each group is a separate transaction. Pending or failed notification work is not a failed business transaction.

If a database migration fails, stop dependent application release. Preserve the failing transaction/error metadata and compare schema/ledger before any retry. Do not run blanket down migrations: new operation, attendance, consent, audit and editorial facts must remain recoverable. Restore to a separate recovery database and validate before any approved cutover. The local backup/restore rehearsal uses a synthetic database and a newly created restore target; it does not demonstrate production RTO/RPO.

## Targeted smoke checks after an authorized release

- Verified staff/admin can search a verified zero-booking profile; legacy candidates load on panel expansion; anonymous/member/treasurer requests are denied.
- Policy settings/source resolution load. Unresolved templates remain blocked; publishing ordinary decisions needs one authorized administrator, not a new second-approver workflow.
- Calendar/activity list opens on the current Hong Kong date range. Counts are summaries; selecting a row loads its own roster/history.
- Inspect a preapproved test account/session only: availability, destination terms, cancellation conditions and attendance-end guard. Do not create a live booking as an unapproved smoke fixture.
- Check a preapproved content revision: review/preview state is visible; no publication is required merely to verify reads.
- Observe `volunteer_request` duration/status and `volunteer_failure` action/SQLSTATE logs, plus outbox/task/provider evidence. Distinguish queue completion from actual delivery. Inspect a defined observation window and record failures; do not claim zero errors without one.

## Local reproduction

Dedicated stack only: API `127.0.0.1:56321`, DB `127.0.0.1:56322`, development app `127.0.0.1:56336`. Scripts reject other fixture targets. Local credentials remain ignored.

- `bun run typecheck`
- `bun run test:acceptance:all` (the full `bun test` suite with isolated DB/API fixture variables)
- `bun run test:acceptance:rls`
- `bun run lint`
- `bun run build` (build does not typecheck)
- With `HKSCDA_MIGRATION_REHEARSAL=1`: `bun scripts/rehearse-operations-migrations-local.ts`, then `bun scripts/rehearse-operations-restore-local.ts`.
- With `HKSCDA_LOCAL_BROWSER=1`: `node scripts/verify-operations-reliability-local.mjs`.
- With `HKSCDA_LOCAL_PERFORMANCE=1`: `bun scripts/measure-policy-read-local.ts`; `node scripts/measure-operations-local.mjs after` records HTTP observations separately.
- Existing public gate: set `BASE_URL=http://127.0.0.1:56336`, an ignored `OUTPUT_DIR`, and `MODE=brand` or `MODE=a11y`, then `node scripts/verify-public-brand.mjs`.

See member, bulk and quality guides for their guarded fixture/browser commands. Production verification remains pending until specifically authorized and performed.
