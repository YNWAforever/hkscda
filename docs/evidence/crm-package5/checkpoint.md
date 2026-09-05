# CRM volunteer capacity checkpoint (2026-09-06)

Allocated migration: 20260905163900_volunteer_atomic_approval.sql (unapplied).

Staff approval and activity edits acquire the same hashtextextended(activity_id,0) advisory transaction lock as public creation, then lock the activity and registration in consistent order. Approval checks the supplied version and sums approved people excluding the current registration. Capacity reductions compare against approved occupants under the same lock. The mutation and staff audit insert are one RPC transaction. Capacity display counts use an aggregate JSON projection instead of transferring capped registration histories.

Both staff surfaces include expectedUpdatedAt, refresh after rejected mutations, retain existing controls and show a conflict banner; detail also displays remaining capacity. The management conflict banner was initially inside the collapsed create form: new regression failed (7pass/1fail) and passed after moving it outside (8pass). Detail callback test invokes the real mutation function with a stub transport, verifies the microsecond reviewed timestamp and refresh invalidations after rejection; no real admin/API mutation.

Checks:
- Volunteer backend and UI isolated selection: 71 pass / 0 fail before adding the management conflict visibility regression; latest two UI files 9 pass / 0 fail.
- Previous full typecheck exit 0 after package5 core and UI test integration; final combined checks coordinated by root.
- Local SQL suite includes staff/staff, public/staff, group approval, approved-to-approved edits, cancellation, stale version, capacity reduction/approval race and forced audit failure rollback. Dedicated local fixture opt-in absent: 1 guard pass / 18 DB skips including hooks. These tests are unexecuted locking/atomicity acceptance, not a pass.

No production mutation or migration applied. Remaining gates are actual disposable DB execution, browser-backed staff conflict workflow and root SQL review. This change does not claim provider delivery, production schema parity or operational activation.

Final combined isolated CRM/volunteers/delivery/admin UI/migration/audit check:194pass/18explicitDBskips/0fail,790assertions. Latest focused ESLint across all CRM/volunteer/delivery files and both volunteer screens/tests: exit0. Full typecheck exit0 after integration. React checklist review found no new hook-order, unstable rendering or client secret boundary issue in changed screens; visible conflict callbacks are covered by tests.

## Central review follow-up (2026-09-06)

Reproduced and fixed the delivery worker test's null-narrowing type error with an explicit expectation generic; no runtime change. Full typecheck then exited 0.

The real volunteer handler-to-fetchAdminJson regression exposed a response envelope mismatch: plain string error produced a generic Error and lost HTTP 409/code. Repository conflicts now use the existing admin error object shape. Both conflict and capacity_full tests failed before the fix and pass afterward as AdminApiError status 409 with the correct code. Existing detail/management mutation callbacks refresh onSettled and do not reset user inputs on error. Focused contract/repository/UI verification: 16 pass, 0 fail, 44 assertions. Targeted ESLint exited 0.

Source verification: migration 20260704165600_volunteer_activity_management_v1.sql installs before-update set_updated_at triggers for both volunteer_activity and volunteer_registration. Its public creation function and the new staff approval/activity edit functions use the identical hashtextextended(activity_id::text,0) advisory transaction lock. This is source evidence, not live schema parity.

Read-only coverage audit reconciled the companion pending-consent-intent workflow against the authoritative master's explicit exclusion: storage exists; new staff intent verification workflow remains excluded, not a missing implementation claim. Complete summaries/list filters/exports use the new read model; unlimited detail-history pagination is outside this package. No additional locally actionable blocker found in the reviewed manual-gift controller/composition/outcome/retry flow after root's dialog repair. Real disposable DB execution, storage recovery, provider acceptance and representative staging performance remain unexecuted acceptance gates.
Final full typecheck after clock and conflict-envelope changes: exit 0.
Disposable database capacity acceptance now executed: final CRM suite17pass/0fail/90assertions includes staff/staff, public/staff, cancellation, group/approved edits, capacity reduction race and forced audit rollback. Zero residual fixture rows/triggers/idletransactions after cleanup; see ../crm-package2/local-database-fifth-run.txt. No migration edits.
