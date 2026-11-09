# Migration baseline & stale-schema catch-up — 2026-11-10

## Incident

While reconciling the repository's migration history against the production Supabase project
(`iihqjzilgawhfdhdevam`), it was found that production was missing an entire wave of migrations
(the "mainline atomicity" migrations of 2026-09-25/26 and the "R01 forward" migrations of
2026-10-01…10-13) that the repository's application code depends on. Concretely, the deployed code
at `25810c74` called:

- **21 RPCs that did not exist in production**, e.g. `invite_admin_user_with_audit`,
  `resend_admin_invite_with_audit`, `activate_admin_invite_with_audit`,
  `create_public_sponsorship_pledge`, `cms_promotion_command`,
  `update_group_enquiry_with_audit`, `append_crm_consents_with_audit`,
  `replace_supporter_roles_atomic`, `create_volunteer_registration_idempotent`,
  `clone_volunteer_activity_with_audit`, `fail_pending_provider_payment`,
  `refund_provider_payment_atomically`, `void_donation_receipts_with_audit`,
  `set_animal_archived_with_audit`, `reserve_animal_draft_image_upload`,
  `reserve_staff_sponsorship_proof_upload`, `cleanup_expired_adoption_application`,
  `claim_expired_*` upload cleaners, and `create_manual_adoption_case` (private implementation
  existed but the public PostgREST wrapper did not);
- **6 relations that did not exist**: `adoption_upload_intent`,
  `animal_draft_image_upload_intent`, `internship_attachment_upload_intent`,
  `sponsorship_proof_upload_intent`, `sponsorship_staff_proof_upload_intent` and
  `private.document_publication_fences`;
- **supporting objects**: 1 column (`public_status_token.submission_fingerprint`), indexes,
  triggers (`lock_admin_user_mutation`, `require_active_admin_user`,
  `animal_draft_image_attached`, upload-completion triggers, document-fence triggers) and the
  saved-review reads.

Effect: sponsorship-pledge submission, adoption photo uploads, manual intake, volunteer booking,
admin invites/resend/activation, CRM role/consent editing, finance refund/void actions, admin
animal archive/draft-image upload, CMS promotion and the upload-cleanup cron jobs failed at
request time on production. The repository's own `docs/evidence` migration receipts did not cover
this wave, and neither did the production `supabase_migrations` ledger.

## Repair

`supabase/migrations/20261110120000_catchup_missing_r01_objects.sql` restores **only the absent
objects**, reconstructed from the repository's own migration definitions (latest definition per
function, by migration timestamp). It deliberately does **not** re-apply migrations that would
replace already-present functions, and it deliberately omits the two policies that later fixes
intentionally changed (`audit_log` staff read revoked by AUTH-01; `admin_user` "admins can view
admin users" superseded by mainline policies).

`supabase/migrations/20261110130000_catchup_manual_adoption_case_public_wrapper.sql` adds the
missing public PostgREST wrapper for manual intake (the private implementation already existed).

Both were validated with a rolled-back production transaction first, then applied in one
transaction each:

| Object group | Before | After |
|---|---|---|
| functions | 384 | 414 (+30) |
| tables | 159 | 165 (+6) |
| triggers | 161 | 167 (+6) |
| `public_status_token.submission_fingerprint` | absent | present |
| public tables with RLS | — | all restored tables RLS-enabled, no `anon`/`authenticated` grants |

Post-apply checks (production):

- **0** code-referenced RPCs missing from the `public` schema (all 151 names resolve);
- **0** code-referenced relations missing (tables + views);
- **0** statically declared objects (`create table/function/type/index/policy/trigger`,
  `alter table … add column`) missing across **all 231 repository migrations**;
- live app unchanged: `/admin/login` 200, `/api/admin/me` 401 without a token.

## Ledger baseline

The repository's migration filenames do not all match production's ledger: 145 repository
versions had no ledger row at all, while 78 ledger rows describe older/renamed migration files
that the repository no longer carries (for example the six 2026-10-29 migrations that production
recorded under later timestamps, and an early `20260906062155` compatibility repair). With the
object-level reconciliation above complete, the missing **145 repository versions were recorded as
applied** (statements + `created_by = 'baseline reconciliation 2026-11-10 …'`) so that
`supabase db push` no longer tries to replay them:

- repository versions: 231 · previously recorded: 86 · recorded by this baseline: 145 ·
  **remaining: 0**
- production ledger total: 309 rows (231 repository versions + 78 historical/renamed rows).
  The 78 historical rows are left untouched (append-only provenance).

## Residual risks (read before the next schema change)

1. **RESOLVED 2026-11-10:** four functions were replaced with their latest repository bodies (see `20261110140000_function_parity_and_guide_uniqueness.sql`); `upsert_about_page_content_with_audit` had already been redefined by the editor-fence migration. The baseline now matches the repository at the object level for every statically declared object. Original note: five functions ran an older body
   (`record_sponsorship_payment_proof`, `upsert_about_page_content_with_audit`,
   `read_content_admin_summaries`, `claim_volunteer_operation_outbox`,
   `volunteer_roster_attendance_result`). The differences are small but were not forced in this
   change because production's body may come from a later, dynamically created definition that
   is not statically extractable from the repository. Treat behavioural parity for these as
   unverified; a follow-up should regenerate each from the repository migration and compare with
   tests.
2. Objects created dynamically inside `DO`/`execute format(...)` blocks are invisible to the
   static reconstruction; the object-level check above covers statically declared objects only.
3. `create_manual_adoption_case` (and other RPCs) must stay in the `public` schema for PostgREST;
   name-only checks are not enough — restrict future compatibility checks to `public` for
   RPCs.
4. This baseline is a one-off reconciliation. New schema changes should be normal, additive,
   timestamped migrations; do not hand-edit `supabase_migrations`.
5. The synthetic rows carry `created_by` labels so a future operator can tell them apart.
