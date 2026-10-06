# Hosting package security repair — 2026-10-06

## Actual trigger and source scope

#183 head `a95dc143b8a3214fcc504b7fa48d5c17c1807d8f` merged as `f1d8cf848d76ede90113d58f494b43af35a5beca`. Exact-head CI37478665269 and main CI37480568915 each passed all five gates and their required steps. Vercel production deployment `dpl_E2RzwdoVZB3jByJRiKDPBunFeRYs` then failed `BLOCKED_PACKAGE` for React Start1.167.50. At that check the production alias remained READY on `4bbd4a4dffbd053328e92c03281a23d1d4ebe682`. Source merge did not imply deployment.

The [official TanStack announcement](https://tanstack.com/blog/tanstack-start-security-update-cve-2026-102989) and [GHSA-qx66-fv34-fjm8](https://github.com/TanStack/router/security/advisories/GHSA-qx66-fv34-fjm8) identify patched React Start1.168.60 and server-core1.169.39. Commit `0cc4127105237b27a80e5a8c4a1c008c84f6e3bb` pins Start1.168.60 and its matching React Router1.170.41 /router-plugin1.168.42. Lockfile inspection found one patched server-core and no vulnerable nested Start copy. Only these three direct dependency declarations changed; their required transitive packages and package integrity entries changed in bun.lock. The existing 24-hour minimum release age remains intact. Install scripts were disabled locally.

Commit `aaa298ca8fb4d55650e3193ec33ef9ac718c1de5` imports the new Router ErrorComponentProps type for the existing root error component. The reporter already accepts unknown; rendering and actions are unchanged. Its automatically generated route tree changed ordering only: all6,594 lines have the identical complete multiset. No route was edited by hand. The final build left the committed generated tree unchanged.

## Actual local commands

Runtime: Bun1.3.14, Node24.18.0, Windows, dedicated source worktree. The deployed project's Node24.x satisfies the new package engines >=22.12.0. Gate supervisor inherits only named OS variables, disables Bun dotenv, supplies unavailable loopback59999 for tests and fixture loopback54329 for build, and excludes provider credentials /fixture mutation opt-ins.

| Command | Native PID | Exit | Source /result |
| --- | ---: | ---: | --- |
| `bun --no-env-file test src/lib/dependencySecurity.test.ts` before repair | 30816 | 1 | mainf1d plus new untracked regression; Start1.167.50 rejected;0pass1fail |
| `bun --no-env-file add --exact --ignore-scripts @tanstack/react-start@1.168.60 @tanstack/react-router@1.170.41 @tanstack/router-plugin@1.168.42` | 32760 | 0 | scoped patched install |
| Same dependency regression after repair | 12984 | 0 | dirty patched candidate before source commit;1pass6assert |
| `bun --no-env-file install --frozen-lockfile --ignore-scripts` | 51480 | 0 | no lockfile change |
| `node node_modules/typescript/bin/tsc --noEmit` first candidate | 15488 | 2 |0cc41271; reproduced unknown/Error root props mismatch |
| `bun --no-env-file test --isolate --timeout 30000` first candidate | 61760 | 1 |0cc41271;3,167pass256skip; two source-audit scans timed out during concurrent gates |
| Same two source-audit tests alone, unchanged limits/assertions | 32004 | 0 |aaa298ca;4pass17assert;1.42s |
| `bun --no-env-file test --isolate --timeout 30000` final, alone | 60060 | 0 |aaa298ca;3,169pass256skip0fail;10,312assert;63.91s |
| `node node_modules/typescript/bin/tsc --noEmit` final | 59164 | 0 |aaa298ca;51.55s |
| `node node_modules/eslint/bin/eslint.js src eslint.config.js vite.config.ts supabase/rls-tests` final | 53868 | 0 |aaa298ca;52 existing warnings;68.14s |
| `bun --no-env-file run build` final | 43004 | 0 |aaa298ca;87.80s; existing bundle warnings and new inputValidator deprecation notices |

The two first-candidate source-audit timeout failures are retained. Their standalone and complete-suite reruns passed with identical assertions and timeout; no test weakening occurred. Build success is separate from the successful final typecheck. These commands do not claim the skipped optional database/provider cases ran.

## Review, receipts and release boundaries

A fresh read-only independent review of the dependency lock/package/regression diff reported no Critical/Important findings. It verified all20 TanStack resolutions are single copies and align with installed Start/client/server/plugin manifests. It excluded the later generated tree and root type repair; those were checked by root against the complete line multiset and the final real typecheck/build. Static review does not imply deployment or operational UAT.

[Native local receipts and exact raw streams](./hosting-package-security-20261006/) retain failed/intermediate/final runs. Each supervisor receipt records argv, native exit, PID, UTC, source SHA/tree, environment and stream hash. Before source commits, the RED/GREEN runs used an untracked regression/dirty package candidate on mainf1d; they are explicitly distinct from final sourceaaa298ca. [Provider failure, project runtime and main CI snapshot](./hosting-package-security-20261006/provider-and-main-ci.json) records actual read-only provider metadata.

Source-only fix: no Supabase DDL/DML, migration ledger mutation, paid resource, public preview, real provider payment/email/refund or operational activation. The new R01 forward migrations remain DO_NOT_APPLY. Checkout/payment/new delivery/new media schedules remain disabled. Overall R01 and Task8 business implementation remain partial.

At document creation, this source repair is code-complete and locally verified; fresh PR CI and successful production deployment are pending. Merge only the exact independently reviewed source after all five required CI jobs and actual steps pass, then verify main gates and alias SHA/READY. A source merge is not schema-ready/deployed/operationally-enabled evidence for forward SQL.

Rollback: a focused revert of another R01 source slice must retain these patched dependencies. React Start1.167.50 is vulnerable and Vercel blocks it; returning to that dependency set is not an acceptable release rollback. No database rollback is needed for this source-only repair. Patch forward if a runtime compatibility issue appears; retain current operational disablement throughout.
