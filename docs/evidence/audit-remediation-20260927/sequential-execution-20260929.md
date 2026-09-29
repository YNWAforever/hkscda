# Approved sequential execution — 2026-09-29

User approved all pending items after #142–#145 review evidence was presented. Continue sequentially with current-head green gates, keeping payment activation, new email scheduling and new/unapproved terms publication disabled.

## #142 executed

Exact reviewed sponsorship_terms_document_kind SQL hash 1f32b4531134e117baf8ff236f2250ca839b2da27ce8560c08498db576b754b3 applied successfully as live version 20260929125117. Ledger count 82→83; constraints verified; RLS true, anon INSERT false, terms documents/published slots zero, checkout false. Existing encrypted backup ciphertext hash rechecked unchanged. No historical ledger rewrite.

PR #142 merged as 8b039aa8f48338ff8b914ffac93aaf11598040d0 after CI 36509080049 five jobs passed. Deployment dpl_9cSBUWrpKRgwMwiVDGi3fSVA1kTh READY. Main CI 36571024953 pending. #143 is retargeted to main after predecessor tree identity verification.

## Existing CMS prerequisite: concrete execution scope

File 20260926152438_adoption_instruction_page_cms.sql; committed LF SHA256 d22de4b2c37e40a8058d0a3238b6d56b03b7a4f768f21d42bb1c7f9d26fa1bcd. Three tables and five restricted commands plus private validators. Initial published copy is deep-equal to initialAdoptionInstructionContent, the already-approved #133 fallback. No amounts, rules, care records, estate rows or guide documents change. This restores CMS storage for the existing public copy; it introduces no new terms.

Preflight: all three CMS tables and four private helper functions absent; private.has_admin_role(text[]) exists; migration name absent from live ledger. Public GET /adoption/instructions before application: HTTP 200, instructions/fees/guides headings present. Schema-only clone DDL rehearsal exit 0 after correcting only local database/schema CREATE grants to match live owner privileges (previous record details the initial failures).

Additional rollback-only clone test uses synthetic auth.users/admin_user fixtures and SET LOCAL ROLE service_role. ensure draft, staff update, stale version rejection, staff publish denial, admin publication and idempotent replay all pass; transaction rollback restores one original approved seed revision. Exact body comparison with approved fallback: pass. Catalog shows RLS for three tables; all five RPCs deny anon/authenticated and permit service_role. Real staff login UAT remains not-run.

Rollback: retain additive CMS tables and the identical published revision; revert application slices if needed. Do not drop revision history or remove the sole published revision, which would intentionally fail closed. Preserve #133 fallback only for missing-table errors; it must not mask permission, invalid-content or unpublished states. No migration-ledger relabeling.

Backup: existing DPAPI CurrentUser logical backup 2026-09-29T00:34:37Z, ciphertext SHA256 C9A32C9303C00AE080C28187B2AD2E0D081211187DE3E2360ED508443BFF79B2. No full restore drill or Storage-object backup is claimed. This reviewed additive migration is next; production application result will be appended separately.
