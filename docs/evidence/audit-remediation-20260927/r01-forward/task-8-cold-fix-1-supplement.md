# Task8 cold profile fix1 — source qualification

**All15 formal production SQL: DO_NOT_APPLY. Native19 required CI: NOT_RUN locally.**

## Cause and scope

The observed owned PG17.11.0.004 profile has authenticated supporter table privileges DELETE/MAINTAIN/SELECT, explicit INSERT/UPDATE on its first11 columns, and no assignment-column writes. Both prior archived Task8 vectors excluded this complete composition. The cold vector also pins the exact observed `auth.uid` and `private.bump_supporter_edit_version` bodies. None was inferred from Task11 or an engine number.

The generator now loads the bound observed cold vector alongside unchanged archived hosted and modern vectors. Detailed catalog checks still precede mutation; a complete-vector equality check correlates all6 public-table relation/column/constraint/index/trigger/policy facets, full75 helper tuples, managed Auth tuple, native232 FK tuples, index flags,7 relation shapes, schema/default/role/member facets. Crossed accepted facets refuse55000. Target cardinality, OLD/NEXT tuples, unknown refusal, scanner, native endpoint guard, business SQL and ACL operations retain their contracts.

The target-preflight/business suffix is exactly equal after LF transport normalization:15,851bytes, SHA256 `942e8a499eeb65fefb87264b057ccdfaa9af6f57f0ee6e5ba7bddb25b88dc0bd`. Compiled SQL reruns identically:1,360,292bytes, SHA256 `cf6ee8a04d88469ada06b45dbd12b14a8293a29a6208d9ba05fa22dfe5f6ad8f`.

## Verification

- Before repair, the admission regression native1 observed originalSQL55000 supporter, with complete rollback preservation.
- Final focused portable tests205pass/0fail,206expect() calls; existing ESLint on only the3 TS source/test files native0 (empty stdout/stderr, no ignored-file warnings); deterministic generator native0 and raw-byte equality; git diff check native0.
- Final owned rollback harness native0, all8 final flags true. It applies twice, preserves registration’s whole tuple, checks21 actualSQL refusals including both partial overload directions and a crossed modern-supporter/cold-helper profile, and proves no target mutation on refusal.
- Synthetic rollback checks preserve registration retries and2 consent facts, create exactly1 audited clone, refuse browser/missing/banned/unconfirmed/non-staff actors, and roll back activity/audit changes after injected audit P0001. Full catalog/helper/target/Auth/native/index/shape/ledger/sequence/source/config/container metadata is equal before/after; all7 scope tables remain empty.
- Reserved-role setup42501 and a psql exit-code assertion failure remain separate failed harness attempts. Reserved-role source refusal is subsequently observed as55000 under postgres after local isolated supabase_admin setup; psql expected exit3 closes the uncommitted transaction.

Full paths, argv, native exits, stream byte hashes, source hashes, receipts and refusal cases are in `task-8-cold-fix-1-qualification.json`. Exact-context original capture is bound by `task-8-cold-fix-1-binding.json` and `task-8-cold-fix-1-raw-receipts.zip`; final GREEN and failed harness attempts are in `task-8-cold-fix-1-green-receipts.zip` with its member manifest. Raw metadata/query/SQL bytes are retained unchanged. Generated local API-key startup stdout remains only under the ignored controller; tracked archives retain exclusion byte/hash manifests.

## Startup-phase limitation and remaining gate

This capture is from the new owned project after PG17.11.0.004 and GoTruev2.197.0 were healthy. InitialCI logs show database start919, schema initialization920, Task8 migration1108 and supporter55000 at1110; no service-container-start/health messages are observed before failure. Owned startup logs show database start298, schema initialization299, containers start487 and health checks490. Available messages do not separately prove GoTrue internal migration timing. Fresh required CI must establish Task8 admission during startup and native19 success. Healthy local capture is not that proof.

No553/523/573 endpoint was queried, reset, repaired, reseeded or rebaselined. Original incidents remain UNKNOWN. No production/provider/deploy/activation operation or lifecycle cleanup ran. The historical creation packet, trackers, other14SQL, shared productionSchemaClone and native guard were not edited by this agent. Root owns workflow/version pin, supplement/tracker integration, review, commit/push and required freshCI.

Binary archive verification uses raw SHA256 and exact member bytes exclusively. The GREEN manifest inventories all528 members and verifies every member’s byte/hash equality.
