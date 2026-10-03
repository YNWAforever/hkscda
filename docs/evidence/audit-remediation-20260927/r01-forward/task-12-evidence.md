# Task12 group enquiry atomic update

Status: local source and owned isolation verified; controller closing Git, independent review and fresh five-job exact-head CI remain separate. Overall R01 stays partial. No production apply, deployment or operational enablement occurred.

## Bound source

The single target is `public.update_group_enquiry_with_audit`. BASE is `f4e96e3484d135d179caea835d913552d96d2dcb`; final executable source is `de35b17745ef9da3114e7dc4ba8c64df38e46702`, tree `a13aade6f0acef843d8f16f6193757d0f3b2c6e9`. The source freeze binds 66 exact current/raw/canonical/Git source inputs. Later metadata commits add proof archives and reports; their final HEAD/tree are separately observed after commit rather than embedded as their own committed-head assertion.

The pinned CLI-created migration is `supabase/migrations/20261003005322_r01_group_enquiry_forward.sql`: 1,286,399 LF bytes; SHA256 `90d640da5f8359258b56b29a46043a3f82a25b8058bb8e7136236bd524d8720b`; raw Git blob `c7c7da6b9c5e0a315c90d5fcc248b603170cf23f`.

The exact four arguments/order, no defaults, jsonb result, postgres owner, existing security-definer setting, actual `public, pg_temp` search path and full service-only ACL with grant options remain bound. R61 adds qualified confirmed/unbanned Auth and active staff/admin SHARE fences; expired bans remain allowed. R62 preserves the actual search-path configuration. The remaining optimistic version/patch/audit body and helpers are preserved. R64 permits only each complete correlated observed profile; unknown tuples fail with 55000 before writes. Held Task1 columns, Task8 targets and the unchanged scanner are outside the target.

## Actual verification

| Proof | Source / environment | Actual result |
| --- | --- | --- |
| Hosted final composition | de35; owned PG17.6 synthetic clone | 38 pass / 0 fail / 142 assertions; 14 full-candidate 55000 refusals; two applies; 16 required literal flags true; 438 saved protected pairs; gaps 8 to 7 |
| Modern final composition | de35; owned PG17.6 synthetic clone | 38 / 0 / 142; same 14 refusals and 16 flags; 438 pairs; gaps 1 to 1 |
| Component final composition | de35; owned PG17.6 synthetic clone | 38 / 0 / 142; same 14 refusals and 16 flags; 438 pairs; gaps 1 to 1 |
| Native final integration | source208; owned official PG17.11.0.002 | 183 actual f4 migrations / 3 managed jobs / 703 commands / 107 prearchived inputs / 4,918 raw files; two applies and actual NEXT; 14 full-candidate refusals; 2 guard-only mixed-vector refusals; 5 psql synthetic cases; four independent before/after zero-row reads; 22 flags true; 4 normal cleanup removals |
| Typecheck | de35; `bun run typecheck` | exit 0 |
| Full local tests | de35; `bun test --isolate --timeout 30000` | exit 0; 4,300 pass / 574 skip / 0 fail / 12,226 assertions |
| Lint | de35; `bun run lint` | exit 0; existing 52 warnings, 0 errors |
| Build | de35; `bun run build` | exit 0 |

The three compositions execute 34 group database tests plus 4 service tests, including actor identity/status/confirmation/ban cases, browser and raw DML denial, optimistic concurrency, actor-lock ordering in both directions, audit rollback/retry, missing/stale rows, nulls, patch validation and actual temporary-schema shadowing. Native-local Bun was NOT RUN: native's five actual psql domain cases are separate coverage. Required fresh CI must execute the dedicated non-skipped group step on PG17.11 rather than infer coverage from aggregate success.

R67 qualifies native source208 evidence across exactly one unexecuted supporting Bun test assertion changed at de35: an absent status patch produces a null audit status under immutable legacy `patch ->> 'status'`. Native entry imports and executed inputs are unchanged. Native evidence remains source208; it is not relabeled as current native Bun/full-suite coverage. R52 qualifies shared-modern aggregate observations during the four local gates; no exclusive modern catalog/Auth/ACL/native preservation is claimed. Local feature database variables were removed; modern57322/Auth52321 and build54329 placeholder were used.

## Raw transport and acceptance

`task-12-receipts/translation.json` retains 41,773 original execution/archive locators, separate raw/canonical/Git identities and addresses. At publication it contains 1,893 unique new raw blobs (604,303,253 bytes) and 35 reference occurrences of exactly four existing immutable f4 Task11 inputs. Original execution addresses and qualifications remain unchanged. The unchanged independent pair diagnostic exits 0; the unchanged actual content audit passes 7 tests / 38 assertions / exit 0 on this payload. Neither raw transport manifest nor pair diagnostic is readiness acceptance.

R68's separate preclosing binder is archived from `.superpowers/sdd/r01-forward-schema-plan-20261001/task-12-accept-6e4a87c2419b/binder-fix1.py`. It independently reads actual original/archive/source/Git pairs, four exact base pins, three current compositions, four gates, the qualified native bridge and all 68 original ordered ruling texts. Its actual invocation exits 0 with fixed version/type/mode, all nine exact required literal flags true, null error and empty failed flags. Closing Git, fresh CI and production/deploy/enable flags remain false. The precise executable, synthetic negative fixtures, invocation, output, exit and first refusal are retained in `task-12-receipts/closing-translation.json` and `task-12-source-binding.json`.

Portable checks preserve original RED and source identities. The initial validator's missing-check RED is retained, along with its one long-filename fixture failure. Final source checks passed 12 tests; the wrapper/row correction passed 14 tests, including malformed/missing/extra keys and independently saved row mismatch negatives. The final separate fixture namespace is also archived; original packaged fixture and compiled-cache bytes remain intact.

The first actual preclosing binder refused because the saved behavior wrapper additionally contains rows. Exact catalog/supplemental equality was independently established; fix1 enforces exact two-key and three-key wrapper contracts and compares the saved rows directly, without dropping them. No DB or broad gate was replayed for this metadata correction.

## Preserved failures and limitations

Early missing-target 42883 and banned/unconfirmed legacy unsafe-update REDs are behavioral diagnostics. Their original receipt boundaries were incomplete and are not retroactively promoted to strict preservation proofs. Initial 22023 fixture failure, unsupported UNLOGGED fixture failure, first native codec failure, metadata-only baseline with after-row observation NOT RUN, hosted template-session refusal, first final native prelaunch zero-job refusal, initial incorrect null-audit assertion failure and metadata wrapper refusal remain unmodified.

R65's proposed audit exception was actually rejected by automatic approval review before mutation. It remains unapplied. R66's distinct safer alternative references only four exact preexisting immutable f4 Task11 artifacts; no audit predicate, attributes/exclusions or Task11 payload was changed. The first duplicate move's path-length failure and successful verified reversible preservation remain distinct.

All 68 exact original reason/cost texts are retained, including historical 66-text native execution context and 67-text bridge authority. Task11's accepted evidence is not rerun or labeled as fresh group evidence. Production44/112 observations are historical; conditional hosted8-to7 does not make overall R01 production-ready. Task1's five controls, Task8's two targets, Task13 and external/UAT/release gates remain held.

## Locators

- [Source binding](task-12-source-binding.json) — primary receipt, source and archive identities.
- [Source freeze](task-12-source-freeze.json) — 66 exact source bindings at de35.
- [Original raw translation](task-12-receipts/translation.json) — executed historical/current proof addresses.
- [Post-publication metadata translation](task-12-receipts/closing-translation.json) — R68 scripts, negative fixtures, actual invocations and controller metadata copies.

The worker did not push. Controller final Git binding, fresh scoped review, draft PR and five individual exact-head CI results are separate remaining work.

## T12-I1 correction (additive; same scoped re-review pending)

The scoped reviewer found that the original R68 consumer accepted incomplete or duplicated row lists. The supplied historical compositions still have actual complete164/163/163 zero rows; their DB execution and original acceptance/source/transport records are retained as history. This is a metadata-consumer defect, corrected under existing R68 without SQL/native/scanner/audit/attributes/suite/DB/gate changes or reruns.

The new qualifier derives sorted r/p relation names from each actual saved public/private catalog and adds auth.users. It requires fixed hosted164/modern163/component163 cardinality, unique exact expected/receipt/behavior inventories, exact row keys and string-literal zero counts. The main acceptance path calls the same shared pure validator exercised by synthetic fixtures. Qualified portable RED is28tests/12failures+1malformed-key error/exit1; corrected GREEN is28tests/0fail/exit0. A fresh actual metadata-only invocation exits0 with nine fixed literal flags true, nullerror and emptyfailed flags; no old passing receipt is relabeled as a new run.

[Fix1 source and executable binding](task-12-fix1-source-binding.json) records exact new source/tests/driver/prearchives/invocation/log/exit/receipt addresses and catalog-derived inventories. [Additive Fix1 transport](task-12-receipts/fix1-translation.json) archives only the new namespace, including meaningful negative fixtures and both actual failure/success outputs. The original41773 and closing340 transport locators and task-12-source-binding.json remain byte-for-byte unchanged. Root historical230 Git binding actually exits0 and is preserved with its original-path/raw-hash prearchive, distinct from pending Fix1 closing Git.

Native remains source208 qualified under R67/native-localBun NOT RUN; runtime source remains de35. R52 shared-modern limits,574 local skips,52 baseline lint warnings, all68 original authority texts, Task1five/Task8two holds and overallpartial status remain. Same scoped reviewer acceptance, fresh five individual exact-head CI and all external/production/release gates remain pending.

## Task12 Fix2 (R69; same reviewer and fresh exact-head CI pending)

Actual CI37099925422 attempt1 on reviewed5d541 failed the unchanged slogan audit: four new Task12 raw aliases duplicated four existing immutable f4 inputs. Typecheck succeeded; the remaining CI gates, including PG17.11 group behavior, were skipped/not run. The failed commit/log/receipt and all41773+340+329+42 historical locators remain intact. The historical329 transport now explicitly has failed5d541 live alias references and is not a current acceptance manifest.

Only the four exact aliases were independently byte/SHA/Git/attribute verified, preserved reversibly in the owned ignored namespace and withdrawn. The new effective transport remaps only five g0/g2/g4/g6/g61 occurrences to the same four R66 f4 Task11 inputs. Every new publisher payload uses this finite resolver; no new Task11 payload or audit/policy/attributes/exclusion change. Unknown, altered, missing and unqualified observations reject.

[Fix2 source binding](task-12-fix2-source-binding.json) and [additive Fix2 transport](task-12-receipts/fix2-translation.json) preserve actual prearchives/invocations/exits and portable RED11 tests/2 failures/exit1, GREEN14 tests/exit0, focused unchanged audit RED1 and GREEN7pass/0fail/38assertions/exit0, plus the new independent metadata-only qualifier. Historical68 R68 acceptance/T12-I1 corrected executable/28GREEN remain unchanged and are bridged to69 ordered original authority texts without replay. Runtime de35/sourcefreeze66/native208 under R67, native-localBun NOT RUN, R52/shared-modern limits,574 skips,52 baseline warnings and overallpartial/held1+8+13/external qualifications remain. Closing Git/same reviewer/five exact-head CI/production remain separate pending gates.
