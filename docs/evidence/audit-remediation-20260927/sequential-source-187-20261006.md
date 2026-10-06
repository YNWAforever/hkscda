# Sequential source acceptance — #187 — 2026-10-06

Original reviewed source `4fbbb477cba2b31c437c99d20c1af8e9a1ebbf69` is integrated with preceding source slices and patched #200 hosting dependencies at `1451951770c9b6f8e87db39a6c3ebec69c52d8b0` (tree `6c22c5915f352f05140ba35caf7759f654206587`). All actual local gates below ran at this exact source. This later evidence commit changes documentation only. Actual-main reconciliation and fresh exact-head CI remain required before sequential merge.

## Scope and qualified earlier acceptance

Restore two service-private sponsorship proof-intent tables and six existing service-only INVOKER contracts. Preserve good objects, owners, grants, RLS, signatures, caller bodies, fingerprint/idempotency and transactional audit. Incompatible metadata rejects55000; Fix1 requires permanent ordinary intent tables without rewrite rules. Independent original review raised a rule/persistence Important finding; scoped Fix1 re-review approved it resolved. [Original evidence](./r01-forward/task-3-sponsorship-submission.md) and [Fix1](./r01-forward/task-3-sponsorship-fix-1.md) remain retained. Integration conflict affected only the R01 tracker row; all other issue rows were equal and preserved, latest source authority/production facts retained.

Unchanged `20261001150925_r01_sponsorship_submission_forward.sql`, SHA256 `ca11bb5f0ce73523c7f5734e4d032307665c2357f0fecaf15f8fc593394f857c`, matches canonical manifest. Actual missing-target RED42P01 and Fix1 four-profile RED retained. Final hosted/modern each12pass74assert; two applies and12 incompatible profiles reject55000 with rollback; preference dependency five negatives. Eligible/invalid valid-UUID animal paths, signed ownership, role/status, audit rollback, concurrent claim and stale lease used synthetic rows/inert Storage. Historical manifest44→41→33 excludes Task1; these counts are historical profile snapshots, not fresh production catalog facts.

Earlier SQL/profile receipts bind their own historical source composition. These isolated DB rehearsals were not repeated in this integration because the reviewed migration bytes are unchanged. No hosted/provider UAT or full typed restore is claimed.

## Actual local gates

Dedicated Windows worktree; Bun1.3.14 / Node24.18.0, patched dependencies. OS-only environment inheritance; Bun dotenv disabled; unavailable loopback59999 for tests and loopback54329 placeholders for build. No provider credentials or fixture mutation opt-ins.

| Command | Native PID | Exit | Result |
| --- | ---: | ---: | --- |
| `bun --no-env-file test --isolate --timeout 30000` | 62396 | 0 | 3176pass291skip0fail10346assert;116.10s |
| `node node_modules/typescript/bin/tsc --noEmit` | 29100 | 0 | separate strict TypeScript gate;131.36s |
| `node node_modules/eslint/bin/eslint.js src eslint.config.js vite.config.ts supabase/rls-tests` | 16504 | 0 | 0 errors;52 existing warnings;157.65s |
| `bun --no-env-file run build` | 27376 | 0 | existing bundle/deprecation warnings;241.84s |

Generated route tree remained current after build. [Complete raw receipts and streams](./sequential-source-187-20261006/) record argv/UTC/PID/source SHA/tree/environment/native exit and stream hashes. Skips are not optional DB/provider acceptance. Raw bytes retain original line endings. Build and typecheck are separate gates.

## Release status and rollback

#200 source95ab6e7c mainCI37485952883 all5+requiredstepsSUCCESS and aliasREADY verified. #184 mergedda8e8850 exact-headCI37486501183 and mainCI37488399449 all5+requiredstepsSUCCESS; aliasREADY dpl_8dJwWDYoT6bArE5g3n9WSYz1Q2ZP exactda8. At this report creation #185 source3f8d4ea4 freshCI37488800007 has four gatesSUCCESS, brand running; #186 local source26478da4 awaits actual-main reconciliation and freshCI. This #187 preparation does not bypass preceding main acceptance or fresh exact-head CI.

code-complete: this reviewed source slice and current local integration. schema-ready: qualified isolated profiles only; production file(s) unapplied. deployed: this source merge pending. operationally-enabled: false. Overall R01 remains partial; Task8 domain implementation, full typed restore and provider UAT NOT_RUN.

All fourteen new R01 forward migrations remain DO_NOT_APPLY and unapplied. No production migration/ledger repair, new paid resource, public preview, real payment/email/refund/content mutation or activation. Checkout/payment/new delivery/new media schedules remain disabled. Source rollback is a focused revert retaining patched Start dependencies; reverting a real defect fix can reintroduce that defect. No automatic reverse DDL/data deletion is supplied.
