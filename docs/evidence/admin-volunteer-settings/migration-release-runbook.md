# Candidate migration release runbook

> Current six-phase closure: see [six-phase-completion.md](six-phase-completion.md). The current candidate has 38 new migrations (101 including baseline), 2,353 passing tests and no skips. Earlier numbered results below are retained historical evidence. No production activation is claimed.


Prepared 2026-09-13. This is a reviewable release plan, not production authorization or proof of deployment. No production mutation was performed to prepare it.

## Production parity follow-up (2026-09-13)

Read-only production inspection identified concrete baseline gaps. The new guarded prerequisite `20260913060000_verified_baseline_compatibility.sql` precedes the original 36 unchanged migrations; the manifest now contains 37 candidates (100 source files including baseline). Full source-chain and production-shaped rollback rehearsals pass, as does post-prerequisite full acceptance: 2343 passed, one intentional skip, zero failures. The earlier 99-entry CLI/browser/recovery evidence below remains historical, not a claim of a new 100-entry CLI or browser run. See [production-baseline-parity.md](production-baseline-parity.md) for exact repairs, preservation checks and limits. No production writes or ledger repair occurred.

## Scope and frozen evidence

The current worktree is based on commit `3fcf8cec235e0fa252b7d134f74948f2a682ebac`. It contains **63 baseline migrations** through `20260912120000_sponsorship_assignments.sql` and **38 new candidate migrations** listed below. The candidate is prepared on the isolated review branch; it has not been published. Freeze the reviewed source and regenerate/check the LF-normalized UTF-8 SHA-256 values in [migration-release-manifest.json](migration-release-manifest.json) after any change, including changes to an earlier candidate migration. A later candidate added to the directory is not automatically authorized by this list.

The parent recorded a fresh, read-only production ledger snapshot on 2026-09-13 in [production-migration-ledger.json](production-migration-ledger.json): project `iihqjzilgawhfdhdevam`, 33 rows, latest recorded remote version `20260912074747`. This subtask used that saved metadata; it did not make a production connection. The snapshot records migration names, statement counts and joined-statement MD5 values, not SQL bodies or personal data.

The isolated baseline replay is documented in [baseline.md](baseline.md): 63 migrations from zero succeeded on `hkscda-policy-20260913`, with API `127.0.0.1:56321` and PostgreSQL `127.0.0.1:56322/postgres`. The shared 55321/55322 environment is excluded. The release owner reported a clean 98-migration replay (63 baseline plus the first 35 candidates), followed by a no-op migration up with `applied: []`. Fresh-database finance browser verification passed five checks with no page errors, and the RLS gate passed 45 tests / 82 assertions. Subsequent complete SECURITY DEFINER grant review found four inherited browser-executable server commands, closed by candidate `20260913092132_restrict_receipt_issuance_rpc.sql`; actual anonymous/authenticated invocation denials pass. **The release owner subsequently completed the exact 99-migration clean replay and a repeated migration up returned `applied: []`. The fresh read-only schema check confirms all 99 ledger entries through `20260913092132`; the dedicated RLS rerun passed 45 tests / 82 assertions. Both full root acceptance runs completed and are recorded in `final-acceptance.md`.** No reset is part of this runbook's execution; the parent owns the isolated rehearsal.

## Production ledger reconciliation: 33 entries are not 33 source files

The comparison found 32 remote entries with same-name baseline files, six whole-file MD5 matches under ordinary line-ending/edge-whitespace normalization, and one remote-only compatibility bundle. Thirty-one baseline files have no individual remote name match. These are mapping classifications, not a list of missing migrations. A joined-statement digest mismatch can reflect batching, comments, wrappers or formatting; a name match alone does not prove SQL equivalence.

The prior [2026-09-12 release record](../hkscda-revision/18-full-catchup-applied-to-production.md) documents twelve catch-up migrations applied once under newly assigned remote versions. For example, local `20260912120000_sponsorship_assignments.sql` maps by recorded name/release evidence to remote `20260912074747`, rather than proving it absent. The older [production-shaped rehearsal](../hkscda-revision/15-production-state-migration-rehearsal.md) also shows why rerunning an already-created baseline table can fail.

Before any remote ledger repair, compare effective tables, columns, constraints, function signatures/definitions, trigger bodies, policies and grants against the baseline requirements. Record one disposition for every unmatched or non-equivalent baseline object: equivalent under a remapped entry; equivalent through a reviewed bundle; or a precisely identified missing/different object needing a separate additive repair. **Do not replay all 63 baseline files, rename existing ledger rows, mark unmatched versions applied, or run an unreviewed `db push --include-all`.** A CLI migration-history repair is a separate explicitly approved metadata change and must use a complete reviewed mapping. Preserve the existing remote ledger and its audit evidence.

The lower-risk release path while the historical mapping is unresolved is an explicitly reviewed, one-file-at-a-time candidate application through a migration executor that records each new remote version. Capture the source filename, frozen SHA-256, remote version/name, transaction outcome and object verification. Do not disguise that as repairing the historical ledger. A normal CLI push may be used only after the reviewed ledger mapping makes its dry-run list exactly the approved candidate suffix.

| Remote version   | Remote recorded name                       | Proposed repository correspondence                            | Evidence status             |
| ---------------- | ------------------------------------------ | ------------------------------------------------------------- | --------------------------- |
| `20260611162942` | `create_animals_table`                     | `20260611162942_create_animals_table.sql`                     | Equivalence review required |
| `20260611162956` | `create_adoption_applications_table`       | `20260611162956_create_adoption_applications_table.sql`       | Equivalence review required |
| `20260623160506` | `phase_2_donations_mvp`                    | `20260623160506_phase_2_donations_mvp.sql`                    | Equivalence review required |
| `20260623183933` | `donor_ops_crm_foundation`                 | `20260623183933_donor_ops_crm_foundation.sql`                 | Equivalence review required |
| `20260627110000` | `coordinator_task_timeline`                | `20260627110000_coordinator_task_timeline.sql`                | Equivalence review required |
| `20260630154259` | `add_animal_english_content_fields`        | `20260630154259_add_animal_english_content_fields.sql`        | Equivalence review required |
| `20260707094012` | `story_promotion_center`                   | `20260705120000_story_promotion_center.sql`                   | Whole-file digest match     |
| `20260718100000` | `public_documents_and_donation_purpose`    | `20260718100000_public_documents_and_donation_purpose.sql`    | Equivalence review required |
| `20260718110000` | `adoption_information`                     | `20260718110000_adoption_information.sql`                     | Equivalence review required |
| `20260718111000` | `correct_adult_cat_copy`                   | `20260718111000_correct_adult_cat_copy.sql`                   | Equivalence review required |
| `20260719120000` | `document_admin_mutation_hardening`        | `20260719120000_document_admin_mutation_hardening.sql`        | Equivalence review required |
| `20260719223000` | `public_document_read_policies`            | `20260719223000_public_document_read_policies.sql`            | Equivalence review required |
| `20260724023312` | `group_enquiries_and_knowledge`            | `20260718120000_group_enquiries_and_knowledge.sql`            | Equivalence review required |
| `20260724023618` | `seed_knowledge_guides`                    | `20260718121000_seed_knowledge_guides.sql`                    | Equivalence review required |
| `20260726170246` | `correct_service_slogan`                   | `20260718122000_correct_service_slogan.sql`                   | Whole-file digest match     |
| `20260731164635` | `adoption_guide_release_cms`               | `20260731120000_adoption_guide_release_cms.sql`               | Whole-file digest match     |
| `20260731171123` | `adoption_guide_release_cms_advisor_fixes` | `20260801180000_adoption_guide_release_cms_advisor_fixes.sql` | Whole-file digest match     |
| `20260803120000` | `audit_animal_mutations`                   | `20260803120000_audit_animal_mutations.sql`                   | Whole-file digest match     |
| `20260906062155` | `cms_payment_read_compatibility_repair`    | Compatibility bundle; map its effective objects               | Equivalence review required |
| `20260906173545` | `animal_catalog_membership`                | `20260906162436_animal_catalog_membership.sql`                | Equivalence review required |
| `20260907011009` | `animal_public_profile`                    | `20260906181657_animal_public_profile.sql`                    | Equivalence review required |
| `20260912073702` | `public_supporter_identity_claims`         | `20260905144848_public_supporter_identity_claims.sql`         | Whole-file digest match     |
| `20260912073842` | `sponsorship_public_identity_protection`   | `20260911120000_sponsorship_public_identity_protection.sql`   | Equivalence review required |
| `20260912074006` | `crm_manual_gift_delivery_jobs`            | `20260905155357_crm_manual_gift_delivery_jobs.sql`            | Equivalence review required |
| `20260912074036` | `volunteer_atomic_approval`                | `20260905163900_volunteer_atomic_approval.sql`                | Equivalence review required |
| `20260912074117` | `animal_images_bucket`                     | `20260911130000_animal_images_bucket.sql`                     | Equivalence review required |
| `20260912074156` | `animal_publication_state`                 | `20260911140000_animal_publication_state.sql`                 | Equivalence review required |
| `20260912074228` | `preserve_eligibility_on_species_change`   | `20260911150000_preserve_eligibility_on_species_change.sql`   | Equivalence review required |
| `20260912074346` | `correct_legacy_sponsor_species`           | `20260911160000_correct_legacy_sponsor_species.sql`           | Equivalence review required |
| `20260912074430` | `publish_fostered_animals`                 | `20260911170000_publish_fostered_animals.sql`                 | Equivalence review required |
| `20260912074524` | `sponsorship_second_month`                 | `20260911180000_sponsorship_second_month.sql`                 | Equivalence review required |
| `20260912074646` | `sponsorship_monthly_ledger`               | `20260911190000_sponsorship_monthly_ledger.sql`               | Equivalence review required |
| `20260912074747` | `sponsorship_assignments`                  | `20260912120000_sponsorship_assignments.sql`                  | Equivalence review required |

## Exact candidate order

Only the following candidate files are in this plan. Apply each file transactionally, in this order, stopping at the first failure. Do not run a second copy of an already successful file; many additive migrations deliberately use `CREATE TABLE/FUNCTION` and are not raw-SQL rerunnable. Atomic transaction plus recorded-prefix recovery is the retry contract.

1. `20260913060000_verified_baseline_compatibility.sql` — guarded prerequisites identified by read-only production parity
2. `20260913062837_volunteer_versioned_policy.sql`
3. `20260913062952_volunteer_atomic_attendance.sql`
4. `20260913064921_volunteer_profile_commands.sql`
5. `20260913065257_volunteer_policy_validation.sql`
6. `20260913065833_volunteer_daily_policy.sql`
7. `20260913070057_volunteer_initial_policy_catalogue.sql`
8. `20260913070128_volunteer_monthly_assessments.sql`
9. `20260913071632_animal_public_column_boundary.sql`
10. `20260913071639_volunteer_runtime_jobs.sql`
11. `20260913071927_sponsorship_exact_proof_review.sql`
12. `20260913072235_volunteer_booking_enforcement.sql`
13. `20260913072454_veterinary_internship_workflow.sql`
14. `20260913072851_volunteer_group_operations.sql`
15. `20260913073012_sponsorship_financial_closure.sql`
16. `20260913073314_animal_publication_lifecycle.sql`
17. `20260913075040_volunteer_verified_service_history.sql`
18. `20260913075643_volunteer_release_transitions.sql`
19. `20260913075913_sponsorship_contact_verification.sql`
20. `20260913080143_volunteer_immutable_qualification_evidence.sql`
21. `20260913080152_sponsorship_role_handoff.sql`
22. `20260913080537_volunteer_policy_simulation.sql`
23. `20260913080838_sponsorship_allocation_retry.sql`
24. `20260913081521_sponsorship_partial_refunds.sql`
25. `20260913081533_volunteer_policy_sources.sql`
26. `20260913081720_volunteer_legacy_identity_reconciliation.sql`
27. `20260913082300_atomic_animal_preference_eligibility.sql`
28. `20260913083120_volunteer_public_availability_summary.sql`
29. `20260913083503_sponsorship_refund_read_models.sql`
30. `20260913084120_volunteer_notification_claim_fencing.sql`
31. `20260913084247_volunteer_booking_shape_guard.sql`
32. `20260913084717_factual_history_runtime_privileges.sql`
33. `20260913084920_volunteer_operational_tasks.sql`
34. `20260913085252_volunteer_promotion_review_tasks.sql`
35. `20260913085500_volunteer_tier_candidates.sql`
36. `20260913090746_volunteer_schedule_integrity.sql`
37. `20260913092132_restrict_receipt_issuance_rpc.sql`

## Static dependency and permission review

- `062837` establishes the volunteer policy/profile/terms/outbox objects and canonical activity bindings. Later attendance/profile/validation/daily/runtime functions depend on it. Domain statement guards and command locks serialize booking and policy mutations before activity/row locks.
- `071632` now creates `animals.gallery` **before** granting its public projection. `publication_state` is a baseline dependency from `20260911140000`; `public_profile` is from `20260906181657`. Verify those effective objects remotely rather than replaying their baseline files. The projection excludes staff notes, and authenticated browser INSERT/UPDATE/DELETE is revoked; the server CMS workflow is required.
- `071927` exact proof review precedes financial closure `073012`, role handoff `080152`, explicit allocation retries `080838`, partial refunds `081521`, and refund export/reconciliation `083503`. Preserve the latest definitions from the full chain. In particular, the final receipt function checks retained amount and locks the donation before issuing; replacing it with the baseline version would remove that protection.
- `081533` defines shelter/source/version/preview tables and source-resolution helpers before its replacement policy command runs. It depends on earlier JSON validation, daily policy and policy simulation helpers. Its RLS-enabled source tables revoke browser and direct service mutations, granting service reads while owner RPCs perform reviewed mutations. It replaces effective policy resolution/validation; applying an older policy migration afterwards would lose source-revision fencing and inheritance behavior.
- `083120` consumes the existing `volunteer_activity_counts(uuid[])` **JSONB** result through `jsonb_to_recordset`. The baseline `20260905163900` and candidate `062837` both return JSONB, so this is not a return-type replacement. Its other dependencies, policy windows and immutable versions, precede it. The summary RPC is service-role-only and returns aggregate counts/windows without registration identities.
- `084120` notification fencing must remain later than the runtime/outbox definitions. `084247` prevents inflating the participant shape of an existing policy booking. Existing `072851` already protects shelter/template identity changes; the regression checks that guard rather than adding a redundant one.
- `084717` revokes runtime TRUNCATE on existing volunteer/history tables and UPDATE/DELETE on audit facts. It performs no data deletion. SELECT/INSERT audit paths and owner RPCs remain usable. Tables introduced afterwards must explicitly apply equivalent privileges; `084920` task completion and `085500` tier candidates do so.
- `084920` adds operational task completion separately from email delivery. `085252` depends only on earlier profile/registration/outbox/audit objects; it records deduplicated promotion follow-up tasks keyed by registration, profile revision and session policy revision. Its RPC is browser-revoked. It does not depend on `085500`.
- `085500` adds immutable senior-candidate evidence and policy-driven promotion hooks after attendance, verified-service history and monthly assessment definitions. Confirm its final content and resulting triggers in the ordered rehearsal after the assessment owner finishes edits.
- Trigger functions need not be executable as ordinary RPCs to fire. Publicly callable pure JSON validators are distinct from privileged commands; verify all SECURITY DEFINER mutation/read commands have deliberate grants. `service_role` bypasses RLS, so RLS alone is not protection for direct mutation or TRUNCATE.

- `090746` adds the legacy-attendance activity-dimension guard and a server-clock generation RPC after policy/schedule/attendance objects exist. Generation uses each policy's IANA timezone and its own effective horizon, never a newer future version's weekdays/horizon. The worker calls this RPC rather than constructing Hong Kong dates for every shelter.

No remaining forward-reference/return-type failure was identified in this static pass. That is narrower than executing the full ordered chain: PL/pgSQL may defer object checks until invocation, and a dirty local stack can retain obsolete overloads. The final rehearsal must verify exact function identities, including the intended three-argument sponsorship delivery claim and the exact proof-review signature, against a clean ordered candidate state.

## Pre-release gates

1. Freeze the exact candidate and attach final ordered replay, `bun run test:acceptance:db`, typecheck/build/lint and role-browser evidence. Recheck schema/function/grant manifests against the frozen files. Current focused evidence includes atomic attendance/cancellation, exact proof/refund/receipt, shared daily quota/release, concurrent booking, immutable shape, history privileges, and promotion continuation/task deduplication; these do not substitute for final integrated evidence.
2. Confirm the explicitly approved remote project and release operator. Take an approved backup/PITR restore point and preserve a schema-only dump, migration ledger, permission manifest and immutable-data aggregate checksums/counts. Keep backup data/credentials private and out of Git. Rehearse restoration into a separate disposable target; never use a restore/reset against the live target as a test.
3. Resolve the 33-versus-63 mapping above and verify required baseline objects. If any candidate object already exists without a ledger entry, inspect its definition and transaction history first; do not blindly rerun or silently mark it applied.
4. Obtain explicit approval for the exact candidate files, privilege changes, affected-write cutover and target. Production application, ledger repair, deployment, provider activation and data reconciliation are distinct actions. This document authorizes none of them.
5. Plan the application/schema cutover together. New grants revoke legacy browser animal writes; exact-proof migrations revoke ambiguous legacy RPCs; future unbound volunteer admissions fail closed. An old application cannot be assumed fully compatible during this interval. Use an explicitly approved write-maintenance window or a separately reviewed compatibility rollout; do not expose a half-migrated application or restore unsafe grants to conceal incompatibility. Preserve inbound provider events for normal idempotent retry rather than replaying payments manually.
6. **Legacy admission readiness:** `081720` rejects new or promoted future unbound bookings. Do not classify/bind old sessions by guessed titles or silently grant identities/terms. Administrators must explicitly publish/bind eligible future sessions and complete required identity/current-terms review. Existing registrations/history remain preserved and necessary cancellation paths remain available. Apply the guard only as part of the approved coordinated cutover, understanding that old signup forms will otherwise refuse submissions safely.
7. Keep operational email sending disabled during rehearsal/cutover unless separately authorized. Validate `CRON_SECRET`, the intended active system actors, and provider configuration without printing secrets. Without the email key, outbox work stays queued. Initial policy/terms/catalogue records are not proof that every operational decision is ready; staff must review unresolved fields and publish the intended prospective policies before opening new admissions.

## Apply and verify

After approval, the operator applies exactly one frozen file per transaction and durably records success before proceeding. For a failure, keep the last known-successful prefix. An uncommitted failed transaction rolls back automatically; an uncertain commit outcome requires read-only ledger/object verification before retry. Do not rerun successful baseline or candidate SQL merely because the caller lost its response.

After the full chain, verify exact definitions/overloads, RLS/grants, trigger installation, canonical IDs/counts and money totals, receipt/refund invariants, existing activity policy bindings, attendance/qualification evidence and audit continuity. Validate staff versus treasurer versus admin versus inactive access with synthetic fixtures only on the rehearsal target; use non-mutating production smoke checks unless a production test action is separately authorized. Record provider acceptance separately from delivery. Monitor task backlog, expired leases, invalid policy bindings and API errors before ending the approved write-maintenance window.

## Recovery and rollback

- Failed uncommitted file: transaction rollback; inspect and fix the candidate, rehearse the corrected exact suffix, then obtain any required change approval. Preserve successful prefix and ledger.
- Successful additive schema with an application issue: keep facts and prefer a forward corrective migration/application release. Rolling back to an incompatible old client is not a safe default after tightened grants or RPC contracts. Do not drop the new canonical/evidence tables or regrant unsafe mutation privileges as an emergency shortcut.
- Policy rollback: copy a prior immutable version into a new draft, preview current affected future sessions/scopes, then publish a new prospective revision. Do not overwrite historic policy bindings, tier decisions, terms evidence or attendance.
- Factual money/attendance corrections: append linked corrections/reversals/refund facts through authorized commands. Do not delete receipts/payments/allocations/attendance/audit records or duplicate a canonical payment to repair a failed UI request. Legacy money reconciliation requires a unique reviewed source mapping; no automatic income backfill by email or guessed reference.
- Full database restore is disaster recovery only, with separate approval and a plan to reconcile every post-backup payment, provider event, booking and external notification. Never restore an old backup over newly accepted factual events merely to undo this feature.

## Review evidence and remaining release work

The invariant review added `084247`, `084717`, `085252`, `090746` and focused tests. It reproduced participant inflation and promotion starvation, verified runtime history privileges read-only, and confirmed existing scope-identity protection. Six local factual workflow tests passed with 192 assertions after the privilege change; policy/release/task/worker checks subsequently passed, including continuation beyond 200 blocked entries. The privilege apply initially hit automatic approval review; after exact loopback-target evidence and the strict localhost-only runner were supplied, the local-only operation was approved and completed. No production privilege operation was attempted.

Final isolated ordered replay, candidate hash verification and the synthetic backup/restore rehearsal are complete in final-acceptance.md. Complete historical production object/ledger equivalence review, approved production backup/restore readiness, production approval, application and deployment remain release gates. Refresh this document and manifest if another candidate is added or an existing candidate changes.

The final grant correction preserves service-role execution for receipt issuance, pledge cancellation and the two adoption coordination commands, while removing PUBLIC/anon/authenticated execution. Role checks against caller-supplied UUIDs are not session authentication. The [bounded effective-schema report](fresh-schema-verification.json) records all 80 public SECURITY DEFINER non-trigger functions and verifies no browser execution remains; trigger functions are excluded because EXECUTE privilege does not govern trigger firing. Its refreshed ledger count is 99, with no unledgered suffix, after the release owner completed the final clean replay.

Historical feature-chain evidence handoff: the original manifest covered 36 candidates (99 files including the 63 baseline); the dated follow-up above adds the verified prerequisite. The final assessment migration hash was refreshed after its owner confirmed the timezone, attendance-unit, shelter-scope and regular-streak corrections were frozen; the server-command grant migration is included. Final extra-blank-line cleanup changed no SQL statements; hashes were regenerated and the exact normalized files were replayed again. The attached `final-acceptance.md` records the completed final99-file clean replay, no-op migration check and repeated full acceptance results. Review that report before production approval. All 36 frozen migration hashes were rechecked unchanged after the final replay; the schema evidence was refreshed against that 99-entry ledger.
