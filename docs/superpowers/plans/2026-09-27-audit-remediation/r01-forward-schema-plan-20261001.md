# R01 forward schema repair — 2026-10-01

Continuation of approved T01/R01 implementation, not a new product design. Binding spec: the original implementation plan and the user's work rules in this conversation; existing source call contracts and current releaseManifest define required signatures. Do not rewrite historical reports.

## Global Constraints

- Work from clean isolated main 4bbd4a4dffbd053328e92c03281a23d1d4ebe682. Primary155 unrelated paths are preserved. Production alias is same-SHA READY; mainCI36833019358 allfive SUCCESS.
- Fresh production readonly catalog 2026-10-01T09:15:56Z:154publictables/304publicfunctions/ledger112. Offline checker146requirements/44issues, exit1. This is a failure reproduction, not a ready claim.
- Only isolated DBs, synthetic rows, provider sandbox and email test sink. No production DML/DDL/actor-RPC, whole legacy replay, reset, fake ledger, paid branch, real payment/email/refund/content publication or schedule activation.
- Preserve #130 atomic audit, signed upload intent, fingerprint/idempotency, body limit, suspension recheck and media commit-before-public. Preserve #133 narrowly scoped CMS-revision fallback and existing public-data tables.
- Strict TypeScript/server-only boundaries; RLS and explicit table/column grants; SECURITY DEFINER only where existing service RPC architecture requires it, postgres owner and empty pinned search_path, exact service-only EXECUTE/revocation. Role/permission rechecked inside audited transaction.
- Generate every new migration filename through pinned Supabase CLI migration new; forward changes only, retain original migrations. Existing-object type/body/constraint/grant differences need explicit review; never hide them with blind IF EXISTS skipping.
- Before a migration, create real failure tests, observe RED; then minimum fix/GREEN. SQL role/owner/defaultACL/metadata/rows/audit/retry/partial-failure checks and full local typecheck/tests/lint/build are required. Fresh exact-head CI mandatory for review. Not-run stays not-run.
- New checkout stays disabled, existing signed webhooks/reconciliation remain compatible, committed payment success never reverts because receipt/email fails.
- Each domain is its own reviewable PR. Controller prepares per-task branch/PR after review; tasks may share the test-only catalog clone harness. No new production migration or new release authority inferred from original46 merger.

## Shared test interface

Task1 provides test-only tooling for a guarded, zero-production-data production-schema clone. Capture only schema via existing authenticated CLI/read-only MCP; do not decrypt or restore a production data backup. Existing loopback template audit_pr135_20260929 at127.0.0.1:52322 is synthetic and read-only. Create a uniquely named disposable local clone through existing supabase_db_hkscda-audit-integration-fresh container; never reset/terminate sessions on an existing stack. Restore public/private production schema only into that new clone, retaining synthetic managed Auth/Storage prerequisites. Verify normalized catalog matches actual production projection, owners/default ACL/grants/RLS and required prerequisites. No network/provider-bearing SQL primitive may execute during rehearsal. Do not change cluster roles, existing DBs, Docker engines or cron schedules. Inability to create an exact compatible clone must be reported as a concrete blocker, not replaced with a fabricated match.

Reuse source-side loopback full-suite environment: clear inherited *TEST_DATABASE_URL/*ALLOW_LOCAL_FIXTURES; set CHECKOUT_POLICY_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:57322/postgres and SUPABASE_LOCAL_URL=http://127.0.0.1:52321. Build uses only loopback54329/ci-placeholder keys. Other feature DB tests opt in only against the guarded new clone. Never print keys or data.

## Common task steps

1. Read exact requirement and legacy source definitions/callers using indexed graph hkscda-r01-forward-20261001, then SQL/direct-read fallback where graph excludes migrations. Read current AGENTS/CLAUDE and relevant instructions.
2. Record fresh read-only preflight, exact signatures/returns/owners/body hashes/full ACL/grant options/RLS/indexes/constraints and synthetic row invariants. Existing good objects are preserved.
3. Write and run real failing DB regressions against missing production-state objects. Reject direct unauthorized roles, audit-failure partial commits, stale role/version, identity mismatch and malformed/replayed inputs as applicable. Tests assert meaningful behavior, not only source strings.
4. Generate one focused forward migration, apply only to the new synthetic clone, run GREEN plus second apply/idempotency, expected preservation/default-ACL/temp-shadowing checks; require no unintended data/backfill or function replacement.
5. Run full local gates and applicable isolated DB/RLS gates. Record command/exit/source/environment; skipped/external gates explicit. Update this task's evidence and current R01 tracker without rewriting historical evidence.
6. Commit explicit paths, self-review, report to controller. Do not push/merge/apply production. No subagents. Controller supplies independent task review and prepares one PR for this domain.

## Review Focus

Unchecked catalog facets, private/helper prerequisites, exact argument names and types/return contracts, inherited grants, existing modern version triggers, service suspension fencing, transactional audit rollback, duplicate/concurrent retries, function replacement scope, existing data/immutable money/event preservation, and schema-only restore of production owners/default ACLs. Public146-requirement GREEN alone is insufficient for behavioral compatibility or hosted/provider UAT.

### Task 1: Payment idempotency columns

Scope (public schema, exact current manifest/call contracts): `donation.idempotency_key`, `donation.idempotency_fingerprint`, `payment.idempotency_key`, `payment.checkout_url`, `payment.checkout_attempted_at`.

Files: focused new migration; adjacent domain database tests or supabase/rls-tests; task evidence under docs/evidence/audit-remediation-20260927/r01-forward/; current tracker. Preserve unrelated source and migrations.

Follow Common task steps. Expected: before fix missing-target regression fails; after exact forward migration meaningful role/transaction/idempotency tests exit0 and no unintended metadata/data drift. Task1 does not close the other 39 baseline requirements. Source code-complete/schema-ready in isolation is distinct from applied/deployed/operationally-enabled.

Additional Task1 interface: establish the reusable schema-only clone harness described above. Exact five columns are nullable and have no fabricated backfill; preserve original donation/payment facts and checkout false/version1. Unique non-null idempotency keys must conflict safely; invalid/nonmatching fingerprints rejected; legacy rows remain NULL. Use original 20260925104012_donation_checkout_idempotency.sql as reference, verify current prestate before choosing safe forward constraints/indexes. No new payment RPC/body replacement or payment admission enablement in this task.

Catalog-driven security clarification: table-wide client INSERT/UPDATE must not extend direct write authority to these five new server-controlled fields. Reproduce active finance/admin access in a synthetic clone, then convert applicable PUBLIC/anon/authenticated table-wide INSERT/UPDATE privileges into equivalent other-preexisting-column privileges, preserving effective old-column rights and grant options, SELECT/REFERENCES/other grants, RLS and audit definitions. Enforce service/owner-only writes to the five control columns in both hosted and modern prestates; validate actor suspension, old-right equality and repeat apply. This selective new-column ACL enforcement is part of Task1; production approval stays separate.

### Task 2: Public adoption upload and fingerprint

Scope (public schema, exact current manifest/call contracts): `adoption_upload_intent`, `public_status_token.submission_fingerprint`, `cleanup_expired_adoption_application`.

Files: focused new migration; adjacent domain database tests or supabase/rls-tests; task evidence under docs/evidence/audit-remediation-20260927/r01-forward/; current tracker. Preserve unrelated source and migrations.

Follow Common task steps. Expected: before fix missing-target regression fails; after exact forward migration meaningful role/transaction/idempotency tests exit0 and no unintended metadata/data drift. Task2 does not close the other 41 baseline requirements. Source code-complete/schema-ready in isolation is distinct from applied/deployed/operationally-enabled.


### Task 3: Sponsorship submission and proof intents

Scope (public schema, exact current manifest/call contracts): `sponsorship_proof_upload_intent`, `sponsorship_staff_proof_upload_intent`, `mark_sponsorship_proof_upload_submitted`, `claim_expired_sponsorship_proof_uploads`, `reserve_staff_sponsorship_proof_upload`, `mark_staff_sponsorship_proof_attached`, `claim_expired_staff_sponsorship_proof_uploads`, `create_public_sponsorship_pledge`.

Files: focused new migration; adjacent domain database tests or supabase/rls-tests; task evidence under docs/evidence/audit-remediation-20260927/r01-forward/; current tracker. Preserve unrelated source and migrations.

Follow Common task steps. Expected: before fix missing-target regression fails; after exact forward migration meaningful role/transaction/idempotency tests exit0 and no unintended metadata/data drift. Task3 does not close the other 36 baseline requirements. Source code-complete/schema-ready in isolation is distinct from applied/deployed/operationally-enabled.


### Task 4: Internship attachment intents

Scope (public schema, exact current manifest/call contracts): `internship_attachment_upload_intent`, `mark_internship_attachment_uploaded`, `claim_expired_internship_attachment_uploads`.

Files: focused new migration; adjacent domain database tests or supabase/rls-tests; task evidence under docs/evidence/audit-remediation-20260927/r01-forward/; current tracker. Preserve unrelated source and migrations.

Follow Common task steps. Expected: before fix missing-target regression fails; after exact forward migration meaningful role/transaction/idempotency tests exit0 and no unintended metadata/data drift. Task4 does not close the other 41 baseline requirements. Source code-complete/schema-ready in isolation is distinct from applied/deployed/operationally-enabled.


### Task 5: Animal draft media intents and archive

Scope (public schema, exact current manifest/call contracts): `animal_draft_image_upload_intent`, `reserve_animal_draft_image_upload`, `mark_animal_draft_image_attached`, `claim_expired_animal_draft_image_uploads`, `set_animal_archived_with_audit`.

Files: focused new migration; adjacent domain database tests or supabase/rls-tests; task evidence under docs/evidence/audit-remediation-20260927/r01-forward/; current tracker. Preserve unrelated source and migrations.

Follow Common task steps. Expected: before fix missing-target regression fails; after exact forward migration meaningful role/transaction/idempotency tests exit0 and no unintended metadata/data drift. Task5 does not close the other 39 baseline requirements. Source code-complete/schema-ready in isolation is distinct from applied/deployed/operationally-enabled.


### Task 6: CRM atomic commands

Scope (public schema, exact current manifest/call contracts): `mutate_crm_supporter_with_audit`, `replace_supporter_roles_atomic`, `append_crm_consents_with_audit`.

Files: focused new migration; adjacent domain database tests or supabase/rls-tests; task evidence under docs/evidence/audit-remediation-20260927/r01-forward/; current tracker. Preserve unrelated source and migrations.

Follow Common task steps. Expected: before fix missing-target regression fails; after exact forward migration meaningful role/transaction/idempotency tests exit0 and no unintended metadata/data drift. Task6 does not close the other 41 baseline requirements. Source code-complete/schema-ready in isolation is distinct from applied/deployed/operationally-enabled.


### Task 7: CMS atomic commands

Scope (public schema, exact current manifest/call contracts): `cms_promotion_command`, `mutate_admin_content_with_audit`.

Files: focused new migration; adjacent domain database tests or supabase/rls-tests; task evidence under docs/evidence/audit-remediation-20260927/r01-forward/; current tracker. Preserve unrelated source and migrations.

Follow Common task steps. Expected: before fix missing-target regression fails; after exact forward migration meaningful role/transaction/idempotency tests exit0 and no unintended metadata/data drift. Task7 does not close the other 42 baseline requirements. Source code-complete/schema-ready in isolation is distinct from applied/deployed/operationally-enabled.


### Task 8: Volunteer idempotent registration and clone

Scope (public schema, exact current manifest/call contracts): `create_volunteer_registration_idempotent`, `clone_volunteer_activity_with_audit`.

Files: focused new migration; adjacent domain database tests or supabase/rls-tests; task evidence under docs/evidence/audit-remediation-20260927/r01-forward/; current tracker. Preserve unrelated source and migrations.

Follow Common task steps. Expected: before fix missing-target regression fails; after exact forward migration meaningful role/transaction/idempotency tests exit0 and no unintended metadata/data drift. Task8 does not close the other 42 baseline requirements. Source code-complete/schema-ready in isolation is distinct from applied/deployed/operationally-enabled.


**2026-10-07 Task8 source/isolation update:** source cd27b1fa plus typing-only19e8b1ad implements only the two RPCs; exact good modern registration is preserved and clone authority/audit is fenced. Hosted/modern owned clones on PG170006 each pass19tests/56assertions and12 actual SQL metadata refusals with rollback/replay/concurrency and complete watched preservation. Final committed-source safe local typecheck/units/lint/build all native0 (4604pass654skip; skips are not DB acceptance). See `docs/evidence/audit-remediation-20260927/r01-forward/task-8-evidence.md` and ZIP inventory. Prior policy fixture refusal, relation admission RED, harness/compiler failures and prescribed shared-opt-in hash drift remain preserved. PG170011 cold exact-head CI, hosted JWT/PostgREST and future policy/profile/terms/member acceptance are NOT_RUN; controller review required. Production application/deployment/operational enablement remains unauthorized and not performed.

**Task8 fix round 1:** independent review found a partial-installation overload bypass missed by the original total-count probe. Actual two-direction RED reproduced it; repair960e275f now checks per-name cardinality and every tuple before mutation. Both owned profiles pass19tests/56assertions and14 actual55000 refusals with full preservation; relevant typecheck/lint0,52 baseline warnings. Original evidence archive/manifest unchanged; a separate immutable fix archive retains RED/GREEN/checks. See task-8-fix-1-evidence.md. Scoped re-review and cold exact-head CI required; earlier full gates remain historical and external/UAT limits remain NOT_RUN.

**Task8 reviewed-fix controller gates:** independent fix1 review approved. Frozen67143d23 four native gates/harness0:4604pass654skip0fail12539assertions, type/lint/build0 with52baselinewarnings, OS-only/no-env-file/59999/noDBoptins. All18 executable hashes and both source raw hashes preserved. New immutable controller archive retains receipts; original evidence unchanged. Only170006 rehearsed; cold exact-head170011 CI and external/future-policy UAT NOT_RUN. See task-8-controller-gates-20261007-evidence.md.

### Task 9: Adoption coordinator and manual wrappers

Scope (public schema, exact current manifest/call contracts): `mutate_adoption_coordinator_with_audit`, `search_manual_case_identity`, `create_manual_adoption_case`.

Files: focused new migration; adjacent domain database tests or supabase/rls-tests; task evidence under docs/evidence/audit-remediation-20260927/r01-forward/; current tracker. Preserve unrelated source and migrations.

Follow Common task steps. Expected: before fix missing-target regression fails; after exact forward migration meaningful role/transaction/idempotency tests exit0 and no unintended metadata/data drift. Task9 does not close the other 41 baseline requirements. Source code-complete/schema-ready in isolation is distinct from applied/deployed/operationally-enabled.


### Task 10: Admin access and invitations

Scope (public schema, exact current manifest/call contracts): `update_admin_user_with_audit`, `invite_admin_user_with_audit`, `resend_admin_invite_with_audit`, `activate_admin_invite_with_audit`.

Files: focused new migration; adjacent domain database tests or supabase/rls-tests; task evidence under docs/evidence/audit-remediation-20260927/r01-forward/; current tracker. Preserve unrelated source and migrations.

Follow Common task steps. Expected: before fix missing-target regression fails; after exact forward migration meaningful role/transaction/idempotency tests exit0 and no unintended metadata/data drift. Task10 does not close the other 40 baseline requirements. Source code-complete/schema-ready in isolation is distinct from applied/deployed/operationally-enabled.


Task10 bounded supplemental prerequisite (controller rulings36–41, 2026-10-02): the public146 manifest does not inventory the known `private.lock_admin_user_mutation()` and `private.require_active_admin_user()` helpers or their admin_user statement/row triggers. Hosted source lacked these, the browser I/U/D fence and scoped TRUNCATE fence; genuine owned direct-role/last-admin/permission RED required their exact known modern source. Task10 restores only those missing known helpers/triggers and SELECT policy, revokes admin_user I/U/D/TRUNCATE from anon/authenticated, and preserves intentional helper rawACL NULL, service/default/native/TRIGGER/REFERENCES rights. Unknown profiles remain55000; complete guards precede mutations. Public readiness accounting remains four Task10 RPCs. This supplement is outside146 and does not certify production, deployment or enablement.

### Task 11: Finance callback and receipt commands

Scope (public schema, exact current manifest/call contracts): `fail_pending_provider_payment`, `refund_provider_payment_atomically`, `void_receipt_with_audit`, `void_donation_receipts_with_audit`, `issue_receipt_with_audit`.

Files: focused new migration; adjacent domain database tests or supabase/rls-tests; task evidence under docs/evidence/audit-remediation-20260927/r01-forward/; current tracker. Preserve unrelated source and migrations.

Follow Common task steps. Expected: before fix missing-target regression fails; after exact forward migration meaningful role/transaction/idempotency tests exit0 and no unintended metadata/data drift. Task11 does not close the other 39 baseline requirements. Source code-complete/schema-ready in isolation is distinct from applied/deployed/operationally-enabled.


### Task 12: Group enquiry atomic command

Scope (public schema, exact current manifest/call contracts): `update_group_enquiry_with_audit`.

Files: focused new migration; adjacent domain database tests or supabase/rls-tests; task evidence under docs/evidence/audit-remediation-20260927/r01-forward/; current tracker. Preserve unrelated source and migrations.

Follow Common task steps. Expected: before fix missing-target regression fails; after exact forward migration meaningful role/transaction/idempotency tests exit0 and no unintended metadata/data drift. Task12 does not close the other 43 baseline requirements. Source code-complete/schema-ready in isolation is distinct from applied/deployed/operationally-enabled.
