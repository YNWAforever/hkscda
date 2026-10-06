# Sequential source acceptance — #185 — 2026-10-06

Original Task3 source `3e869c56526b4d8f6ac827b088117cdc7e301cf5` is integrated with reviewed Task1 ACL, #184 Task2 and patched hosting dependencies. Actual local gates ran at `821ad81e42329ab3dc4b522b89ca85b6bb7dc2f0`; reconciliation with actual merged #184 main `da8e8850944cb4198e0b4bb2730d5c01a1e27887` produced `e3b229ec5e4e73d496b587dddce99fa6b25b4b6f` with an identical complete Git tree `c850430c52fdd26b5487f5d53fe087f750e0793a`. This later evidence commit changes documentation only.

## Source scope and prior acceptance

This is a test harness change: each function uses its own exact `pg_catalog,pg_temp` configuration; seven reviewed native identities remain pinned. Unknown/network/dynamic execution, unsafe callee scopes and high-OID core impostors fail closed. Independent scoped review and fix re-review were approved. [Original RED/GREEN and isolated profile evidence](./r01-forward/task-3-core-scope-guard.md) remains retained: pure guard33pass338assert; unchanged helper composition hosted/modern each12pass74assert. Those isolated DB profiles were not rerun for this main integration. No application SQL, ACL or provider behavior is added by #185.

## Actual local gates

Dedicated Windows worktree; patched dependency set from #200, Bun1.3.14 / Node24.18.0. OS-only environment inheritance; Bun dotenv disabled; unavailable loopback59999 for tests and loopback54329 placeholders for build. No provider credentials or fixture mutation opt-ins.

| Command | Native PID | Exit | Result |
| --- | ---: | ---: | --- |
| `bun --no-env-file test --isolate --timeout 30000` | 56340 | 0 | 3,176pass269skip0fail10,345assert;85.54s |
| `node node_modules/typescript/bin/tsc --noEmit` | 16260 | 0 | separate strict TypeScript gate;47.52s |
| `node node_modules/eslint/bin/eslint.js src eslint.config.js vite.config.ts supabase/rls-tests` | 22036 | 0 | 0 errors;52 existing warnings;61.42s |
| `bun --no-env-file run build` | 40600 | 0 | existing bundle/deprecation warnings;80.37s |

Generated route tree remained current after build. [Complete raw receipts and streams](./sequential-source-185-20261006/) bind argv/UTC/PID/source SHA/tree/environment/native exit and stream hashes. Skips are not optional DB/provider acceptance. Build and typecheck are distinct gates.

## Release state and rollback

#183 merged f1d8cf84 but its production attempt was blocked by the old Start dependency. Focused #200 repaired that blocker and merged `95ab6e7cb67d377960e3787d08ec670788a86c14`: exact-head CI37484175677 and main CI37485952883 all five jobs and required steps SUCCESS; production alias READY `dpl_2zsf1iu38b4v8H95Xmx57y8tgF6n` at that exact SHA. Five public read-only GETs returned200 with no visible root error; these smoke timings are not comparative performance results.
#184 exact head e6091f98 CI37486501183 passed all five jobs/required steps and merged `da8e8850944cb4198e0b4bb2730d5c01a1e27887`; at this report creation its main CI37488399449 and deployment are still being verified. #185 requires fresh exact-head CI against main and previous-main acceptance before its sequential merge.

code-complete: Task3 test-only slice and current integration. schema-ready: no new #185 schema; prior isolated acceptance qualified above. deployed: #185 pending; source #200 verified READY; #184 postmerge pending. operationally-enabled: false. Overall R01 remains partial, including Task8 domain implementation, full typed restore and provider UAT NOT_RUN.

All fourteen new R01 forward migrations remain DO_NOT_APPLY and unapplied. No production migration/ledger repair, new paid resource, public preview, real payment/email/refund/content mutation or activation was performed. Checkout/payment/new delivery/new media schedules remain disabled. Source rollback restores conservative fixture refusal with a focused revert while retaining patched Start dependencies; no #185 database rollback is needed.
