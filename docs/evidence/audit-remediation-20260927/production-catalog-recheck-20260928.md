# Production catalog and migration ledger recheck — 2026-09-28

Environment: Supabase HKSCDA project `iihqjzilgawhfdhdevam`, read-only metadata only. No application rows, PII, DDL, migration or ledger mutation were read or written. Source: #175 head `f9e3e00f5cd20cee984404b04adc5b0541deca88`.

## Result

- The live `supabase_migrations.schema_migrations` ledger has **79** versions; latest is `20260914164558_editorial_verified_actor`. Both the Supabase migration listing and a separate `SELECT count(*), max(version)` returned this result.
- The reaudit minimum remains absent in `public`: **8/8 tables, 14/14 RPC names and `public_status_token.submission_fingerprint`**. The same read-only catalog SQL used by `scripts/check-release-schema.ts` supplied a filtered metadata snapshot to the repository's exact `checkReleaseSchema` function: **132 requirements, 126 required issues, state `incompatible`** — 26 missing tables, 79 missing functions and 21 missing columns. The six present requirements matched their manifest signatures/returns/grants. This does not audit every constraint, index, forbidden grant or storage policy.
- The repository contains **109** migration files through that version, of which **58** version numbers appear in the live ledger. **51** source versions are missing from the live ledger; **21** live ledger versions have no source file with that version. Some names appear to describe related changes with different timestamps, but equivalence is unverified.
- The #175 disposable **109→160** synthetic upgrade proves those source files can upgrade that constructed baseline while retaining sparse synthetic payments and a failed delivery job. It is **not a rehearsal of the live 79-version ledger** or a production-ready migration path. Do not run blind `db push`, manufacture ledger entries, or apply historical files to production by version alone.

## Release gate

R01 remains **partial / production incompatible**. The metadata-only checker invocation exited 0 while reporting `incompatible`; that exit code is not a release pass. No production application rows were selected. Before requesting a production migration approval, obtain an approved sanitized data-bearing clone or equivalent catalog snapshot; reconcile each divergent historical migration by object definition and data state; design and test an ordered bridge against the actual 79-version baseline; measure locks, backfills, constraints, indexes, grants/RLS/storage policies; prove backup/restore and older-app compatibility. Re-run the complete catalog checker and public content synthetic on the candidate environment. Existing webhook/reconciliation must remain available during any new-checkout pause.

## Source versions absent from live ledger (51)

- `20260626140914_adoption_coordinator_foundation`
- `20260626144836_adoption_coordinator_workflow_rpcs`
- `20260626201620_secure_adoption_applications_policy`
- `20260626202523_harden_webhook_event_processing`
- `20260627091500_tighten_animals_admin_policy`
- `20260628120000_harden_receipt_and_payment_lifecycle`
- `20260628130000_harden_role_grants_drop_stale_policy`
- `20260628140000_revoke_residual_anon_grants`
- `20260628143000_coordinator_ops_workbench`
- `20260628150000_revoke_residual_anon_write_grants`
- `20260628160000_validate_rpc_actor`
- `20260630120000_donation_lifecycle_integrity`
- `20260701105726_admin_access_management`
- `20260701185227_public_adoption_journey_phase_1`
- `20260702130000_sponsorship_pledge_phase_2`
- `20260704165600_volunteer_activity_management_v1`
- `20260705120000_story_promotion_center`
- `20260716120000_contextual_donation_attribution`
- `20260718120000_group_enquiries_and_knowledge`
- `20260718121000_seed_knowledge_guides`
- `20260718122000_correct_service_slogan`
- `20260720100000_cod_alipayhk_payment_support`
- `20260731120000_adoption_guide_release_cms`
- `20260801180000_adoption_guide_release_cms_advisor_fixes`
- `20260805120000_animal_mutation_audit_atomicity`
- `20260816120000_cod_payment_order_reference`
- `20260829120000_governance_board_members`
- `20260829180000_sponsorship_pledge_admin_review`
- `20260830120000_faq_entry`
- `20260830130000_adoption_rules_care_topics`
- `20260830140000_about_page_content`
- `20260831120000_payment_public_config`
- `20260831160000_content_media_storage_bucket`
- `20260905144848_public_supporter_identity_claims`
- `20260905150012_content_revision_lifecycle`
- `20260905155357_crm_manual_gift_delivery_jobs`
- `20260905155426_content_private_media_sessions`
- `20260905162615_crm_complete_read_models`
- `20260905163559_content_bounded_authoring_reads`
- `20260905163900_volunteer_atomic_approval`
- `20260906162436_animal_catalog_membership`
- `20260906181657_animal_public_profile`
- `20260911120000_sponsorship_public_identity_protection`
- `20260911130000_animal_images_bucket`
- `20260911140000_animal_publication_state`
- `20260911150000_preserve_eligibility_on_species_change`
- `20260911160000_correct_legacy_sponsor_species`
- `20260911170000_publish_fostered_animals`
- `20260911180000_sponsorship_second_month`
- `20260911190000_sponsorship_monthly_ledger`
- `20260912120000_sponsorship_assignments`

## Live ledger versions absent from source by version (21)

- `20260707094012_story_promotion_center`
- `20260724023312_group_enquiries_and_knowledge`
- `20260724023618_seed_knowledge_guides`
- `20260726170246_correct_service_slogan`
- `20260731164635_adoption_guide_release_cms`
- `20260731171123_adoption_guide_release_cms_advisor_fixes`
- `20260906062155_cms_payment_read_compatibility_repair`
- `20260906173545_animal_catalog_membership`
- `20260907011009_animal_public_profile`
- `20260912073702_public_supporter_identity_claims`
- `20260912073842_sponsorship_public_identity_protection`
- `20260912074006_crm_manual_gift_delivery_jobs`
- `20260912074036_volunteer_atomic_approval`
- `20260912074117_animal_images_bucket`
- `20260912074156_animal_publication_state`
- `20260912074228_preserve_eligibility_on_species_change`
- `20260912074346_correct_legacy_sponsor_species`
- `20260912074430_publish_fostered_animals`
- `20260912074524_sponsorship_second_month`
- `20260912074646_sponsorship_monthly_ledger`
- `20260912074747_sponsorship_assignments`

## #178 source-manifest re-evaluation of saved metadata

Without a new production query, the prior read-only JSON snapshot was checked against the #178 140-requirement manifest: incompatible, 134 required missing entries (28 tables, 83 functions, 23 columns). The last observed live ledger is still 79 versions; the source-only/live-only divergence through the same live maximum remains 51/21 versions. The #178 additive migration is the 53rd post-ledger source file. No production catalog, migration or app state was changed. A fresh live catalog and sanitized bridge rehearsal remain required before approval.
