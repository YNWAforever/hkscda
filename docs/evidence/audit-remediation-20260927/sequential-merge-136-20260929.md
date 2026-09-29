# PR #136 sequential release evidence — 2026-09-29

## Prior slices

#134 merged/deployed at f61276f7a7560035ef7da8259eabb9149c82edca; main CI 36502210175 five jobs passed and three public GET routes returned 200. #135 merged at 9609756e69743163e46f9bfde57a5c0cad684255 after repaired-head CI 36503255221 passed all five gates. Its main CI/deployment verification is in progress.

The user separately approved #135's exact production migration and a restricted encrypted local backup. Backup metadata: 2026-09-29T00:34:37Z; Windows DPAPI CurrentUser; current-user-only filesystem ACL; 1,772,038 ciphertext bytes; encrypted round-trip verified; no actual restore; no Storage object bytes. No production data entered test fixtures or Git. Local private path: C:/Users/laich/Documents/HKCSDA/.hkscda-private-backups/hkscda-before-pr135-20260929T003437Z.dpapi. The matching .metadata.json records the ciphertext hash. Recovery needs this Windows user's DPAPI profile; obtain separate approval before decrypting to disk or restoring. The encrypted JSON envelope contains schema/data/roles SQL; use the reviewed Supabase restoration sequence. Do not restore merely to roll back this additive release.

#135 production migration: ledger 20260929003610 / checkout_policy_gate; statement SHA256 eddfba73603c199811c628584f4b0f30347ced0e18916b04c70bc69d4fb7d22c. Ledger 79 -> 80 with no historical relabelling. Policy false, zero approvals/admissions, RLS on three tables, anon/authenticated table/RPC access denied, service-only RPC execution, direct service policy/method UPDATE denied. Existing effective service UPDATE on admission remains. Advisor INFO no-policy findings on these service-only tables are intentional.

## #136 repaired before merge

This PR's replacement admission RPC would restore SECURITY INVOKER and reintroduce the locking failure. Reproduced under service_role on the isolated 57322 fixture: 42501 on checkout_policy FOR SHARE, 0 pass/1 fail. The replacement now preserves the restricted SECURITY DEFINER boundary and fixed search_path; no direct policy grants added. Both donation admissions and immutable snapshot retries are now exercised under SET LOCAL ROLE service_role. CI test:db runs both database suites on its existing local stack.

- Role/locking/retry/approval plus payment snapshot regression: exit 0; 2 pass, 37 assertions.
- Full explicit local fixture test suite: exit 0; 2810 pass, 83 skip, 0 fail; 8585 assertions.
- Standalone typecheck: exit 0.
- Lint first returned exit 1 for six formatting errors in new test wrappers; Prettier fixed them; final lint exit 0, 52 warnings/0 errors.
- Build with fixture config: exit 0; route tree unchanged.
- Exact corrected #136 SQL applied with psql -1 -v ON_ERROR_STOP=1 to the disposable schema-only live clone after only corrected #135: exit 0. RLS, public denials, service RPC grants, policy-write denial, disabled P5101 and zero admissions assertions passed and rolled back.
- New-head remote CI remains a separate gate. Provider payment/email tests: not-run; only local template rendering and synthetic database fixtures used.

## Next production approval scope

File: supabase/migrations/20260927130000_payment_instruction_snapshots.sql
SHA256: aceef86734c3616688fcdb7da6cf27e7fef31ffd0bd46524d896fb05b87e2758

This single migration adds checkout_admission.instruction_snapshot, a service-only sponsorship snapshot table, a capture RPC, and a manual-method approval guard. It replaces admission while retaining its restricted owner execution. Legacy admissions retain an empty snapshot; no invented historical details. Checkout remains disabled and no method approval is created. It sends no email and makes no provider call.

Before application verify the new column/table/capture RPC/guard are absent, prerequisite checkout/payment/sponsorship objects exist, and the policy is still disabled. Apply only the reviewed statement through the migration API in one transaction, not db push. Compare the live ledger statement hash afterward; never relabel old ledger versions.

Rollback: failed DDL rolls back atomically; after commit retain additive snapshot history and revert application code through a reviewed PR. #135 works with the extra snapshot column and replacement RPC. Do not drop financial evidence or re-enable payment as rollback. Existing encrypted backup precedes #135; recovering from it would require replaying the approved #135 schema and reconciling any later production writes, so a full restore is not the default rollback.

Production #136 migration is not yet approved or executed. #136 is code-complete and isolated-schema-ready, not deployed or operationally enabled. #137-#179 remain unmerged.
