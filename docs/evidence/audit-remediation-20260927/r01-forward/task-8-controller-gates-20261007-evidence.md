# Task8 reviewed-fix controller gates — 2026-10-07

Actual checked HEAD: `67143d23aff7b140120bc2f03cc548e27013ed90`; source repair: `960e275f754fb0d7904ddc27afeeafbf52358088`. The independent fix1 report approved both spec compliance and task quality, with all Important findings addressed. These gates followed that scoped review and did not modify executable sources.

## Exact native gates and environment

The existing `python docs/evidence/audit-remediation-20260927/r01-forward/task-8-gates.py` was launched through an OS-only Python subprocess wrapper. Wrapper and harness native exit0. Each child uses `bun --no-env-file`; retained OS keys and exact loopback59999 `ci-placeholder` values are recorded in `launch-environment.json`. All `*TEST_DATABASE_URL`, `*ALLOW_LOCAL_FIXTURES` and provider credentials are omitted. No `.env`, `.env.local`, `.env.development` or `.env.test` exists. Bun1.3.14 / Python3.14.6; version probes native0. The owned node_modules junction was preserved, with no dependency install.

| Actual native command | Exit | Duration | Result |
| --- | ---: | ---: | --- |
| `bun --no-env-file run typecheck` | 0 | 83.78s | completed |
| `bun --no-env-file test --isolate --timeout 30000` | 0 | 124.88s | 4604 pass / 654 skip / 0 fail / 12539 assertions |
| `bun --no-env-file run lint` | 0 | 62.88s | 0 errors / 52 baseline warnings |
| `bun --no-env-file run build` | 0 | 136.13s | completed |

Started `2026-10-06T18:25:51.729872+00:00`, completed `2026-10-06T18:32:53.454783+00:00`. Raw receipt: `docs/evidence/audit-remediation-20260927/r01-forward/task-8-fix-1-receipts/gates-1791311134417003700/receipt.json`. Raw logs retain baseline lint warnings and Vite/TanStack/Radix build notices. No warning cleanup, source/test assertion/timeout change, broad checkout, or extra test opt-in was introduced. This is a local existing-checkout environment, not a cold CI claim.

## Source and database preservation

All18 checked input hashes stayed unchanged. The receipt records raw SHA256, canonical source SHA256, actual Git blob and committed blob/SHA for every input; archived sources preserve their original raw bytes. Post-gate audit independently matches those inputs to checked commit67143d23. Ordinary source CRLF/LF representation handling does not alter raw archive/member bytes.

Read-only `localSourceState` probes use the existing explicit local URLs and preserve the stronger source-database rule:

- Modern57322 before/after: `bf0d926ef1c9952ca19e07980e94e9d273958c917621bc5e78490cd7c65f94be`.
- Template52322 `audit_pr135_20260929` before/after: `c653c8e55cd609b04ca58f3c288549e57da84afe92fe559882c423139a46edb6`.
- `modernPreserved`, `templatePreserved`, `frozenInputsPreserved`: all true.

The previously recorded shared synthetic57322 drift remains a failure in its original receipt; this successful comparison is against this run's actual then-current baseline and does not claim that earlier drift was repaired or waived. No source database mutation/reset/reseed, shared role change or fixture installation occurred.

## Immutable evidence and qualifications

New archive: `task-8-controller-gates-20261007-raw-receipts.zip`,26 files/1624992 raw bytes/308130 ZIP bytes; SHA256 `9f6ed643b6a85acdce191bffd1cbb32d8d961ea05fa53ebd45775de526358cb0`. New manifest records each original path/member/bytes/SHA256 and byte equality. All new local raw paths remain retained. Native packaging/audit0 independently verifies every previous407+69 raw original against its immutable ZIP member, both prior ZIP hashes, and prior committed ZIP/manifest byte preservation. The original artifacts and earlier failed receipts remain unchanged. ZIP-only textual diff exclusion keeps the executable source review visible.

Meaningful Task8 DB acceptance remains the independently approved960e owned hosted and modern profiles:19 tests/56 assertions and14 actual55000 refusals each, complete rollback/catalog/rows/Auth/helper/native/sequence/source preservation. The654 skipped full-suite tests are **not database acceptance**. Matching exact measured catalog/native/helper/Auth/ACL/shape tuples is still the SQL admission contract; no engine-version predicate, version normalization or broader profile union exists. Only PostgreSQL170006 was locally rehearsed. Actual cold exact-head PostgreSQL170011 CI bootstrap/required DB steps, hosted JWT/PostgREST and previously disclosed future-policy UAT remain **NOT_RUN**.

This packaging changes documentation only. The final commit must preserve every checked executable blob and the full checked executable tree relative to67143d23; the final worker report records that verification and exact docs HEAD. No production SQL, provider operation, real data, push, merge, preview, notification or activation occurred.
