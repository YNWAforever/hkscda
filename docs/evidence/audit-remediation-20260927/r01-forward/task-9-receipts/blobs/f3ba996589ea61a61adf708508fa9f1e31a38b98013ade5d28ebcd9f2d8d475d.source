# Task9 Fix4 — exact LF Auth helper compatibility

Status: DONE_WITH_CONCERNS. Fix base `9df26366cc719d0f92530a784da6871d0db81398`; final tested source commit `9258f52e6f72432cd798f46deba14e2909429586`. Controller SAME scoped review and fresh five individual exact-final-head CI results remain required. No push or release performed.

## Diagnosis and scope

Original PR192 CI36985370386 attempt1 at exact9df: aggregate SUCCESS concealed RLS job110769871554 FAILURE during startup with SQLSTATE55000 `R01 adoption helper contract differs: auth.uid`; four other jobs SUCCESS. Behavioral DB steps were skipped. Original five raw logs, final metadata and controller receipt are preserved with exact SHA/byte copy checks in task-9-fix-4-ci-copy-binding.json. They are failed original evidence, never relabeled current.

The accepted auth.uid profile had CRLF source body MD5 772430c79a4272a214d3e200a170c0c3 and rendered-definition MD5 5dd851706ecb5893606782fd9e2cbf83. Actual managed LF body is cdef18c69c4f4cbbced2eaf81e628b49 and rendered definition ea3b41bf29e2ad573067939329aa088e. Full local catalog comparisons show only native OIDs/namespace IDs and prosrc differ; remaining differences are derived body/definition hashes/rendering. CRLF-to-LF byte comparison explains the body difference; no runtime normalization is introduced. Owner, full ACL including grant options, language, defaults, security/configuration and all remaining complete pg_proc metadata were captured and compared.

The previous application clones copied public/private schema while preserving template managed Auth. Therefore both modern and hosted clones inherited the accepted CRLF helper and missed the actual modern LF helper. The shared scanner is unchanged at SHA5352ca4c2660e341b88bb34519e369aa7420711bb9df7c80daff5dadd9387519; its full fixture scope remains enforced.

## Exact image/source capture before admission

Ruling33 permitted the pinned PG image pull and one never-started network-none stopped inspection container. Fifty copied bootstrap/config/entrypoint files, image inspection, digest, restrictions, commands and exact normal cleanup are retained in task-9-fix-4-image-source-20261002T090754Z/receipt.json. No ports, binds, volumes or secrets; read-only filesystem, one CPU and 512 MiB. Existing engines/stacks were unchanged.

Postgres image: public.ecr.aws/supabase/postgres@sha256:0450166354dc9c1d25f0322ac8b580774d4fb0184d2b087f6e4fe9499c66cf53 (17.11.0.002). Auth image: public.ecr.aws/supabase/gotrue@sha256:1736a63078f5922b198c4cbe50f80ab9a2d3b54fe8b7b6cfb2e9dc5dbbc12c6b (v2.197.0). Official CLI2.118.0 start.go/schema.sql and Auth migration sources are raw/Git-blob bound. The final LF helper comes from Auth 20220224000811_update_auth_functions.up.sql, blob4be423739aa3bf07bc3769aea5cc7751959ad53e/rawSHA5b72022d73e64a8e474d2122ac42f299bb7ce4d59755cdcc78e72abfe5d47dc0.

Ruling34 permitted isolated zero-data Auth-component reconstruction only. task-9-fix-4-stageb-20261002T091944Z completed with exact two image digests, unmodified vendor init/CLI schema and gotrue migrate; before/after catalog-only READ ONLY SQL, zero Auth users, cron.job/net.http_request_queue/net._http_response absent, and normal removal of both owned containers. Network-none PG namespace shared only by the Auth migration container; no ports/binds/persistent volumes, synthetic credentials, one CPU each, PG1GiB/Auth512MiB, graceful bounded stop initiation using SIGINT without force kill/prune. No application migrations, Storage/Realtime/webhook/_supabase/full CLI stack, providers, Auth API or helper/actor evaluation. Exact component metadata is distinct from full CI startup.

The first StageB attempt (20261002T091819Z) stopped on setup assertion because Docker canonicalized the namespace owner name to its exact container ID. Its original script/failure/metadata/normal cleanup remain immutable; no Auth migration ran there. The corrected assertion stayed within the recorded scope.

## Genuine unchanged-source RED

Ruling35 phase1 ran task-9-fix-4-diagnose.ts diagnose against unchanged9df/e690 SQL in a new owned52322 zero-data clone. Accepted baseline first passed then rolled back. Only the captured LF auth.uid definition was installed under the existing owner; complete ACL/default/config/other metadata stayed unchanged. Actual SQL rejected with 55000/auth.uid, and full rollback plus normalDrop/templatePreserved/modernPreserved/frozenInputsPreserved all passed in task-9-fix-4-red-1790933603845. Parent exit0 means the expected rejection was observed, not that old SQL accepted LF. Root independently bound 69 unique inputs/71 runtime copies and complete catalog preservation before releasing phase2.

Earlier RED attempt1790933409424 was a setup-only failure: nested begin in an existing transaction. Its failure and cleanup remain recorded. The own diagnostic adapter maps only the scanner begin callback to a rollback savepoint, executes the unchanged scanner real catalog queries/checks, and catches only its own sentinel. The shared callback is catalog-only but does not SET TRANSACTION READ ONLY. A legacy assignment-fragment receipt label contains the captured Auth definition and explicitly says it was not executed as an assignment fragment; original receipt remains immutable, and the exact-fixture-difference metadata supplies the correct label.

## Minimum source repair

Ruling35 phase2 adds exactly one paired complete 17-key LF tuple, 440 inserted bytes and zero removed bytes. SQL raw SHA2fc84329a9e708694c03ffdc362e5c325c2c5d28d802d0170a6eb51667c1e9e3, 353352 bytes. The old CRLF profile and all other guard/body/grant/default/owner/native/private-helper/actor/error/signature SQL bytes remain exact. Earlier wording of 19 facets was inaccurate: the literal has 17 keys; raw complete pg_proc, language and expanded ACL were additionally captured. Body and definition hashes are paired, not independent cross-product choices.

The generator binds the immutable capture and checks that only paired body/definition hashes differ. The own component runner constructs LF from that exact capture, verifies complete pg_proc and all other helper/catalog/Auth/default/native/role/index/ledger/sequence metadata, then executes the unchanged full scanner. Application migration SQL never changes Auth. Four valid-DDL refusal fixtures add unknown exact owner, ordinary full ACL, body and defaulted overload; prior grant-option/config, private-helper intentional-default, all native and existing refusals remain. Every refusal actually returned55000 and rolled back.

## Final verification

| Command | Actual result | Receipt |
|---|---|---|
| `R01_ADOPTION_ATOMIC_ALLOW_LOCAL_FIXTURES=1 bun supabase/rls-tests/helpers/runR01AdoptionAtomic.ts hosted` | exit0; 61pass, 0fail, 195assertions; 74 actual55000 refusals; gaps20→17 | task-9-hosted-1790935448904 |
| `R01_ADOPTION_ATOMIC_ALLOW_LOCAL_FIXTURES=1 bun supabase/rls-tests/helpers/runR01AdoptionAtomic.ts modern` | exit0; 61pass, 0fail, 195assertions; 82 actual55000 refusals; gaps1→1 | task-9-modern-1790935582481 |
| `R01_ADOPTION_ATOMIC_ALLOW_LOCAL_FIXTURES=1 bun supabase/rls-tests/helpers/runR01AdoptionAtomic.ts component` | exit0; 61pass, 0fail, 195assertions; 84 actual55000 refusals; gaps1→1 | task-9-component-1790935250738 |
| `bun run typecheck` | exit0; 55.38s;  | task-9-gates-1790935663057902800/typecheck.log |
| `bun test --isolate --timeout 30000` | exit0; 106.95s; 3280 pass, 391 skip, 0 fail, 10609 expect() calls | task-9-gates-1790935663057902800/tests.log |
| `bun run lint` | exit0; 45.79s;  | task-9-gates-1790935663057902800/lint.log |
| `bun run build` | exit0; 60.69s;  | task-9-gates-1790935663057902800/build.log |

The three final compositions bind 70 identical raw inputs; gate map binds 77 unique inputs. Two actual applies each, idempotence, accepted baseline/rollback, full unaffected metadata/rows and post-test preservation, normal DROP and all four final flags are true. Gates frozen/template preservation true. Full suite clears inherited feature database/fixture flags, uses checkout57322/Auth52321, and build54329 placeholders. Dedicated modern before/after full-suite hashes are recorded as the authorized suite fixture transition; no equality was asserted across that suite. Each owned rehearsal separately proved modernPreserved true.

The first three green rehearsals were followed by failed gate receipt task-9-gates-1790934875982673800: typecheck exit2/TS7006 on three new comparison callbacks, while full tests (3280pass/391skip/0fail/10609assertions), lint and build passed. That receipt and all archived inputs are immutable. The correction adds only explicit Record<string, unknown> callback annotations; all three compositions and four gates were rerun on the corrected final bytes shown above.

All runtime receipts retain HEAD marker9df while executing the frozen modified working bytes. The new binding ties these archived runtime copies and current bytes to the subsequent source commit; it does not misrepresent the old committed9df SQL as repaired. The source manifest row changed only from e690 to2fc. Formatting and self-review passed; prior I1 final-flag enforcement and I2 unique inert-receipt cleanup remain intact. Original CLI2.118 migration creation invocation/output remains implementer-reported and independently unavailable; no recreation or inference of nonperformance. Existing 52 lint warnings (zero errors) and intentional HTTP diagnostic output/M1 remain qualified.

## Preservation and remaining gates

Accepted Task2–7 inputs only; Task1/8 excluded. Conditional hosted20→17 and modern/component1→1; production44 unchanged. Existing private helper default1/NULL::jsonb/full ACL and all unknown55000 behavior are preserved. No production writes, main/release merge, push, provider action, public preview, cluster-role/default repair, shared scanner change, child agents or dependent tasks. Windows ACL infrastructure failures occurred before execution; scoped escalation retries were allowed, with no actual automatic review rejection bypass.

PG17.6 application reconstruction, exact17.11/Auth component capture, and actual full CI are separately qualified. Broader UAT/JWT/PostgREST/Auth-internal/provider/full recovery not run. SAME scoped source review and fresh five individual exact-final-head CI results are controller-owned pending gates; original failed CI remains a concern until those complete.

[Full source/runtime binding](task-9-fix-4-source-binding.json) and [append-only archive translations](task-9-receipts/translation.json) bind all raw captures, failed setups, source/image evidence, prior receipts and controller rulings. Prior1615 translation entries and252 blobs are retained unchanged. Separate Fix4 report and the append to task-9-report.md carry the same findings.

## Final read-only covering check

`python .superpowers/sdd/r01-forward-schema-plan-20261001/task-9-fix-4-cover.py` exited0. Receipt: task-9-fix-4-covering-check.json. It verified exactly440 inserted/zero removed SQL bytes on line91, all six committed source files against tested raw bytes, all210 database runtime copies and78 gate runtime copies/77 unique gate inputs, final flags and raw gate logs, all prior1615 translation entries/252 original blobs plus new archive bytes, original report/runbook prefixes, and only R01 tracker evidence/concern appends. No database or tests were rerun by this checker. The covering receipt is included in the append-only archive. Controller final DB inspector V2 success and its earlier hosted-count assertion qualification are preserved separately.
