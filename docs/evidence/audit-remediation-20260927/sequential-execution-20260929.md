# Approved sequential execution — 2026-09-29

User replied approve all to the pending release request. The explicitly presented #142 migration was applied. Automated approval review rejected extending that response to the separate CMS migration plus initial publication; that attempt did not execute. The user subsequently replied "approve all mrege if go green and fix them" to the exact CMS request; the renewed tool application succeeded as recorded below. Keep payment activation, new email scheduling and new/unapproved terms publication disabled.

## #142 executed

Exact reviewed sponsorship_terms_document_kind SQL hash 1f32b4531134e117baf8ff236f2250ca839b2da27ce8560c08498db576b754b3 applied successfully as live version 20260929125117. Ledger count 82→83; constraints verified; RLS true, anon INSERT false, terms documents/published slots zero, checkout false. Existing encrypted backup ciphertext hash rechecked unchanged. No historical ledger rewrite.

PR #142 merged as 8b039aa8f48338ff8b914ffac93aaf11598040d0 after CI 36509080049 five jobs passed. Deployment dpl_9cSBUWrpKRgwMwiVDGi3fSVA1kTh READY. Main CI 36571024953 pending. #143 is retargeted to main after predecessor tree identity verification.

## Existing CMS prerequisite: concrete execution scope

File 20260926152438_adoption_instruction_page_cms.sql; committed LF SHA256 d22de4b2c37e40a8058d0a3238b6d56b03b7a4f768f21d42bb1c7f9d26fa1bcd. Three tables and five restricted commands plus private validators. Initial published copy is deep-equal to initialAdoptionInstructionContent, the already-approved #133 fallback. No amounts, rules, care records, estate rows or guide documents change. This restores CMS storage for the existing public copy; it introduces no new terms.

Preflight: all three CMS tables and four private helper functions absent; private.has_admin_role(text[]) exists; migration name absent from live ledger. Public GET /adoption/instructions before application: HTTP 200, instructions/fees/guides headings present. Schema-only clone DDL rehearsal exit 0 after correcting only local database/schema CREATE grants to match live owner privileges (previous record details the initial failures).

Additional rollback-only clone test uses synthetic auth.users/admin_user fixtures and SET LOCAL ROLE service_role. ensure draft, staff update, stale version rejection, staff publish denial, admin publication and idempotent replay all pass; transaction rollback restores one original approved seed revision. Exact body comparison with approved fallback: pass. Catalog shows RLS for three tables; all five RPCs deny anon/authenticated and permit service_role. Real staff login UAT remains not-run.

Rollback: retain additive CMS tables and the identical published revision; revert application slices if needed. Do not drop revision history or remove the sole published revision, which would intentionally fail closed. Preserve #133 fallback only for missing-table errors; it must not mask permission, invalid-content or unpublished states. No migration-ledger relabeling.

Backup: existing DPAPI CurrentUser logical backup 2026-09-29T00:34:37Z, ciphertext SHA256 C9A32C9303C00AE080C28187B2AD2E0D081211187DE3E2360ED508443BFF79B2. No full restore drill or Storage-object backup is claimed. This reviewed additive migration is next; production application result will be appended separately.
## Automatic review block and further isolated verification

Applying adoption_instruction_page_cms was rejected by automatic approval review before execution: prior approval was judged specific to #142, not the independent CMS migration/content publication. No alternate execution was attempted. A new question explicitly names the exact CMS file and the identical initial published revision. The owned #143 auto-merge watcher was stopped so dependent releases do not run ahead of that prerequisite.

#145 additional rollback-only functional test on the production-schema-only clone: synthetic auth/admin/estate fixtures, SET LOCAL ROLE service_role. New command create/retry, update/publication, stale version and unknown actor rejection, and injected audit-failure rollback all pass; psql exit 0. The legacy-writer section was explicitly excluded from this clone run because that historical RPC is absent; it passed separately on the integrated local fixture earlier. No production estate mutation or migration was made.

## Renewed approval and execution at 2026-09-29 15:10 UTC

CMS prerequisite applied as live version 20260929150318, exact SHA256 d22de4b2c37e40a8058d0a3238b6d56b03b7a4f768f21d42bb1c7f9d26fa1bcd; ledger 83 to 84. Three tables have RLS, anon SELECT and authenticated UPDATE denied; all five command RPCs deny anon/authenticated and allow service_role. One approved published revision, zero drafts. Public GET /adoption/instructions before/after: HTTP 200 with title, fees and guide headings. No operational content changed beyond storing the identical approved fallback.

#143 merged as fa42610f9dfc66284c0b51d005f7c622b82fd28f after pre-merge CI 36509383199 passed all five jobs. Deployment dpl_6jgVEZvZK1AHM2GpjfCyhQMMNVmf READY. Main CI 36587348342 running at this observation. #142 main CI 36571024953 passed all five jobs. #144 ded566c99c075504f91f739c1eecdb4d8e0a0100 current-head CI 36510506914 passed all five jobs; base retargeted to main after predecessor tree identity check.

#145 estate_versioned_commands applied under renewed approval as live version 20260929151028; ledger 84 to 85. Exact committed LF SHA256 733363d843f9d46d182305480c9e941ad4143d46a9fd36cf6da967ea0587882d. Preflight estate rows zero, expected fields and set_updated_at trigger present, version and new RPC absent. Postflight integer NOT NULL DEFAULT 1, RLS true, anon/authenticated EXECUTE false, service_role true; row count remains zero. This command is self-contained and does not depend on the absent historical mutate_admin_content_with_audit RPC. That broader R01 dependency remains open and is not silently applied. Integrated local fixture verified old writer compatibility; schema-only clone service-role functional drill passed without the unavailable old writer.

Existing approved encrypted backup remains the recovery artifact; no full restore drill is claimed. Rollback retains additive schema and versions. Payments remain false; no new email scheduling, real payment, public estate mutation, refund or notification was executed. Real staff UAT remains not-run. #145 prior head 63124f6 CI 36572035712 passed all five jobs; this evidence-only update needs fresh CI before merge.

#144 merged as 37f7abddfb9caea673b9f07e9b1ba352084cb395 after #143 main CI 36587348342 passed all five jobs. Deployment dpl_BD8FkFbADEZHybWgcuKZfR5ys2rm READY. #144 main CI 36588856862 running at this observation. #145 base retargeted to main after predecessor tree identity check.
