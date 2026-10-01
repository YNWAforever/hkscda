# R01 legacy migration review and actual rehearsal — 2026-10-01 HKT

Source inspected: `c63fc81bf464d7b114bdf530c74b159024604974`. All 62 original manifest canonical LF checksums matched; 171 SQL source files were inspected. The separate forward privilege fix in [#182](https://github.com/YNWAforever/hkscda/pull/182) was added afterwards, bringing the candidate manifest to 63. Its role tests and SQL rehearsal are separately bound to `aca5822a`; neither set of results is relabelled as a new full combined run.

## Current catalog and file mapping

Production read-only artifacts contain schema metadata only: 138 public tables, 276 public functions, ledger98. The implemented checker reports146 requirements and92 gaps:21 tables,61 functions,10 columns. All92 are schema-qualified and mapped to exact manifest filenames/checksums:45 legacy gaps across24 earlier files,47 gaps across12 later source files within the13-file candidate migration packet. The #177 version-fence file contributes no missing declaration. The supplemental inspection includes314 public/private function signatures/owners/role grants/config/definition MD5,743 constraints,367 indexes,88 policies,4 schemas,12 default-ACL entries and20 column-ACL entries. These counts do not certify every private function, storage policy or data-bearing behavior.

[Sanitized 62-file results and 92 source mappings](r01-legacy-migration-verification-20261001.json); [compact per-file checksum/applicability/approval inventory](r01-legacy-migration-inventory-20261001.csv). Full catalog dumps, raw function bodies, private connection details and application rows remain outside Git.

## Actual commands and bounded results

| Command / environment | Actual result / exit |
|---|---|
| `bun task-r01-legacy-slices-inventory.ts`; Windows/Bun1.3.14, two existing isolated stacks read-only | Fresh schema/ACL/function/role/ledger/sequence/data-hash snapshots /0 |
| `bun task-r01-harness-probe.ts`; loopback synthetic clone | Read-only parameter-binding probe /0 |
| `bun task-r01-legacy-slices-rehearsal.ts`; collision-guarded disposable synthetic copy, PostgreSQL17.6 | Final36 whole-file successes /26 whole-file collisions; harness0, each failed SQL file1 and savepoint rollback |
| Six focused role/constraint checks; same disposable candidate |6 expected SQLSTATE matches; bounded to original local owner/default context |
| `bun task-r01-archive-default-acl-red.ts`; new disposable copy with production postgres/default ACLs | Expected RED1: service INSERT/UPDATE/DELETE/TRUNCATE all allowed, four expected42501 checks fail |
| Whole transaction rollback / cleanup / original-stack comparison | Exact original full hashes; only newly created copies dropped without FORCE /0 |

The older clone starts with45 implemented gaps. The36 successful whole files reduce that checker to0 on the synthetic candidate. Fourteen collisions also concern objects already present in production; twelve concern candidate/template objects absent from production. Source SQL was executed whole: no pre-existing table/column/function/index was removed to force success, no clauses were stripped, and no migration ledger rows were invented. A local whole-file success does not establish safe production replay. Existing-object collisions need reviewed forward changes or a predecessor-matching rehearsal.

Initial retained failures: shell ACL startup and Node startup failed before database work; initial CREATE permission failed1 before a candidate existed. Array/JSON catalog binding diagnostics produced process0 but62 per-file semantic failures and45 remaining gaps; both attempts rolled back and cleaned up. The successful36/26 pass followed a read-only binding probe. A report-generation heading assertion and absent-function metadata parser failure occurred before publication; corrected summaries preserve null for absent production functions. No SQL/tests were rerun for these publication corrections.

A publication validator initially required the two trackers to be wholly identical and exited1 because their pre-existing R06 baseline text differs. The corrected validator exits0: both have34 IDs, R01 is identical, and each tracker's33 unrelated rows exactly match its own c63 baseline. That historical baseline text is preserved.

## Data and permission behavior actually exercised

- 1,000 synthetic status tokens keep NULL fingerprints; invalid non-hex input fails23514. No invented fingerprint backfill.
- 1,000 synthetic supporters retain version1. The clone already had the column: replay/preservation evidence only, not a fresh production column rewrite measurement.
- One three-draft synthetic duplicate group becomes live1/archive2; the sent_manually draft is retained, original archived IDs/recipient/body values and kept_id links are preserved. The target unique index rejects another duplicate with23505. This historical file deletes duplicate live rows; it requires separate production duplicate/lock/data review.
- Original audit9, checkout policy1, instruction page1 and revision1 retain exact row hashes. Candidate ledger0 is unchanged.
- anon/authenticated manual-adoption wrapper calls fail42501; the private supporter-version trigger's direct service EXECUTE fails42501 in the tested local context.

All original schema/data/sequence/function-OID/owner/ACL/config/default/role/ledger hashes restore exactly: clone `96379458830fa9f8bd2e4dae283dced3f57f26313dabbfdf2ce7835e0242a7e4`, dedicated stack `563122cc633da61f519909ba77cb6af26f651aca52649bcf00f325eff1b17058`. Existing dedicated provider sessions were preserved. No original DB was cloned while active, reset, force-dropped or given fixture DML.

## Defect found and completed repair

The broad pass ran as local supabase_admin, whose public defaults differ from production. Matching production postgres/default ALL grants exposes an archive write hole despite RLS: service_role has BYPASSRLS and actual INSERT1/UPDATE1/DELETE1/TRUNCATE2→0 succeeded in independent rollback savepoints. Existing production export jobs and instruction snapshots share the same source omission: granting SELECT does not remove inherited writes. The original owner-context service archive denial is superseded by this counterexample.

[#182](https://github.com/YNWAforever/hkscda/pull/182) adds the forward-only three-table ACL clamp and real role regression. Exact repair SHA256 `e0023564a32cc3f46aff90647c0fa42a9909d9826e37c72442e4cf9a0e557808`: matched RED3pass17fail → GREEN20pass0fail/110assertions. Full-file rollback, idempotency, later unchanged owner archival and original audit/session preservation passed. It creates only an empty archive; historical deduplication is not part of its production scope. Existing export/snapshot runtime writers use guarded owner SECURITY DEFINER RPCs. [Detailed gates, instrumentation failures, preflight and rollback](sequential-fix-r01-readonly-20261001.md).

## Compatibility, approval and recovery boundaries

The missing public manual-adoption wrapper maps to `20260926133000_expose_manual_adoption_case_rpc.sql` only. Its private four-argument/jsonb implementation already exists with pinned search_path and service-only EXECUTE; the older coordinator-workbench file defines that private dependency and is not proposed for replay merely because its historical ledger version is absent.

All schemas inspected deny CREATE to anon/authenticated/service; service has BYPASSRLS, so table and column grants remain material. Function-definition MD5 differences require rendered-body/later-replacement review; they are not proof of a behavioral regression. Temp-shadowing, unrestricted private trigger hardening and complete storage policy checks remain separate, unverified scopes.

Overall R01 stays **partial / production-incompatible / not operationally enabled**. No authority is inferred for applying all62 historical files or all63 current manifest files. The #182 exact new production migration needs named approval; #160's existing named question remains pending; #161's prior named approval remains operative. Each next approved file still requires fresh encrypted backup/catalog/owner/signature/grant/RLS preflight, bounded transaction, one genuine ledger addition, postflight invariants, green exact-head/main CI and same-SHA READY alias.

Rollback preserves additive evidence and tightened privileges; never overwrite newer audit/finance facts, restore unsafe direct service grants, discard archived originals or fabricate migration ledger entries. Full backup restore/off-machine/Storage recovery, hosted real-role API/private-file/export UAT, provider sandbox and production duplicate/backfill sizing are not-run. New payment admission, new delivery and media schedules remain disabled; existing webhook/reconciliation remain available.
