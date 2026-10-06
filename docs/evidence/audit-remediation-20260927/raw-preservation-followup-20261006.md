# Raw preservation follow-up — 2026-10-06

Tested source **887a0c71a8b363dd6eb8c4f6742969d980c1d51c**, tree **b5acddf0847fb0676350d4e94c13b094b7be6adc**, Windows / Bun `--no-env-file` / PostgreSQL **170006** / loopback only. Each clone had 162 zero-data application tables and was normally dropped; the original template was preserved. No provider credentials were inherited. Application, SQL, test helpers, safety classifier and CI sources were unchanged.

## Actual commands and results

| Diagnostic command | Native PID / exit | UTC interval | Actual result |
| --- | --- | --- | --- |
| `bun --no-env-file .superpowers/sdd/r01-forward-schema-plan-20261001/conditional-merge-20261006/statistics-observer.ts` | 57144 / 0 | 05:20:49–05:21:50 | Control completed; **strict comparison deliberately failed55000** with no migration submitted. Same489 statistic identities, 192 changed values across13 catalog relations; all13 recorded increased autoanalyze counts and advanced timestamps. |
| `bun --no-env-file .superpowers/sdd/r01-forward-schema-plan-20261001/conditional-merge-20261006/settled-modern-proof.ts`, first diagnostic attempt | 44172 / 1 | 05:26:34–05:26:41 | Setup read failed on malformed array parameter before any migration. Failed source/streams retained; clone normally dropped. |
| Same diagnostic, only PostgreSQL array parameter serialization corrected | 50608 / 0 | 05:27:32–05:28:01 | Actual setup autoanalyze completion observed, then unchanged modern migration applied twice. Full raw catalogs, application/Auth/ledger rows, sequences and inventory equal before/after/second; context role/actor refusals also preserve raw snapshots. **Zero maintenance exemptions.** |
| Independent Python receipt/hash/equality validation | wrapper `0d982b` / 0 | after saved native proof | Verified every equality/refusal/cleanup assertion and both unchanged-source Git checks. |

The control demonstrates a setup background-maintenance race in this observed clone. PostgreSQL documents `last_autoanalyze` and `autoanalyze_count` as autovacuum-daemon ANALYZE observations. [Official PostgreSQL monitoring documentation](https://www.postgresql.org/docs/17/monitoring-stats.html#MONITORING-PG-STAT-ALL-TABLES). This control does not identify the historical R265 process. Catalog `reltuples` estimates changing are not evidence of application row loss.

The new pass is **modern170006 only**, with a baseline captured after observed setup completion. It does not close the historical R265 native1/55000 receipt, prove the missing-installation profile, or claim a typed170011 full restoration matrix. Neither the strict comparator nor engine settings were changed. The preceding conditional receipt's “14 changed catalog relation OIDs” is corrected here to **13**; its historical bytes remain preserved.

## Latest bound PR CI

[#197 run37415957277 / attempt1](https://github.com/YNWAforever/hkscda/actions/runs/37415957277) tested source887; actual checkout **3ca4dc41d33b05ff83bc1ff87b5e1a952623f787** has the same tree. All five individual jobs and required steps succeeded: verify112114496403, performance112115006346, a11y112115006347, rls112115006398, brand112115006415. Only ancillary unavailable-artifact report steps skipped. Fresh PG17.11.0.002 RLS ran Task13 **1 top-level pass / 36 assertions**, finance67pass, group34pass, and separate API129pass/9optional skip/0fail. These are stacked-base checks and require main-base verification when dependencies can be retargeted.

## Release disposition

**No merge.** Main remains4bbd4a4dffbd053328e92c03281a23d1d4ebe682. #183 still has the reproduced finance-actor control-column write defect. Its five-column ACL amendment and Task8's exact full-scope native classifier amendment await the previously requested source-only human decisions after automatic review rejection. The rejected table-scope narrowing remains excluded. Conditional merge authority does not waive a known failing security gate.

No new production migration is approved or applied by this result; all14 manifest entries remain DO_NOT_APPLY. Checkout, payments and new delivery/media schedules remain off. Missing/typed profile acceptance, hosted role/private-file/export journeys, provider sandbox, current UI/performance comparisons and a full restore drill are **NOT_RUN this follow-up**. The prior local whole-suite and production metadata observations retain their original source/environment qualifiers.

[Machine evidence](raw-preservation-followup-20261006.json) embeds the actual digest/refusal receipts, observer analysis, setup observations, diagnostic sources, native PIDs/exits/stream hashes, complete source887 CI step metadata and source bindings. It records both failures and the scoped pass.
