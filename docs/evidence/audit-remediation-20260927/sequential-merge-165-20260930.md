# PR165 sequential verification - 2026-09-30 HKT

Reviewed implementation 421bf7f790dd595fbc0161ea885605dde617f3f4, parent PR164 da0c1126. All four independent findings are closed. This slice is code-complete and schema-ready only on the isolated clone; production schema absent, not deployed or operationally enabled. #156 still blocks sequential release.

## Reproduced defects and repairs

- Actor eligibility was checked without row locks: a concurrent role downgrade committed before settlement. Red isolated fixture: 1 pass / 2 fail / 6 assertions / exit1 (also reproduced replay failure). The candidate now holds shared Auth/admin locks through settlement commit.
- Same payment/reference retry after a lost committed response returned state_conflict. Only the same succeeded payment and donation, normalized stored reference, and existing matching durable job now return duplicate. No second credit, job, financial audit or legacy backfill. Different reference, refunded/incompatible state or missing job remain conflicts.
- CRM manual-gift calls sharing the new unique index returned generic500 on a permanent duplicate reference. Only 23505 naming payment_manual_bank_reference_unique maps to409; unrelated unique violations remain failures. Unit red41pass2fail/143assertions/exit1; first combined green46pass169assertions/exit0.
- Worker busy also means already complete, terminal failure or not-yet-due retry. Red31pass1fail/124assertions/exit1; service now reads durable status with pending fallback. Fixed32pass133assertions/exit0, covering complete, attention_required, retryable, processing and absent status.

## Commands actually executed

| Command | Environment / source | Result / exit |
| --- | --- | --- |
| bun test --isolate --timeout 30000 | 421bf7f790dd595fbc0161ea885605dde617f3f4; CHECKOUT_POLICY_TEST_DATABASE_URL loopback57322/postgres; SUPABASE_LOCAL_URL52321 |3017pass /131skip /0fail;9445assertions;544files;36.43s /0 |
| npm.cmd run typecheck | Strict TypeScript, same code |0 |
| npm.cmd run lint | Entire configured tree |0;52 existing warnings |
| npm.cmd run build | Synthetic keys, loopback54329; only one build |0 |
| bun test src/lib/donations/manualAtomic.database.test.ts | MANUAL_FINANCE_TEST_ALLOW_LOCAL_FIXTURES=1; exact52322/audit_pr135_20260929 |4pass /29assertions /0fail;811ms /0 |
| bun test src/lib/crm/manualGift.database.test.ts | CRM explicit fixtures; same isolated clone |17pass /90assertions /0fail;3.99s /0 |
| python scripts/rehearse-manual-finance-local.py | Exact named Docker schema-only clone;6 synthetic old payments/donations,3 succeeded |Full file plus duplicate-history rejection,251ms /0 |
| node scripts/verify-manual-finance-review.mjs | Actual dialog, synthetic API responses reflecting separately tested SQL/service; loopback56563 |390/768/1366px; keyboard; zero Axe/page errors/overflow;0 |

Actual DB roles: service_role succeeds; anon/authenticated denied; disabled/downgraded/unconfirmed/banned actors denied. Actor/Auth changes block while a settlement transaction holds authority. Concurrent same-payment requests return applied+duplicate with one matching job and one payment.mark_received audit. Two distinct concurrent payments sharing the normalized reference yield one success and one23505, one succeeded donation/payment/job/audit. Forced audit failure rolls back money and job. Delivery failures retain committed success. The CI RLS job now explicitly executes this fixture on55322.

The old CRM fixture left its own synthetic Auth user after cleanup; cleanup now deletes that exact seeded identity. The single known orphan in the previously empty local clone was removed with an inventory guard, and the full CRM fixture repeated successfully. No production data was involved. A test-file conflict initially remained in an unpushed merge after a Windows decoding error; the merge was corrected before verification or push, preserving both manual and receipt RPC fakes.

UI baseline uses the former409 API outcome on the same dialog; all three widths failed recovery (exit1). After uses the repaired duplicate outcome: exactly one synthetic credit, two settle attempts, two delivery retries, then one UI refresh. Before/after PNGs: ui/t23-manual-finance-{before,after}-{390,768,1366}.png. Browser/API is synthetic, not a provider sandbox. Browser/server stopped. Hosted real-role API/export/private-file UAT, actual provider sandbox, real emails/payments/refunds, full backup restore and hosted same-environment performance not-run. Skips are not passes.

## Exact SQL and compatibility

20260927201916_manual_payment_atomic_reference.sql LF SHA256 d4f683821d1277d4d6b05d6d671fd63e66f6bc75d274e25496f29e4dc5c37b86. Only this undeployed candidate changed. Adds one normalized partial unique index and service-only definer RPC with empty search_path; no new tables, backfill or triggers. Existing payment/donation/delivery/audit RLS unchanged. Current production read-only inventory: ledger95,6 payments,3 succeeded manual payments,zero duplicate-reference groups; candidate index/RPC absent.

Full-file BEGIN/ROLLBACK creates the index/function against6 synthetic legacy rows and verifies every payment/donation field unchanged. A second full-file drill with duplicate historical references catches23505 without deduplication. Postflight:0 payments/donations/supporters/Auth/jobs; service EXECUTE true, anon/auth false, definer/search_path checked. 251ms includes process startup and is not a production lock estimate. No local/production ledger edited. The regular CREATE INDEX may hold payment writes; use an approved short window after fresh duplicate/catalog/signature/grants/RLS/backup checks. Do not replace failure with blind deduplication or CONCURRENTLY without a new reviewed migration.

Restricted CurrentUser-DPAPI backup previously verified at .hkscda-private-backups/hkscda-before-pr135-20260929T003437Z.dpapi; SHA256 C9A32C9303C00AE080C28187B2AD2E0D081211187DE3E2360ED508443BFF79B2. Recheck inventory before approved DDL. Full restore not-run; Storage bytes absent. App rollback must retain the unique reference index, additive RPC, jobs and all payment/audit facts. Disable affected new commands until a compatible app is verified; never restore an old snapshot over newer financial events.

## Release and staff handoff

#134-#155 merged/deployed22/46, main/alias24196faf READY. Fresh exact #162 CI36634226352, #163 CI36634390245 and #164 CI36634733139 all five gates success. #157 migration approved; #159-#162/#164 exact requests pending; #165 exact request waits for fresh CI. No new production mutation in this slice. Payments and new recovery/media/delivery schedules remain disabled; existing signed webhook/reconciliation intake preserved.

Staff validate the bank reference and one payment, confirm receipt, and inspect the separate delivery result. After an uncertain response, retry the same payment and original reference; the existing job is recovered without another credit. A different reference or changed terminal state is a conflict needing review. Retry receipts from the durable job, never create another gift to fix delivery. Permanent duplicate reference means investigate the prior credit; no bulk refund, approval or identity merge is introduced. Fresh CI pending at this record.
