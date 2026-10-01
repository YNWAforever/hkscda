# Current migration execution and recovery runbook — 2026-10-01 HKT

Actual snapshot 2026-10-01T06:26:12.394736+00:00. This addendum preserves earlier SQL/audit/rehearsal reports. Latest observed genuine provider ledger **109**. Source migration timestamp is an inventory identifier; it is never inserted into the production ledger to imitate prior execution.

## Actual approved applications

| PR | Canonical file / SHA256 | Provider version | Ledger | Proof |
|---|---|---|---|---|
|#160|`20260927181701_volunteer_review_bulk.sql` / `96149a16e41cdf9fdf2e246b700033877fc91c3c00403a2b2efcd39d12cb3164`|`20261001014214`|98→99|[all-merge-execution-20261001.json](all-merge-execution-20261001.json)|
|#182|`20261001080000_service_readonly_evidence_privileges.sql` / `e0023564a32cc3f46aff90647c0fa42a9909d9826e37c72442e4cf9a0e557808`|`20261001014620`|99→100|[all-merge-execution-20261001.json](all-merge-execution-20261001.json)|
|#161|`20260927183000_adoption_assignment_bulk.sql` / `cd14343255b0e9c5901beed3952de6da03bcade1e56284994f5edc7e92cce238`|`20261001022601`|100→101|[all-merge-execution-20261001.json](all-merge-execution-20261001.json)|
|#162|`20260927184500_animal_review_bulk.sql` / `8f5eceb8b99aecd8914f131b1a44be4eaf1a5ad3e5e6f13239d2137cbc253c41`|`20261001024348`|101→102|[all-merge-execution-20261001.json](all-merge-execution-20261001.json)|
|#164|`20260927190000_cms_review_bulk.sql` / `b564a09a64d523a8145eef01548dd90f1477ac291f7aac236f6deeca42e3efcb`|`20261001031157`|102→103|[all-merge-execution-20261001.json](all-merge-execution-20261001.json)|
|#165|`20260927201916_manual_payment_atomic_reference.sql` / `d4f683821d1277d4d6b05d6d671fd63e66f6bc75d274e25496f29e4dc5c37b86`|`20261001032650`|103→104|[all-merge-execution-20261001.json](all-merge-execution-20261001.json)|
|#166|`20260927211801_editorial_quality_queue.sql` / `8c1b4550d4361f348246654bab356f3cd2366de48afb0eb384b90efb38526642`|`20261001034448`|104→105|[all-merge-166-postflight-20261001.json](all-merge-166-postflight-20261001.json)|
|#169|`20260928073000_sponsorship_followup_assignment.sql` / `c1eb28ad0953d0ae3f9d85c574c363ee2fe342ea68ddc5bd9f6b9b09baf04ef2`|`20261001045928`|105→106|[all-merge-169-postflight-20261001.json](all-merge-169-postflight-20261001.json)|
|#170|`20260928080000_sponsorship_followup_bulk.sql` / `c3819e013b6593b36d0257ad54d6920c75529596dda460f6d66011fe83857800`|`20261001051516`|106→107|[all-merge-170-postflight-20261001.json](all-merge-170-postflight-20261001.json)|
|#172|`20260928090000_finance_bank_dryrun.sql` / `9f55dabaa7d884ab2fa40fdb465bd38bce10ac4f8eaec05025e66ecbc45857a0`|`20261001055531`|107→108|[all-merge-172-postflight-20261001.json](all-merge-172-postflight-20261001.json)|
|#173|`20260928100000_finance_delivery_retry_guard.sql` / `27a5e87e3175bd545b6fe0a03429933bb617dc4c7f30f5dd3538de61539ddf0a`|`20261001061046`|108→109|[all-merge-173-postflight-20261001.json](all-merge-173-postflight-20261001.json)|

Earlier separately approved source→provider mappings remain in [release manifest](release-manifest.json) and per-PR sequential reports. [63-file canonical checksums](migration-manifest.csv) enumerate source files; whole-file historical rehearsal found collisions and is not an apply-all runbook. No blind legacy replay, `db push`, reset, dedupe or ledger fabrication is authorized.

## Before any further approved DDL

1. Read the exact human-approved file/hash/scope and intended data effects. Verify a clean isolated source checkout, five exact-head PR gates, previous accepted main five gates, and READY alias with the same SHA.
2. Query actual catalog signatures, returns, owners, SECURITY DEFINER/search_path, effective privileges/full normalized ACL grantors/options, table/column grants, RLS/FORCE RLS/policies, triggers/constraints and indexes. Check absence or precisely authorized replacement, prerequisite functions, expected zero queues and normalized existing-row/audit hashes. [Projection limits](catalog-projection-review-20261001.md) retain older evidence boundaries.
3. Rehearse the exact canonical SQL against an isolated schema and synthetic data, including service-role/direct-role denial, existing-row backfill, concurrent version/deadline/unique-reference waits, audit rollback, retries and partial results as applicable. Verify grants after apply; a build is not a typecheck. No production identity or actor RPC is used as a test.
4. Verify the approved restricted encrypted backup exists, ciphertext hash and current-user ACL/decryption roundtrip. Dump schema/data/roles separately in memory; this is not one transactional snapshot. Storage bytes/full restore/off-machine recovery are not certified by that backup test.
5. Apply once through the migration API with `SET LOCAL lock_timeout = '5s'` and `statement_timeout = '30s'`. An unknown response requires catalog/ledger inspection before any retry. Do not blindly reapply.
6. Read-only postflight must prove exactly one genuine ledger increment and exact approved schema/ACL differences, valid/ready indexes with precise predicates, expected row counts/hashes and checkout `enabled=false/version1`. Record actual provider version and command/exit/environment. Only then merge the exact green PR normally.
7. Wait for all five main gates and same-SHA READY before accepting the release or starting the next production DDL. Keep source/schema/deployed/operationally-enabled states separate. No direct main push, forced/admin merge or public preview.

## Compatibility and rollback boundaries

- #173 intentionally replaces only the exact retry RPC body/search_path; its full owner/return/volatility/ACL and existing row facts remain preserved. It creates no job and activates no schedule.
- #175 confirmation adds empty operation/results and restricted RPCs. Synthetic races/expired lock waits are rehearsed; no real bank confirmation/credit/refund occurs during rollout. Existing money/audit facts are immutable.
- #177 removes only PUBLIC/anon/authenticated/service-role EXECUTE on the existing private bump trigger function. Trigger owner execution and original function definition/config remain; it performs no second version backfill.
- #178 adds a nullable CRM owner and restricted bulk operations. Existing11 columns retain effective ordinary client privileges; the new owner column is not client-writable. Existing15 supporters/roles/audits and edit versions remain unchanged, new owners NULL. It performs no assignment or identity merge.
- App rollback stops affected new writers/claims/UI and preserves additive schema, tightened ACLs, immutable revisions, committed financial events, audit logs, operations/results and delivery facts. Existing signed webhook ingestion/reconciliation stays available. Receipt/email failure never resets payment success to pending.
- Never restore an older DB over newer provider events. No complete older application SHA is certified against the final schema; verify a concrete rollback target in isolation first. Full restore/Storage/off-machine recovery remains an external gate.

Current backup ciphertext SHA `78a3de25d70a46093b952a9aca1f3559ef3cab1f8c24fd506933bc007df175bf` / completed `2026-10-01T06:14:10Z`; backup payload is local and excluded from Git. Payments, new sending and new media schedules remain disabled. Residual legacy catalog issues require a concrete forward diff, isolated rehearsal, impact evidence and scoped approval.
