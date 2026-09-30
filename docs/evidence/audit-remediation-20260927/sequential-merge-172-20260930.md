# PR172 sequential release preparation — 2026-09-30

## Scope and state

Repaired application `0af5599648949238d1244a7625b22d0f50baa35f`, predecessor #171 `d496a793c57360604207de6126b6386a418c9d32`, integrated baseline `d426c8a1`. Historical `t23-finance-bank-dryrun.md` retained. Ephemeral bank CSV preview only: no payment settlement, refund, receipt or notification write. Code-complete: this slice; schema-ready: isolated only; deployed:no; operationally-enabled:no. ADMIN-04 remains partial pending later slices and hosted UAT.

## Reproduced defects and repairs

1. Selecting B while A's preview was pending allowed A's result under B. A selection generation fences responses, errors and pending cleanup. Selecting another file clears previous results.
2. A valid HKD row sharing a normalized bank reference with an invalid USD row remained a candidate. Duplicate counting now includes invalid occurrences; the invalid row remains invalid and its valid counterpart becomes duplicate_file.
3. File.text removed UTF-8 BOM before hashing. Fatal TextDecoder with ignoreBOM:true preserves BOM/CRLF, so the server UTF-8 checksum equals the original selected bytes. Malformed UTF-8 is refused before fetching.
4. Actual browser Axe found scrollable-region-focusable. A named keyboard-focusable region permits keyboard scrolling of the wide candidate table.

Unit red5pass/3fail/15assertions,exit1; initial green15pass/48assertions,exit0. Independent review closed all three logic findings and independently ran13tests/37assertions,exit0. Browser baseline at390/768/1366:stale1,hashMismatch,invalidUTF8sent,Axe1; repaired:stale0,hashMatch,invalidUTF8refused,Axe0 at all widths. Harness initially timed out on an overly strict cell accessible-name selector; corrected to the actual nested text. A first Python edit failed due default Windows encoding; rerun explicitly as UTF-8. These harness errors were not passing evidence.

## Executed gates and evidence

| Command | Environment / source | Result / exit |
| --- | --- | --- |
| `bun test --isolate` six bank domain/server/component/API/database files | finalapp; actual service_role on52322/audit_pr135_20260929 |16pass/56assertions/559ms /0 |
| `bun test --isolate --timeout 30000` | repaired logic before final focusability and test-type correction; CHECKOUT_POLICY_TEST_DATABASE_URL=loopback57322/postgres; SUPABASE_LOCAL_URL=http://127.0.0.1:52321 |3099pass/142skip/0fail/9727assertions/565files/50.89s /0 |
| `npm.cmd run typecheck` | finalapp |0; earlier test-only incorrect Promise cast failed exit2 and was fixed |
| `npm.cmd run lint` | finalapp |0;52warnings |
| `npm.cmd run build` | finalapp;synthetic VITE_SUPABASE_URL/ANON_KEY/PUBLISHABLE_KEY,SUPABASE_URL/SERVICE_ROLE_KEY,loopback54329 |0 |
| `bun scripts/verify-bank-dryrun-migration.ts` | named empty local production-schema clone; explicit synthetic fixture opt-in |6oldrows unchanged;exact SQL5.58ms;1000candidate read14.36ms;1001refused;rollback0payments /0 |
| `node scripts/verify-bank-dryrun-review.mjs --before` | original paneld426c8a1;loopback56570;synthetic API |3widths reproducible failures /1 |
| `node scripts/verify-bank-dryrun-review.mjs` | final actual panel;identical fixture390/768/1366 |stale0,SHAoriginalbytes,malformedUTF8refused,1000rows/40pages/25visible;keyboard,Axe0/errors0/nooverflow /0 |

Full suite skips are not passes. No full local rerun after final focusability/test-only type correction; final focused/type/lint/build/browser reran. Latest pushed-head CI still to be recorded. Browser interception uses synthetic candidate responses; true candidate matching is verified by domain/service tests and actual SQL tests. No production identity, bank file or payment was used. SQL test URL guard permits only exact loopback57322/postgres or52322/audit_pr135_20260929 without query/hash plus explicit BANK_DRY_RUN_TEST_ALLOW_LOCAL_FIXTURES=1.

DB assertions execute the RPC under service_role, reject withdrawn finance role, disabled admin, unconfirmed/banned Auth, and verify anon/authenticated execute denied, security-definer empty search_path, jsonb signature and existing payment/donation RLS. Six synthetic old payment/donation JSON records remain identical after migration and preview. Large query caps at1000 and fails closed at1001. Preview creates zero actor audit rows because it writes no business state. Entire rehearsal rolls back and confirms0payments. No historical ledger repair or copied production data.

Before/after UI: `ui/t23-bank-{before,after}-{390,768,1366}.png`. Browser screenshot artifacts generated and UI/Axe checked; standalone image viewer unavailable. Both temporary before/after servers stopped. Timings are one local current-state rehearsal, not a before/after performance improvement. Hosted finance/private-file/export journey, provider sandbox, production DDL/deployment: not-run for this slice.

## Exact migration, compatibility and rollback

`20260928090000_finance_bank_dryrun.sql` unchanged LF SHA256 `9f55dabaa7d884ab2fa40fdb465bd38bce10ac4f8eaec05025e66ecbc45857a0`. Adds partial index `payment_pending_manual_amount_idx` and service-only read RPC `preview_manual_bank_matches(uuid,text[],integer[]) returns jsonb`. No backfill, new table, ledger change, settlement or delivery activation. Locks current actor role/Auth while authorizing; reads only eligible manual providers, pending HKD donation/payment amounts and normalized credited references.

Fresh production read-only catalog:6payment/6donation rows;95migration entries;candidate index and RPC absent. Candidate installed only in local empty clone for tests. Before production: obtain exact per-file approval, recheck source checksum/catalog/signature/grants/RLS and backup suitability, apply only this file, then verify denial and unchanged row counts.57-file source inventory is not a blind apply list.

Existing restricted CurrentUserDPAPI backup `hkscda-before-pr135-20260929T003437Z.dpapi`,1772038bytes,SHA256 C9A32C9303C00AE080C28187B2AD2E0D081211187DE3E2360ED508443BFF79B2. Prior decryption roundtrip checked; full restore not-run,Storage bytes absent; providerbackupsnull/PITRfalse previously observed. Recheck immediately before approvedDDL. App rollback removes the preview route/panel while retaining additive index/RPC; no financial or audit history reversal. Do not invent a certified rollback app SHA.

## Operator handoff and remaining gates

Convert bank export to documented canonical UTF-8 CSV; limits256KiB/1000rows/HKD. Preserve original bytes when reconciling SHA. Invalid/duplicate/already-credited rows are not candidates. Amount-only candidates require human comparison; no row selection or credit action exists. Results are ephemeral and do not reserve or settle a payment. Re-upload/recheck if ledger facts change; use the existing separately authorized atomic single-payment settlement workflow. No blind bulk credit/refund.

Latest verified main/productionalias24196faf027998388eff3196a6979e23566e2443,READY dpl_DJpjHkmVayPsXZqwiA2CMJG43Ygk;mainCI36624781016fivegreen.22/46merged (#134–#155). No new merge. #156actualOTPconcurrencyfailure still blocks original all-green release condition; exception request unanswered. #170CI36646727661 and#171CI36647578935 allfivegreen. Exact#170approval now requested;#172not yet requested at report creation. #157approved waits predecessors;#159–#162/#164–#166/#169exactapprovals pending. Payments/new schedules disabled;existing webhook/reconciliation preserved.

Graph indexing for this worktree was rejected by automatic approval review as possible source export to an untrusted service; local reads were used instead. No source export workaround or external graph mutation was attempted.
