# PR #142 sequential release and migration review — 2026-09-29

Source base tested: 7b927f8da0beeba9192b095948f44c64eda2c03a plus the legacy-retry fix in this commit. Updated predecessor #141 is ce371ff. Production migration and terms publication have NOT been performed for this slice.

## Reproduced upgrade defect and fix

The strict new PDF-hash terms schema rejected a completed pre-upgrade request before the bearer/fingerprint retry lookup. `bun test --isolate src/routes/api/sponsorships/pledges.legacyRetry.test.ts` reproduced 3 failures, exit 1: old explicit/defaulted terms returned 400 instead of recovered 200; a new old-version request returned 400 rather than actionable 409.

The shared schema now has an explicitly separate retry parser that also accepts the exact historical terms identifier/default. The public new-submission schema still requires an explicit content hash. A retry must still match pledge ID, bearer, expiry and canonical fingerprint; new writes must match currently published terms. No old terms are published or accepted for new pledges. Focused four-file route/schema/submission tests: exit 0, 57 pass, 0 fail, 131 assertions. An intermediate edit missed the parser parameter and failed with ReferenceError; corrected. Typecheck then detected the optional schema input type and was corrected to unknown input with string output.

## Final local verification

- `bun test --isolate` with CHECKOUT_POLICY_TEST_DATABASE_URL loopback 57322 and SUPABASE_LOCAL_URL loopback 52321: exit 0, 2852 pass, 83 skip, 0 fail, 8705 assertions across 483 files.
- `bun run typecheck`: exit 0 after the schema input type correction.
- `bun run lint`: exit 0; 53 warnings, zero errors.
- `bun run build` with loopback fixture 54329 and placeholder keys: exit 0; generated route tree unchanged.
- `node scripts/verify-sponsorship-commitment-mobile.mjs`, built preview 127.0.0.1:5184 and synthetic fixture: exit 0 at predecessor tree plus unchanged UI. 390x844 width; keyboard payment radio, proof errors before upload, mocked 400 field error and 409 stale terms preserve input. Two intercepted synthetic requests; no real pledge/upload/email/payment. Refreshed proof-errors-mobile.png.
- Exact updated-head remote five-job CI: pending publication; must pass before merge after #141.

## Single migration proposed for separate approval

File: `supabase/migrations/20260927150000_sponsorship_terms_document_kind.sql`

Committed LF bytes: 661. SHA256: `1f32b4531134e117baf8ff236f2250ca839b2da27ce8560c08498db576b754b3`. The previous manifest hash represented Windows working-copy line endings; the manifest now identifies committed bytes.

Only three ALTER TABLE statements: extend document_assets_kind_check with sponsorship_terms and add a non-null checksum requirement for that kind. No rows, functions, grants, RLS policies, schedules or publication flags change.

Production read-only preflight: document_assets and site_document_slots exist with RLS enabled. The existing kind constraint contains only annual_report/wedding_form/adoption_guide; the sponsorship checksum constraint is absent. Sponsorship documents and published terms slots both count zero. Checkout is false. No RPC signature changes are involved.

Isolated rehearsal environment: database audit_pr135_20260929 in supabase_db_hkscda-audit-integration-fresh; production public/private schema only, local supporting schemas, synthetic rows only, with approved predecessor DDL already rehearsed. Applied this one SQL file using `psql -X -1 -v ON_ERROR_STOP=1`: exit 0. `psql -X -v ON_ERROR_STOP=1` on scripts/test-sponsorship-terms-db.sql: exit 0; rejects missing checksum, RLS/grants assertions pass, anon sees published synthetic terms and cannot see draft, all rows rolled back. A transaction rehearsed restoring the old kind constraint and removing the added constraint while zero new-kind rows exist; exit 0; transaction rolled back to retain rehearsal schema.

Backup: restricted DPAPI CurrentUser encrypted logical backup at `C:\Users\laich\Documents\HKCSDA\.hkscda-private-backups\hkscda-before-pr135-20260929T003437Z.dpapi`, UTC 2026-09-29T00:34:37Z, 1772038 bytes. Ciphertext SHA256 rechecked: `C9A32C9303C00AE080C28187B2AD2E0D081211187DE3E2360ED508443BFF79B2`. No full restore drill; Storage object bytes excluded. See sequential-merge-20260929.md for encryption/readback verification. Do not use real backup rows for synthetic tests.

## Rollback and operational boundary

Prefer reverting application code while retaining additive schema. Restoring the old kind constraint is safe only if there are no sponsorship_terms rows; never delete documents or consent history to force rollback. Preserve existing pledge status links, proofs, bearer/fingerprint retry behavior and payment reconciliation.

Approved zh-HK/en terms PDFs and audited slot publication remain external blockers. Without published terms, new sponsorship submissions stay closed (503); completed matching retries remain recoverable. Applying this migration will NOT publish terms or enable this workflow. No payment activation, CRON_SECRET, new email scheduler, historical replay, real notifications or refunds are authorized. Full real-content journey/provider sandbox tests are not-run.

#134–#139 are merged. #139 merge 379fa0e128a136b9a4877c49b518b620007a55e0, PR CI 36507431928 five jobs passed; deployment dpl_9sEkJbWdwJtnf4ocQK83BdepGq8G READY. #140/#141 still await sequential merge at this record.
