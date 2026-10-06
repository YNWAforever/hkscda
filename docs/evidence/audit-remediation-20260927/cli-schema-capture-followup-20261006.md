# CLI schema capture repair — 2026-10-06

Source commit **4684e14b20784f4dd8fa8f665613463255a92f37**, parent **98c04dc750c1be17229f7bc353d7d90e3f7e440d**, source tree **9961528e02594eae314794adb86efa8a0b7c0b65**. Local commands ran the parent plus the two exact candidate hashes recorded in the [machine evidence](cli-schema-capture-followup-20261006.json). Fetched main remains **4bbd4a4dffbd053328e92c03281a23d1d4ebe682**.

## Defect and implementation

Pinned Supabase CLI2.118.0 emitted a one-row JSON array, while `captureProductionSchema()` read `.rows[0]`. Native56616 exited1 before creating a clone or submitting any migration. The same diagnostic source bytes (SHA2562733107a69bd74553e7991221a29f9aa9a47a4161f997e8559215c3f1fc3f6e7) now pass through the repaired tracked parser.

The source diff only validates the observed transport shape: exactly one row with one catalog, exactly17 expected facets, array/null facet values and string database owner. Unknown/legacy envelopes and malformed facets remain refused. Catalog stability across export, schema-only statements, executable scanner, restoration SQL, strict raw comparator and owned-clone cleanup are unchanged. No historical report is rewritten.

## Actual verification

Windows / Bun1.3.14 `--no-env-file`; only OS environment inherited. Ordinary gates use explicit unavailable loopback59999, no DB opt-ins or provider credentials. Build uses synthetic loopback54329 placeholders. Isolated restoration uses the existing owned local clone170006; hosted access captures schema/catalog metadata only, without production rows.

| Command | Native PID / exit | Result |
| --- | --- | --- |
| `bun --no-env-file test supabase/rls-tests/helpers/productionSchemaCapture.test.ts` before fix | 20436 / 1 | 10pass / 4fail / 33assertions; observed array fails; legacy envelope incorrectly accepted |
| `bun --no-env-file test supabase/rls-tests/helpers/productionSchemaCapture.test.ts supabase/rls-tests/helpers/productionSchemaClone.test.ts` after format | 43124 / 0 | 47pass / 0fail / 381assertions; provider/unknown executable refusals retained |
| `node node_modules/typescript/bin/tsc --noEmit` | 8752 / 0 | Full typecheck |
| `node node_modules/eslint/bin/eslint.js src eslint.config.js vite.config.ts supabase/rls-tests` | 39588 / 0 | 0errors / 52existing warnings |
| `bun --no-env-file test --isolate` | 21712 / 0 | 4293pass / 634skip / 0fail / 12219assertions / 629files |
| `bun --no-env-file run build` | 40152 / 0 | Build completed; generated route source unchanged |
| `node node_modules/prettier/bin/prettier.cjs --check supabase/rls-tests/helpers/productionSchemaCapture.test.ts supabase/rls-tests/helpers/productionSchemaClone.ts` | 10764 / 0 | Both source files formatted |
| Original capture/restoration diagnostic using repaired tracked parser | 47336 / 0 | 06:15:08–06:16:17UTC; missing170006 acceptance below |

Lint/build Python supervisors exited1 while printing Unicode tails under cp950 **after** saving native exit0 receipts. Both wrapper diagnostics and native receipts are retained separately. Explicit unit skips are not DB/API acceptance. Earlier failed/qualified evidence remains preserved.

## Missing-installation170006 acceptance

Fresh schema-only clone `r01_clone_da7f7805329441358917f7f3c8cac79c` contains **158 zero-data public/private tables**. Setup autoanalyze completion was observed before baseline; no engine settings, scanner allowances or raw-comparison exemptions changed. The existing `20261003075753_r01_document_publication_guards_forward.sql` (SHA2569ed664a6fe3bf2d8f93e2a96f34e6cf6b556c8b97e2ea63eb0ed132d0074ce82) installed exactly9 admitted guard objects, then applied a second time.

Unaffected raw catalogs, all original rows/sequences and inventory are preserved. Second application is full raw-equal. Actual wrong-role and actor-descriptor refusal, role reset and context raw equality passed. **Zero maintenance exemptions.** Normal clone drop and original-template preservation succeeded. The complete229757-byte digest/refusal receipt, SHA2568dbd98f3eddbac879faeb056a33f223d675609b9a54d4bb3afc3e0a942bbb1f0, is embedded in machine evidence; hosted schema/catalog bodies and credentials are excluded.

The preceding ignored adapter60812/0 demonstrated the same missing profile without changing shared source; native47336 now verifies the actual tracked parser. Historical R265 native1/55000 remains retained and is not waived. This scoped pass does not establish typed170011 restoration or full146 hosted compatibility.

## Review, release and rollback

Independent reviewer `/root/review_cli_capture_parser_20261006` verified exact hashes, ran14 pure tests (43assertions, exit0), and reported no critical/important/minor issues. Its declined-to-judge items were explicitly accepted as outside this transport repair; the excluded gates remain required. Review observed build still running; the saved native40152/0 subsequently satisfies that local condition.

Publish as a focused stacked draft based on #197, then inspect fresh exact-head five-job CI and required DB steps. Candidate CI/publication is **NOT_RUN at this evidence capture**, recorded separately after publication. This repair is code-complete locally and isolated-profile qualified; it is neither deployed nor operationally enabled. Code rollback is a reviewed revert of source4684e14; there is no new SQL migration in this diff. Existing forward migration manifests/runbooks retain their approval and rollback boundaries.

**No main merge:** #183 still has the actual finance-actor control-column write RED. Exact Task1 five-column ACL and Task8 full-scope classifier source decisions remain pending after automatic approval review rejection. The latest Task8 attempt was rejected before process creation; its exact patch remains unapplied. Conditional merge authority does not waive a known failing gate. All14 new production forward files remain DO_NOT_APPLY; payments and new delivery/media schedules stay disabled.

**NOT_RUN here:** typed170011 full restoration, full146 hosted compatibility rerun, hosted role/private-file/export journeys, provider sandbox/refunds/email, new UI captures/performance comparisons, full/off-machine restore drill, production migration or activation. Staff use the existing [handoff](staff-handoff-20261006.md) and [runbook](r01-release-runbook-20261006.md) with this narrower verification update.
