# Conditional commit / merge receipt · 2026-10-06

The human instruction **“commit and merge if all go green”** authorized publishing the two reviewed local branches and a sequential merge when required gates are satisfied. Both branches were pushed successfully and attached draft PRs were created. No main merge, production migration or activation was performed.

## Actual publication and CI

| PR | Source SHA | Native push exit | CI run / attempt | Result |
| --- | --- | --- | --- | --- |
| [#196](https://github.com/YNWAforever/hkscda/pull/196) | e5a28c47b839fa12b770d1e639b0a74368021675 | 0 / PID56040 | [37413919942 / 1](https://github.com/YNWAforever/hkscda/actions/runs/37413919942) | verify, rls-matrix, brand, a11y, performance: all SUCCESS |
| [#197](https://github.com/YNWAforever/hkscda/pull/197) | 3dd2af008b9f1c4886b650d9ef805fab146d79ef | 0 / PID17020 | [37413943076 / 1](https://github.com/YNWAforever/hkscda/actions/runs/37413943076) | same five individual jobs: all SUCCESS |

Each required step completed successfully; no required DB step was skipped or failed. Ancillary “unavailable artifacts” report steps were skipped because artifacts were present. The CI checkouts were 782a6e5f30663f6331b36fa05d80a3b72919cd05 and 552aa3d302dc7e1ad9b07326bbc16886c1e0dcbd. GitHub Git commit metadata proves their trees equal their respective source trees d3bc880b023b0108e5b532f24b6266228809428d and 131a378b27ae46cefc4d9e136446c08f229aaf30. These are stacked-base CI results; they do not replace sequential main-base checks after retargeting or prove production schema readiness.

The actual PG image was public.ecr.aws/supabase/postgres:17.11.0.002. On each new RLS stack, Task11 ran 67 pass / 238 assertions; Task12 34 pass / 132 assertions; Task13 1 top-level pass / 36 assertions covering document permissions, audit, concurrency and the independent strengthening no-op. The separate RLS API suite ran 129 pass / 9 optional skips / 0 fail / 549 assertions. All remaining required transaction/bulk/media/listing DB steps passed. The one Task13 top-level test is not reported as 57 individual Bun tests.

Decoded RLS logs, job/step metadata, exact source/checkout/tree bindings and test excerpts are bound in [conditional-merge-evidence-20261006.json](conditional-merge-evidence-20261006.json). No new UI before/after or same-environment performance-improvement measurement was run; performance CI gate success is distinct from that comparison.

## Fresh local commands

All commands below tested source 3dd2af008b9f1c4886b650d9ef805fab146d79ef on Windows using an OS-only environment with no provider credentials or inherited DB opt-ins. Bun dotenv loading was disabled. Build used synthetic loopback54329 placeholders.

| Command | Native PID | Exit | Result |
| --- | --- | --- | --- |
| node node_modules/typescript/bin/tsc --noEmit | 62160 | 0 | 52.38s |
| node node_modules/eslint/bin/eslint.js src eslint.config.js vite.config.ts supabase/rls-tests | 28136 | 0 | 65.44s; 0 errors / 52 warnings |
| bun --no-env-file run build | 41296 | 0 | 115.22s |
| bun --no-env-file test --isolate, first attempt | 29056 | 1 | 4319 pass / 578 skip / 6 fail / 12262 assertions; API variable was omitted and tests used the existing55321 stack |
| same full test command, explicit SUPABASE_LOCAL_URL=loopback59999 | 48848 | 0 | 108.07s; 4279 pass / 634 skip / 0 fail / 12176 assertions; 4913 tests / 628 files |

The first six failures were four document publication API constraints, admin_user direct-write refusal and sponsorship_assignment fixture setup. All six corresponding assertions actually passed, non-skipped, on each fresh PG17.11 CI RLS stack. The explicit unit-run API is unavailable; its skips are not DB acceptance. The first failing streams remain archived. Initial wrong-cwd attempts are also retained separately and are not attributed to application defects. No test assertion, timeout or application source was changed to obtain the passing unit run.

## Merge / migration disposition

**The whole stack is not all green for release. No PR was merged.** First dependency #183 retains the actual finance-actor direct-write RED. Its source grant amendment and Task8’s exact full-scope citext classifier proposal were previously rejected by automatic review for insufficient explicit security-boundary authorization; a human source-only decision is pending. The rejected table-scope narrowing remains excluded.

Task13 strict raw restoration R265 still exited1 / SQLSTATE55000 for pg_statistic and inventory drift. Read-only analysis of the saved synthetic snapshots confirms the same489 logical statistic identities with192 changed rows across14 catalog relation OIDs, including frequency, distinct-value and correlation fields. This is insufficient to identify the executing process or establish a root cause. No failure waiver, maintenance comparator or new raw-preservation pass is claimed.

Fresh production metadata-only observation at 2026-10-06T04:34:56.970406+00:00: server_version_num170006,154 public tables,304 public functions,112 ledger rows, zero of the new14 forward migrations applied. The full146-requirement compatibility checker was not rerun this turn. Every new manifest row remains DO_NOT_APPLY and requires separate named production approval, current catalog preflight, backup / rollback readiness and applicable UAT. Checkout and new delivery/media schedules remain off. Hosted real identities, provider sandbox, full operator journeys and production restore drill: NOT_RUN this turn.

The previous package captures and rejection records remain historical evidence. This dated receipt supersedes their pre-publication Task13 status only; it does not rewrite historical reports or close unrelated blockers.
