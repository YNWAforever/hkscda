# Sequential source acceptance — #186 — 2026-10-06

Original reviewed source `459438b4034e3f859c4f6218cbac12bdf76d9f68` is integrated with preceding source slices and patched #200 hosting dependencies at `c1cfd84ec6d8dba7465e053b40888920259f2a6a` (tree `89dcd2c205493337a71dcad4bc64e0e9ff49ca0d`). All actual local gates below ran at this exact source. This later evidence commit changes documentation only. Actual-main reconciliation and fresh exact-head CI remain required before sequential merge.

## Scope and qualified earlier acceptance

The shared trigger references only the NEW field present in each adoption/sponsorship row type, preserving existing eligibility/status/type checks, locking, postgres owner, SECURITY DEFINER, search_path, grants and enabled attachments. Exact old/fixed definitions only; incompatible body/ACL/config/attachments including zero attachments reject55000. [Original failure and preservation evidence](./r01-forward/task-3-animal-preference.md) and [header fix](./r01-forward/task-3-animal-preference-fix-1.md) remain historical. Independent original review and fix re-review approved.

Unchanged `20261001154743_r01_animal_preference_record_fields.sql`, SHA256 `28a93d8679a222f89d193af055285c24e86df06f227a7c527df26829957e9867`. Original real missing-row-field RED42703 on both row types; isolated hosted/modern actor suites each6pass16assertions, valid/invalid animal paths. Latest reviewed SQL was applied twice per historical final composition, all five mismatch rollback negatives passed and only intentional function-body catalog delta was allowed. No grants changed. Source SQL and canonical manifest checksums match.

Earlier SQL/profile receipts bind their own historical source composition. These isolated DB rehearsals were not repeated in this integration because the reviewed migration bytes are unchanged. No hosted/provider UAT or full typed restore is claimed.

## Actual local gates

Dedicated Windows worktree; Bun1.3.14 / Node24.18.0, patched dependencies. OS-only environment inheritance; Bun dotenv disabled; unavailable loopback59999 for tests and loopback54329 placeholders for build. No provider credentials or fixture mutation opt-ins.

| Command | Native PID | Exit | Result |
| --- | ---: | ---: | --- |
| `bun --no-env-file test --isolate --timeout 30000` | 52496 | 0 | 3176pass277skip0fail10346assert;66.52s |
| `node node_modules/typescript/bin/tsc --noEmit` | 33776 | 0 | separate strict TypeScript gate;54.50s |
| `node node_modules/eslint/bin/eslint.js src eslint.config.js vite.config.ts supabase/rls-tests` | 13768 | 0 | 0 errors;52 existing warnings;55.46s |
| `bun --no-env-file run build` | 48796 | 0 | existing bundle/deprecation warnings;76.31s |

Generated route tree remained current after build. [Complete raw receipts and streams](./sequential-source-186-20261006/) record argv/UTC/PID/source SHA/tree/environment/native exit and stream hashes. Skips are not optional DB/provider acceptance. Raw bytes retain original line endings. Build and typecheck are separate gates.

## Release status and rollback

#200 main95ab6e7c CI37485952883 all5+requiredstepsSUCCESS and aliasREADY verified. #184 mergedda8e8850 exact-headCI37486501183 all5+stepsSUCCESS; aliasREADY dpl_8dJwWDYoT6bArE5g3n9WSYz1Q2ZP exactda8. At report creation mainCI37488399449 still has brand/performance running; #185 source3f8d4ea4 freshCI37488800007 running. This #186 preparation does not bypass preceding main acceptance or fresh exact-head CI.

code-complete: this reviewed source slice and current local integration. schema-ready: qualified isolated profiles only; production file(s) unapplied. deployed: this source merge pending. operationally-enabled: false. Overall R01 remains partial; Task8 domain implementation, full typed restore and provider UAT NOT_RUN.

All fourteen new R01 forward migrations remain DO_NOT_APPLY and unapplied. No production migration/ledger repair, new paid resource, public preview, real payment/email/refund/content mutation or activation. Checkout/payment/new delivery/new media schedules remain disabled. Source rollback is a focused revert retaining patched Start dependencies; reverting a real defect fix can reintroduce that defect. No automatic reverse DDL/data deletion is supplied.
