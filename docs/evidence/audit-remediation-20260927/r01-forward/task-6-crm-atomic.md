# R01 Task 6 - CRM atomic commands

## Status and exact bindings

Source complete and verified in isolated synthetic clones; controller independent review and exact-head CI remain required. Execution parent/accepted Task5 base: `592bcebda2dc0154d20684a1a2240cfbdd8ae3d1`; branch `codex/audit-r01-crm-atomic-20261002`. Final source candidate tree: `a352da2693ccdbce16e649872997da6307e2cf4b`. The later commit containing `task-6-source-binding.json` is the packaging HEAD, distinct from the execution parent and source candidate tree. No push, PR, merge, production apply, deployment or activation was performed.

Final CLI-created forward migration: `supabase/migrations/20261001213914_r01_crm_atomic_forward.sql`, 43,409 bytes, raw/canonical LF SHA256 `b3ef1a69e4d92362611ede79ba775b5b28904e4acaff166550859e9b57844bc2`. Actual pinned `bun x supabase@2.118.0 migration new r01_crm_atomic_forward` created this filename after actual RED; its initial tool output remains in the session transcript rather than a separately saved raw CLI file. Final CLI/runtime outputs confirm2.118.0/Bun1.3.14; CLI notes2.119.0 available, no update made. Applicable AGENTS/CLAUDE, Supabase/TDD/debugging/worktree/verification skills and implementer template were read. Graph-first discovery used `hkscda-r01-crm-atomic-20261002` at BASE; excluded SQL/docs/scripts used targeted known-file fallback.

`docs/evidence/audit-remediation-20260927/r01-forward/task-6-source-binding.json` binds raw SHA256, canonical LF SHA256 and Git blobs. It separately records **22 actual DB-observed inputs** and **29 final HTTP/gate inputs**. Both DB receipts retain the old observed `src/lib/crm/http.server.ts` hash; this one observed file differs from the final HTTP candidate. Do not claim all22 final inputs are equal. `task-6-db-runtime-proof.json` proves the DB runtime import closure consists only of runner, unchanged clone helper, releaseSchema, releaseManifest and DB test. None imports or executes the HTTP mapping. SQL/DB tests/runner/helper/runtime closure bytes remain exactly those exercised by both final DB runs. Controller explicitly authorized mapping-only HTTP RED/GREEN plus final four gates without duplicate unrelated DB replay.

Shared helper remains SHA256 `5352ca4c2660e341b88bb34519e369aa7420711bb9df7c80daff5dadd9387519`. Accepted Tasks2-5 migration bytes are individually checked before each owned-clone apply. Task5 draftPR189/head592, CI36928397189 attempt1: verify, a11y-verify, brand-verify, rls-matrix and performance-verify all completedSUCCESS; explicit controller release arrived before first dependent apply. No Task1 SQL was applied.

## Scope, actual call contracts and minimum ruled changes

Three public missing targets are restored with exact argument names/types/returns: `mutate_crm_supporter_with_audit(text,uuid,jsonb,jsonb,uuid,timestamptz,jsonb) -> jsonb`, `replace_supporter_roles_atomic(uuid,jsonb) -> void`, and `append_crm_consents_with_audit(jsonb,uuid,uuid,timestamptz,jsonb) -> void`. Public functions remain postgres-owned INVOKER, empty search_path, service-only EXECUTE. Existing modern version bump helpers/triggers, #182 read-only evidence ACLs, unrelated functions/catalog and all preexisting synthetic rows remain unchanged. No table, Auth, cluster-role, membership or default-ACL grants are added or normalized.

Current production adapter chooses audited atomic creation/consent; versioned updates still call `mutate_crm_supporter_if_version_with_audit` with mandatory expectedVersion. No non-atomic fallback/rerouting was added. Actorless role utility remains its exact historical body/signature and service-only contract. HTTP mutation handlers requireTreasurer and supply current authUserId; consent service builds nonempty supporter-bound rows. Historical migrations remain unchanged.

Actual banned-actor RED required controller-ruled `private.require_crm_supporter_actor(uuid) -> void`: SECDEF/postgres/empty path/service-only. It locks confirmed, currently unbanned Auth FOR SHARE, then active admin/treasurer admin_user FOR SHARE, before supporter mutation/audit. It returns no PII and adds no direct Auth rights. Missing create/consent commands invoke this bridge; the known old version wrapper changes only its unsafe actor predicate. Expected version, supporter FOR UPDATE, role/version behavior, audits and return shape remain exact. The old wrapper's exact42501/supporter_edit_forbidden message is preserved.

Consent minimum guard rejects NULL/nonarray/emptyarray/nonobject rows and missing/mismatched row supporter_id with22023 before writes. Valid current payload, dedup key, immutable consent facts and per-call audit shape remain unchanged. A retry deduplicates consent facts but retains an audit for each accepted call; no request-ID contract was invented.

Known old/new body MD5: create `a239e42582809956b821b1bfe1fb2962` -> `b855a871526b63f13a1d653757a2f4c1`; roles unchanged `f2c7e2d7478e45b8320a59b43b56f818`; consent `65f1847569ad471a239e0c1a1dd60324` -> `fad2e7acedab10443930040b3e667939`; wrapper `c39e9474fb941717626a0e9e3afd1477` -> `f6963da392c67e51fea8e5b451698238`; own private bridge `60f3f9ec8d075cfd67c0e992d2667030`. No cross-domain helper reuse.

Preflight completes before mutation: five exact hosted/modern CRM table profiles, persistence/rules/rewrites, full columns/defaults/collations/table+column ACLs/RLS/policies/constraints/indexes/triggers; exact version helper definitions; target overload/body/owner/signature/argument/result/config/definer/cost/strictness/parallel/EXECUTE recipients+grant options; applicable postgres global/public/private function defaults; effective service Auth SELECT/UPDATE denial and postgres managed-column prerequisites. Every unknown profile fails55000, no silent repair. Native16 RI triggers for four FKs bind own/referenced relation, function/event/enablement/internal flags/index and exact internal pg_depend. Existing good definitions preserve OIDs/ACLs on replay.

Actual admin mutation SQL uses its advisory lock and admin row UPDATE without a later Auth/supporter lock; the CRM bridge takes no admin mutation advisory lock. Two-sided real concurrent ban, disable and role changes prove SHARE fencing before audited commit and denial after revocation commit. Concurrent same-version edits yield one success, oneP4090, one audit and monotonic editVersion. These are direct-SQL clone proofs; provider Auth internals/HTTP-JWT concurrency remain outside this evidence.

## Real RED, failed setup and final GREEN

All raw receipts/source copies retain original bytes under Task6 receipt folders with `* -text`; no failed receipt was rewritten as GREEN.

| Run | Actual result / qualification |
| --- | --- |
| hosted missing-target RED21:31:12-15Z |0pass3fail, all three42883; no dependencies; catalog/template/modern/frozen inputs preserved; normal owned drop |
| modern actor RED21:31:43-46Z |0pass1fail, banned active treasurer versioned update wrongly succeeded instead of42501; preserved/normal drop |
| modern legacy defects RED21:35:23-27Z |0pass4fail: staff create/banned consent accepted, row identity mismatch accepted, [] created audit-only fact; raw JSON generic result mislabeled wrapper text, actual mode/log/test summary qualify verdict |
| metadata first-array setup |22P02 malformed array transport, before migration/behavior; retained failed runner/receipt, normal cleanup/preservation; not domain RED |
| first full composition |fixture used nonexistent consent_unique_event,42704 after18 preliminary55000; corrected only fixture to actual consent_dedup_unique after cleanup; exact old SQL/test/runner retained |
| second full composition |normal baseline55000 supporter metadata mismatch;49 returned55000 **do not prove their intended drift predicates**, because baseline itself failed; raw/source retained |
| profile diagnosis |no actual table/dependency drift; Bun encoded JSON.stringify(profile) JSONB parameter as JSON string; captured digest was string JSON, SQL compares object JSON; diagnostic jsonb_typeof='string'/no relation matches proves cause |
| minimum profile correction |pass actual object parameters, assert PostgreSQL jsonb_typeof='object' before claiming digest, regenerate exact object hashes; no schema/body/ACL/native-guard relaxation; original SQL7b8f930... remains archived |
| diagnostic/setup reads |one diagnostic parser excess-parenthesis error before connection and Python cp950 decoding error before edit retained; missing known-file/Windows wildcard lookups and final nonexistent optional receipt read failed without mutation; CLI/runtime outputs succeeded despite combined final lookup exit1 |
| hosted smoke22:06:31-37Z |normal accepted baseline+forced rollback preserved, SQL2applies,23pass0fail199assert, no49-case claim; exact smoke source archived |
| final hosted22:08:10-39Z |normal accepted baseline before negatives;49x55000/full rollback;25pass0fail205assert; SQL2applies;25->22 gaps; all preservation true; wrapper0 |
| final modern22:10:08-47Z |same frozen SQL/DB bytes;49x55000/full rollback;25pass0fail205assert; SQL2applies; existing issue1 stays1; all preservation true; wrapper0 |
| inert existing HTTP probe |code42501/supporter_edit_forbidden yields500 on all three handlers, exit1; no live request/JWT/provider/DB |
| adjacent actual handler RED |4pass3fail11assert, all create/update/consent expected403 received500; old HTTP/test sources retained |
| minimum HTTP mapping/GREEN |exact42501 -> safe genericForbidden403/no-store;7pass0fail20assert; Response/Zod400/P4090409/unknown500 preserved; console spy cleanup added and final test bytes bound |

Default exec/node process startup deny-read ACL errors occurred before code ran; tool failure has no process exit/domainRED. Narrow per-command require_escalated reads/source/tests were used per controller; no ACL/helper/engine workaround. Transcript retains these environment failures. Receipt folder logs preserve actual test/compiler output; prose-only setup qualifications do not masquerade as raw process logs.

Final DB commands: `R01_CRM_ALLOW_LOCAL_FIXTURES=1 bun run supabase/rls-tests/helpers/runR01CrmForward.ts green` and `green-modern`, exits0; child `bun test src/lib/crm/atomicForward.database.test.ts --timeout 30000`, exits0. Fresh schema-only hosted/modern captures and zero-data owned clones158/162 application tables; synthetic confirmed actors/supporter-role/immutable consent/audit fixtures only. Hosted deps44->41->41->33->30->25, Task6->22; modern1 stays1. Both apply twice and test active actor success, stale/missing/unconfirmed/ban/status/role denial, direct anon/auth EXECUTE rejection, effective Auth column and direct SQL SELECT/UPDATE denial, retry/dedup, audit-failure rollback of profile/roles/version/consents, invalid role rollback, stale version, malformed/identity consent, temp shadows and real competing transaction fences. All preexisting public/private/Auth rows, full related/unrelated catalog, complete Auth table/column ACLs, all defaults, nativeFK/dependencies and migration ledger remain equal. Normal close/drop only for each owned r01_clone_<32hex>; no FORCE/backend termination/reset/restore.

49 refusal fixtures cover direct service/PUBLIC Auth column drift, global/public/private creator default drift/unknown dashboard_user/grant options, table rule/unlogged/type/owner/RLS/index/version-trigger changes, exact wrapper/helper body/argnames/ACL/owner/path/definer/cost/overload differences, all16 native trigger disables and three old legacy function metadata differences. Transaction-local Auth/default fixtures used existing grant options only, always forced rollback. No new roles/memberships and no custom inherited-role execution claimed; effective privilege APIs include the actual role inheritance state.

## Final four local gates and environment preservation

Actual wrapper: `C:/Python314/python.exe docs/evidence/audit-remediation-20260927/r01-forward/task-6-gates.py final`, exit0. Raw receipt: `task-6-gate-receipts/task-6-final-gates.json`; all29 final source hashes unchanged through gates. It clears inherited *TEST_DATABASE_URL/*ALLOW_LOCAL_FIXTURES, sets CHECKOUT_POLICY_TEST_DATABASE_URL=loopback57322 and SUPABASE_LOCAL_URL=52321, builds only with loopback54329/ci-placeholder keys. No key values or real data were printed.

- `bun run typecheck`: exit0,32.66s.
- `bun test --isolate --timeout 30000`: exit0,78.03s;3235pass292skip0fail10499assertions.
- `bun run lint`: exit0,50.6s;52 existing warnings/M1 deferred.
- `bun run build`: exit0,90.36s.

Per-clone preservation is distinct from authorized full-suite fixture transitions: dedicated57322 aggregate `2a008c317589a983c000926b42f1938ed19d34e7737bb3ba358d251e2f877631` -> `04dda7a25418a6f62d3caa5e6386ae5da62d65ed45dd5861ad26c1df97be1466`. Template `c653c8e55cd609b04ca58f3c288549e57da84afe92fe559882c423139a46edb6` stayed equal. Before/after source receipts are explicit, no sequence/catalog/row normalization.

Final production read-only metadata22:21:39.586842Z: ledger112; all three missing commands/private bridge remain absent; wrapper retains old c39e... body/postgres/INVOKER/empty path/service ACL; service Auth effectiveSELECT/UPDATEfalse/privateUSAGEtrue. Source-only isolated gap22 is distinct from production44; no deployed/operationally-enabled claim. Raw MCP wrapper is `task-6-green-receipts/production-final-readonly.json`.

## Self-review, handoff and remaining boundaries

Self-review verifies only own source/manifest/tracker/evidence paths, exact allowed body deltas, no unrelated callers/helper/legacy SQL/cluster/Auth/default edits. Runtime import proof plus raw/canonical/Git hashes enforce the conditional HTTP-only replay exemption; source candidate and later evidence packaging are explicitly separated. Raw immutable artifact whitespace is qualified separately from source/metadata diff checks. Controller owns fresh independent spec/security/quality review, draftPR and exact-head five-job CI.

Not run: live authenticated PostgREST/JWT/browser/provider UAT, hosted Auth internal mutation concurrency, production actor commands/data/migrations, Storage/provider/payment/email/refund/publication, full checkout/recovery UAT, external CI for this packaging HEAD. Task1 finance ACL/actor decision remains blocked; Task2/3 analog internal-FK whole-branch review remains outside Task6; baseline52 lint warnings remain deferred. New checkout/delivery/media schedules stay off. Task5 accepted PR189/head592/CI allfiveSUCCESS supersedes historical pending tracker text; Task6 source complete/schema-ready only in isolation, not deployed/enabled.

Self-review execution receipt: staged explicit Task6 source/metadata diff --check exit0; full staged immutable evidence diff --check exit2 (initial473 diagnostic output lines). See task-6-artifact-whitespace.json and retained raw artifact-whitespace.log; CRLF/trailing payload bytes were preserved rather than rewritten. Only current R01 tracker row changed; all tested final executable hashes remain equal.
