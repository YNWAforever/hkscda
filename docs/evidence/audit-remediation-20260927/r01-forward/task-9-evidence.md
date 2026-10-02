# Task 9 — exact audited adoption RPC forward repair

Source `217fc22b0bf8834f878751e3f02c991fa5ff7378`, recorded clean BASE `d0403a1869ea6dead498e62aebe9723e95c3ec19`, branch `codex/audit-r01-adoption-atomic-20261002`. Source/owned isolated validation complete; independent whole-task review and exact-head five individual CI pending controller. Overall R01 remains NO-GO. Production44 unchanged; no production application, deployment or enabling.

Focused pinned-CLI2.118.0 generated SQL `20261002045253_r01_adoption_atomic_forward.sql`, raw/canonical SHA256 `e6a4b06d802d7c82e4638ce8dfd8ad5e3a21ca87583be8471e0a0559a6656cb8`. Source commits: `6f7a30eb40cd3012e87d2aaa07367eca26ef4159`, `94ae17118e379dac44308a3e6f6ce8e17e9782f7`, `217fc22b0bf8834f878751e3f02c991fa5ff7378`.

## Scope and contracts

Ruling28 excludes pending Task8 two targets and Task1 partial SQL: own acceptedTasks2–7 composition20→17, modern1→1. Task7 inherited pending review wording is superseded by accepted d040/PR191/CI36960650129 attempt1 five individualSUCCESS.

The three public jsonb targets retain exact argument names/types/defaults, postgres owner and full service-only EXECUTE. Coordinator remains SECURITY DEFINER/plpgsql/default0, admin-only status entity semantics/business/audit tail preserved. Search remains actorless service-trusted INVOKER/stable/sql/default2 (1,10), same body. Manual wrapper remains SECURITY DEFINER/default1 (NULL::jsonb); SQL→plpgsql only takes inline Auth confirmed/unbanned FOR SHARE then active staff/admin FOR SHARE and calls the same existing private helper. Newly generated public definitions pin empty search_path.

Existing private.create_manual_adoption_case(uuid,jsonb,jsonb,jsonb) is exact: rawprosrcMD5 `18def457bdf482aea149d9ff56dff3c6`, pg_get_functiondefMD5 `495416f481fbad0367dc078c5c53783f`, default1/NULL::jsonb, ownerpostgres, SECURITY DEFINER, config public,pg_temp, fullACL {postgres=X/postgres,service_role=X/postgres}. No helper/grant/body/default change.

Ruling29 changes only real private withErrors: non-null object exact string code42501→safe Forbidden403 using existing jsonResponse/no-store, after Response/Zod beforeP0002. Eight real inert handler tests preserve401/400/404/409/500/201 neighbors.

Ruling31 binds the existing complete native FK projection for origin OR referenced relation in the same ten-table list. Fresh own profiles bind328 native enforcement records each, from former76; fields/dependencies unchanged. No FK/trigger repair or new role/actor/business policy. Original unordered fixture retained; named outgoing adoption_case_supporter_id_fkey and incoming successful_adoption_adoption_case_id_fkey O→D fixtures both genuinely refuse55000. Exact per-clone OIDs/names/flags/functions are recorded; they are not portable allowlist IDs.

Complete known preflight covers all ten tables (owner/columns/defaults/ACL/RLS/constraints/index flags/policies/trigger metadata), helper defaults/owner/fullACL/options/body/config, schema/global creator defaults and effective managed Auth column privileges. All guards finish before any target creation/replacement. No backfill or data effect.

## Actual final verification

| Command / profile | Actual result |
|---|---|
| `R01_ADOPTION_ATOMIC_ALLOW_LOCAL_FIXTURES=1 bun supabase/rls-tests/helpers/runR01AdoptionAtomic.ts hosted` | exit0;47pass0fail166assert;70 actual55000/fullrollback;twoapplies20→17; `task-9-hosted-1790919498462` |
| same command with `modern` | exit0;47pass0fail166assert;78 actual55000/fullrollback;twoapplies1→1; `task-9-modern-1790919651001` |
| `bun run typecheck` | exit0; 30.13s |
| `bun test --isolate --timeout 30000` | exit0; 74.92s; 3266 pass, 391 skip, 0 fail, 10580 expect() calls |
| `bun run lint` | exit0; 28.08s |
| `bun run build` | exit0; 40.21s |

The final pair binds identical60 raw executable/import/runtime inputs; four gates bind68 raw inputs including wrapper/config/manifest. Both start schema-only/zero application data158/162 tables, preserve original5352 scanner/full12-entry fixture scope, accept unchanged baseline before negatives, rollback all drift transactions, apply twice idempotently, preserve all unaffected catalog/helpers/defaults/Auth/native+dependencies/ledger/sequences/rows and post-test full metadata, and normalDROP the owned clone. Template and dedicated modern source preserve before/after state for each clone.

39 actual DB tests cover valid status/manual/search, missing/disabled/wrong-role/banned/unconfirmed/direct-role refusals, admin-only statuses/staff linked task update, protected system rows, missing/unsupported/malformed/duplicate identities, audit-failure full rollback, intentional default/initial tasks, unchanged case/supporter versions, temp shadows, existing-supporter retries, actual two-transaction concurrent unique identity (one profile/role,two cases/audits), four command-first Auth/admin fences and eight updater-first disable/role/ban/unconfirmation waits with current-predicate recheck/no writes. No invented request idempotency/version/identity-merge behavior.

Runtime Windows PowerShell/Bun1.3.14/Git2.55.0.windows.2/Python3.14.6/PostgreSQL17.6 x86_64. Clone owner52322/templateaudit_pr135_20260929 readonly; dedicated modern57322 readonly during own clone tests. Gates clear inherited *TEST_DATABASE_URL/*ALLOW_LOCAL_FIXTURES; checkout-policy57322/Auth52321 only, build54329 ci-placeholder anon/service keys. Fullsuite391skips includes39 owned DB cases separately executed twice. No hosted/JWT/PostgREST/Auth-internal/provider/UAT/browser journey executed. PostgreSQL17.11 exact CI remains external.

## Immutable RED and failed preparation history

- Missing target genuine RED `task-9-red-missing-1790916365229`: parent0/expectedchild1,0pass7fail4assert, actualthree RPC calls42883; full preservation/normalDROP.
- Exactlegacy actor RED `task-9-red-legacy-1790916502861`: parent0/child1,3pass4fail22assert; both commands accepted banned/unconfirmed actors. Exactlegacy held-lock RED `task-9-red-legacy-1790916728084`:3pass8fail26assert; four actual actor locks absent; full preservation/normalDROP.
- Actual handler `bun test src/lib/adoptions/atomicForward.http.test.ts` originalexit1,7pass1fail15assert, real42501→500; original test/mapper rawsources retained. Ruled mapperGREEN8pass0fail17assert.
- Initial DB connectionclosed attempts were setup failures (assertCloneUrl returns database name; validated originalURL must be used by newSQL), followed by invalid synthetic hyphenated status key23514. They are not missing-target RED. Initial preflight used an extra nonexistent animal spelling; actualanimals was added before any fixtures. Full12-entry scope retained thereafter; no refusal/narrowing.
- First actor lock setup used invalid status suspended and cleanup failed, leaving owned rows until normal cloneDROP: `task-9-red-legacy-1790916670376`,3pass8fail2errors26assert, rowsPreservedfalse. Preserve this failed evidence; valid disabled rerun above is separate.
- First hosted current run `task-9-hosted-1790917365806` failed an auth.uid grant-option fixture that had not actually changed permissions underpostgres; own transaction uses existing synthetic supabase_admin authority for actual drift. No helper/Auth grants repaired. Auth.uid owner/ordinary-ACL negative fixtures are intentionally skipped; exact owner/completeACL still guarded and preserved.
- Hosted `task-9-hosted-1790917532254`:37pass1fail125assert,62refusals/twoapplies/preservation passed; synthetic followup lacked required link23514, fixed by creating its actual required case. Hosted1790917872162 then46/0/162/68.
- Modern `task-9-modern-1790918026386`:46pass1fail166assert,76refusals/twoapplies/preservation passed; concurrency expectation used wrong action name, corrected only to existing coordinator_manual_intake.create. Subsequent6cf hosted1790918137472 and modern1790918259563 both47/0/166.
- Frozen gate attempt `task-9-gates-1790918404016880100` at6f7: typecheck2 TS7034/7005 receipt-array implicitany; tests0 3266/391/0/10580,lint0 52warnings,build0. Source/frozen/template preserved; corrected explicit type94ae and cosmetic generatedJSON formatting; retained every old receipt.
- Typed6cf hosted1790918677487 passed47/0/166/68. Typed modern1790918802739 failed native-refusal after75 successful55000 before apply/tests; original unordered selected trigger not recorded and its dropped-clone OID remains unknown.
- Deterministic `task-9-native-red-1790919057488` expected-defect diagnosticexit0 showed actual RI_ConstraintTrigger_a_880436/constraint880435 successful_adoption→adoption_case/restrict_del/tgtype9/internaltrue/parent0/notdeferrable enabledO→D. Guard projection unchanged while complete native changed; exact6cfSQL accepted drift. Full catalog/native rollback, template/modern preservation and normalDROP. This is genuine guard RED; rootRuling31 authorized only origin-or-reference expansion. New final e6a inputs/proofs above supersede acceptance of older6cf compositions.

Read-only bounded lookup and gate-wrapper preparation mistakes (missing paths/Windows literal glob/substr error), and one same-file PowerShell pipeline refusal, are setup/read failures, not behavioral tests or approval denials. Initial sandbox process bootstrap failed before execution with helper_unknown_error/apply deny-read ACLs. Parent authorized narrow require_escalated read/test/source commands only within assigned worktree; no actual automatic action rejection occurred or was bypassed.

## Binding, self-review and boundaries

[Current raw binding](task-9-source-binding.json), [native RED binding](task-9-native-red-binding.json), and [all original path/hash/archive translations](task-9-receipts/translation.json) bind actual prior/current raw sources, catalogs/runtime inputs, logs, full receipts and wrapper bytes. Content-addressed *.source archives preserve raw bytes under -text and are not Bun-discovered copied tests. Historical raw receipts retain their original paths/fields; translations are separate. Generator reads own fresh hosted1790919336913/modern1790919424679 receipts. To reproduce from published evidence, restore those receipt originals and other frozen runtime inputs using the translation map into ignored scratch, then run current generator and focused JSON formatter; SQL is explicitLF and pinnedCLI filename is unchanged.

Self-review found and resolved own receipt typing and native incoming guard omission before acceptance. Static raw comparison confirms Ruling31 function-definition/grant tail exactly equals previous6cf tail; private/helper metadata equality confirmed across fresh old/new captures. New source modifies no legacy migration, private helper, scanner, public flow, source ACL or grant/role policy. Existing warnings/output noise remain: lint52baselinewarnings, build ignored module directives/large bundle notices, intentional unknown/nonobject error logs from HTTP contracts. No open actionable self-review finding identified.

Native preflight is intentionally strict and now covers incoming dependencies: apply Task9 only after named accepted2–7 composition while Task1/8 excluded. Any future FK/trigger/default/helper/index change requires fresh named composition/review/reapply boundary; do not blind apply-all or add broad profiles.

Own clone proofs preserve dedicated modern state. Mandatory fullsuite intentionally changes only its existing dedicated fixture: attempt1 162b4445fbd7f021b9e5796602db6160c323983d83ab921b651be27e69c6f261→8056a28ca41b17f38e7b10865c7b30fdb9be3451cbbeba9edc4b30bb75bc54db; final 8056a28ca41b17f38e7b10865c7b30fdb9be3451cbbeba9edc4b30bb75bc54db→9d032584ce197236ebecc8095e010e766a79b3f0c9c91000f5d94c7fb12654b4. Template c653c8e55cd609b04ca58f3c288549e57da84afe92fe559882c423139a46edb6→c653c8e55cd609b04ca58f3c288549e57da84afe92fe559882c423139a46edb6 unchanged. Do not claim dedicated modern unchanged across full-suite gates.

Independent whole-task review, exact-final-head five individual CI (including actual17.11 behavior), PR publication and source acceptance are controller tasks and not-run here. Production44/ledger112 observed metadata is not changed. Production migration/main/push/public-preview/provider/Task1/source-ACL operations were not performed. Overall R01/private-native/source prerequisites and broader UAT remain pending; source/schema/deployed/enabled statuses stay separate.

Source marker217fc22b is the product/DB commit before evidence packaging; exact frozen raw input maps are authoritative. Its migration-manifest.csv HEAD object was older than the exact frozen working content; packaging commits that unchanged tested manifest. Two ignored capture receipt Git hashes are derived content addresses, not original-path HEAD objects. All staged diffcheck returns2 for intentionally immutable raw .source archives (CRLF logs/trailing whitespace); product/source-only diffcheck returns0. These are separate actual results; no raw bytes were normalized and no all-diffcheck-zero claim is made.
