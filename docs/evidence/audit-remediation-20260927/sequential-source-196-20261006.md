# Sequential source acceptance — #196 — 2026-10-06

Original reviewed source `e5a28c47b839fa12b770d1e639b0a74368021675` is integrated with preceding source slices and patched #200 hosting dependencies at `0926ce52e9d27305eccba2c594b2f74690ec1987` (tree `c9b880559eea2f63defa56875e549b806950296f`). All actual local gates below ran at this exact source. This later evidence commit changes documentation only. Actual-main reconciliation and fresh exact-head CI remain required before sequential merge.

## Scope and qualified earlier acceptance

Original reviewed source slice: fix(R01): restore document publication guards and concurrency fences. The original source/review/profile evidence below is retained; actual integration changes no reviewed migration bytes. Only R01 tracker conflicts may be resolved; every other issue row is compared and preserved.

<details><summary>Original scoped source/review snapshot; production and release status is historical</summary>

## Fresh CI receipt · 2026-10-06

Exact source **e5a28c47b839fa12b770d1e639b0a74368021675**, actual checkout782a6e5f30663f6331b36fa05d80a3b72919cd05, equal tree d3bc880b023b0108e5b532f24b6266228809428d. [Run37413919942/attempt1](https://github.com/YNWAforever/hkscda/actions/runs/37413919942): verify, rls-matrix, brand, a11y, performance all SUCCESS; every required DB step actually passed. PG17.11.0.002 document transaction step:1 top-level pass/36 assertions, non-skipped. Finance67pass/238assert;group34pass/132assert; separate RLS API suite129pass/9 optional skip/0fail/549assert. Remaining required DB scenario steps passed.

[Dated receipt and bound metadata](https://github.com/YNWAforever/hkscda/blob/887a0c71a8b363dd6eb8c4f6742969d980c1d51c/docs/evidence/audit-remediation-20260927/conditional-merge-receipt-20261006.md) retain all scope qualifications and original local failures. Human authorized conditional sequential merge; this PR remains draft because upstream #183 finance-actor RED, Task8 exact source safety authorization and strict raw R265 failure are unresolved. No new production DDL or activation approved or performed.

---

## Summary

- Restore bounded document publication/inverse guards and add a separate owner-only concurrency fence for site, translated knowledge and annual report references.
- Preserve actor-aware atomic audit, annual RPC bodies and asset content timestamps.
- Include portable permission, rollback, publication, two-connection race and no-op tests, plus the explicit synthetic PostgreSQL 17.11 CI step.

## Source and local verification

Exact reviewed source: e5a28c47b839fa12b770d1e639b0a74368021675. Base: #195, codex/audit-r01-group-enquiry-20261003. Only 16 shipping files; unadmitted prototypes and ignored execution receipts are excluded.

- Focused/full typecheck: exit 0. Lint: exit 0 with 52 existing warnings. Build: native exit 0.
- Qualified frozen unit run: 4,279 passed, 634 skipped, 0 failed; optional API target was explicitly unavailable loopback. Skips do not establish DB/API acceptance or repair the initial API assertions.
- Brand/a11y/performance: synthetic local gates passed; 24 cold performance samples scored 95–100.
- Independent PG17.6 fence: 111 named no-op rows preserved; 17 permission/rollback/FK, 26 business, 12 site/knowledge races and 2 annual races passed. Actual blocking; RC 23514, RR/Serializable 40001.
- Native PG17.11 modern restoration: two named applications and six seed raw snapshots preserved. Missing-profile PG17.11 is unsupported.

## Remaining merge gates

Fresh exact-head CI and the underlying PG17.11 document/role/API steps must be checked individually. Aggregate success with continue-on-error or skipped database steps is insufficient.

Strict full-raw modern-local restoration remains failed on pg_statistic and inventory differences (SQLSTATE 55000); the cause is unestablished and no waiver was added. Dedicated 56322 credentials are absent; available 55322 is PG17.6. Hosted JWT, full journeys, provider sandbox and restore drills are not run.

The user authorized commit and conditional merge on 2026-10-06. This draft publication runs CI; it does not apply production SQL, enable payment/email/media schedules, expose previews or waive any failed gate.

## Release boundaries

All new forward production migrations require their own named approval and exact target-catalog preflight. Preserve existing signed webhooks/reconciliation. Compatible app rollback retains committed financial/audit facts and security clamps.

See docs/evidence/r01-forward/document-publication-guards.md and the separately stacked release package for commands, SHA/environment qualifications, manifest and staff handoff.

</details>

Earlier SQL/profile receipts bind their own historical source composition. These isolated DB rehearsals were not repeated in this integration because the reviewed migration bytes are unchanged. No hosted/provider UAT or full typed restore is claimed.

## Actual local gates

Dedicated Windows worktree; Bun1.3.14 / Node24.18.0, patched dependencies. OS-only environment inheritance; Bun dotenv disabled; unavailable loopback59999 for tests and loopback54329 placeholders for build. No provider credentials or fixture mutation opt-ins.

| Command | Native PID | Exit | Result |
| --- | ---: | ---: | --- |
| `bun --no-env-file test --isolate --timeout 30000` | 62436 | 0 | 4280pass634skip0fail12182assert;58.03s |
| `node node_modules/typescript/bin/tsc --noEmit` | 53816 | 0 | separate strict TypeScript gate;51.79s |
| `node node_modules/eslint/bin/eslint.js src eslint.config.js vite.config.ts supabase/rls-tests` | 4428 | 0 | 0 errors;52 existing warnings;45.12s |
| `bun --no-env-file run build` | 23864 | 0 | existing bundle/deprecation warnings;65.34s |

Generated route tree remained current after build. [Complete raw receipts and streams](./sequential-source-196-20261006/) record argv/UTC/PID/source SHA/tree/environment/native exit and stream hashes. Skips are not optional DB/provider acceptance. Raw bytes retain original line endings. Build and typecheck are separate gates.

## Release status and rollback

Verified #200 main37485952883/95ab, #184 main37488399449/da8, #185 main37490548409/0b, #186 main37492571276/82, #187 main37496751000/c571, #188 main37498550047/2308 and #189 main37500228059/84ad: all5 actual jobs/required steps SUCCESS and each exact source alias READY. #190 merged5b2c226f after CI37500291415 all5/stepsSUCCESS; main37501995829 and alias validation pending. #191 prepared2dc1d5ec freshCI37502048843 running. Production metadata-only2026-10-06T16:01:38Z public/private158tables355functions, ledger112/max20261001072505/no new R01 ledger entries; scope differs from old public-only counts and is not full146requirement admission. Task8 isolated missing-target/actor/shape RED and two good PG170006 profiles documented; amended final gates/review pending. Prior opted-in shared synthetic DB preservation failure retained, no repair; final units omit all DB/provider optins. Future booking policy positives, full typed restore/hosted/provider UAT NOT_RUN. All14 current new SQL DO_NOT_APPLY and new Task8 SQL also unapproved/unapplied; no payment/new delivery/media activation. Current update: #190 main37501995829 all5/stepsSUCCESS and exact READY5b2c226f verified; #191 merged4a6e40b4 exact READYdpl_9FJZZdvXE7hqCAMpvRQeVvp2Ww9X, main37503886320 still running. #192 publishedc8fb55d6 with entire treeequal to prepared eb190015; freshCI37504704592 pending. #193 all4 nativegates0 at a1eaacb6, docs packaging metadata directory-read failure qualified, recursively byte-verified c0f54d5d. Task8 final19e8b1ad all4 native0, focused hosted/modern each19pass56assert and12refusals; independent taskreview pending. Earlier release observations retained with timestamps. Later verified #191 main37503886320 all5 jobs and required stepsSUCCESS with exact READY4a6e40b4. #192 ownCI37504704592 pending. This later observation supersedes earlier pending status only; no new SQL/operational activation.

code-complete: this reviewed source slice and current local integration. schema-ready: qualified isolated profiles only; production file(s) unapplied. deployed: this source merge pending. operationally-enabled: false. Overall R01 remains partial; Task8 domain final acceptance pending. Full typed restore and hosted/provider UAT NOT_RUN.

All fourteen new R01 forward migrations remain DO_NOT_APPLY and unapplied. No production migration/ledger repair, new paid resource, public preview, real payment/email/refund/content mutation or activation. Checkout/payment/new delivery/new media schedules remain disabled. Source rollback is a focused revert retaining patched Start dependencies; reverting a real defect fix can reintroduce that defect. No automatic reverse DDL/data deletion is supplied.

## Local source-cache qualification

Before the accepted full-suite run, a separate read-only tracked-file audit ran at the same SHA and measured its file-read stages. Its original native receipt/streams are retained in pre-suite-source-read. No source file, test assertion, exclusion or30s timeout changed. Local suite acceptance therefore describes the environment after that source read; it is not a cold-cache performance claim or a product fix. Fresh exact-head cold CI remains required.
