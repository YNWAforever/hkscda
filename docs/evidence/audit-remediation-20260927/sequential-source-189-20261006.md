# Sequential source acceptance — #189 — 2026-10-06

Original reviewed source `592bcebda2dc0154d20684a1a2240cfbdd8ae3d1` is integrated with preceding source slices and patched #200 hosting dependencies at `b1b8f5ab0feee9897c93a23a3e20fa1bc5acc61e` (tree `05f26ac0e67071d78abee5624782d563d203e8e0`). All actual local gates below ran at this exact source. This later evidence commit changes documentation only. Actual-main reconciliation and fresh exact-head CI remain required before sequential merge.

## Scope and qualified earlier acceptance

Original reviewed source slice: fix: R01 animal draft upload and audited archive forward schema. The original source/review/profile evidence below is retained; actual integration changes no reviewed migration bytes. Only R01 tracker conflicts may be resolved; every other issue row is compared and preserved.

<details><summary>Original scoped source/review snapshot; production and release status is historical</summary>

## R01 Task 5 — source review package

Draft / DO NOT MERGE. Stack base: #188 (`4906493f`); current source: `592bcebda2dc0154d20684a1a2240cfbdd8ae3d1`. Independent original review found I1/I2; FixRound1 scoped re-review closed both and approved spec compliance and task quality with no new Critical/Important findings. Exact-head CI36928397189 attempt1: all five gates SUCCESS at592bcebd. [CI run](https://github.com/YNWAforever/hkscda/actions/runs/36928397189).

### Scope

Restore the animal draft upload intent table and three exact media functions. Harden the existing archive transaction's current actor check while preserving its public INVOKER signature, audit, idempotency and linked facts. A domain-specific private SECDEF/postgres actor bridge has empty search_path and service-only EXECUTE; it fences Auth then admin before the animal lock without adding direct Auth privileges. Unknown schemas, effective Auth column access and unsafe applicable creation defaults are refused before mutation.

Migration: `20261001193722_r01_animal_draft_archive_forward.sql`
SHA-256: `2e63db57af4071932da88d7fee29d66b0f8c5fb37e7a29428380b872450fe4ca`

### Executed verification

- Actual missing-table RED: `42P01`, before generated forward SQL. Known legacy archive accepted six unauthorized actor profiles before the minimum actor hardening.
- Fix1 RED: original SQL accepted 13 unsafe Auth column/default-ACL profiles. Each actual transaction was forced to roll back with complete catalog/ACL/default/rows/source preservation.
- Final hosted-schema and modern-schema synthetic clones: each 17 pass / 241 assertions, two migration applies, temp-shadow checks, all 49 incompatible profiles refused with `55000`, complete rollback/native RI/catalog/Auth ACL/defaults/rows/ledger/frozen-input preservation and normal owned clone cleanup.
- `bun run typecheck`: exit0 /31.60s; `bun test --isolate --timeout 30000`: exit0 /79.89s, 3,228 pass /266 skip /0 fail /10,478 assertions; `bun run lint`: exit0 /79.87s, 52 existing warnings; `bun run build`: exit0 /112.01s.
- Actual final gate interval: 2026-10-01T20:52:37.080947Z–20:57:40.465654Z. Execution parent1ba6a79a / tested source candidate treeba9b3d6; later evidence packaging HEAD592bcebd is distinct. Environment: Bun1.3.14; dedicated loopback DB57322/Auth52321; build54329 placeholders; inherited feature DB opt-ins cleared.
- Controller verified all24 final input raw/canonical hashes and exact committed Git bytes, all24 new raw receipts and all47 original immutable receipts unchanged. All24 RED profiles bind to the actual original receipt and FIX_BASE or the explicitly reconstructed exact runner archive.
- RED/intermediate runner archives are later byte-exact reconstructions matching actual receipt hashes, not claimed originally retained source copies. Setup errors, timeout and first gate failures remain separately qualified; final results use the final frozen inputs.
- Full artifact diff-check exit2 reflects six immutable raw receipt formatting payloads; scoped application/source/metadata diff-check exit0. Raw evidence was not reformatted.

Hosted clone public manifest:146 requirements, cumulative44→41→41→33→30→25 through accepted Tasks2–5, excluding blocked Task1. Production readonly compatibility at20:55Z remains44 gaps /ledger112; new targets remain absent. This is not a hosted deployment claim.

### Evidence and release boundaries

[Original evidence](https://github.com/YNWAforever/hkscda/blob/592bcebda2dc0154d20684a1a2240cfbdd8ae3d1/docs/evidence/audit-remediation-20260927/r01-forward/task-5-animal-draft-archive.md), [Fix1 evidence](https://github.com/YNWAforever/hkscda/blob/592bcebda2dc0154d20684a1a2240cfbdd8ae3d1/docs/evidence/audit-remediation-20260927/r01-forward/task-5-fix-1-privilege-preflight.md), [final source/receipt bindings](https://github.com/YNWAforever/hkscda/blob/592bcebda2dc0154d20684a1a2240cfbdd8ae3d1/docs/evidence/audit-remediation-20260927/r01-forward/task-5-fix-1-binding.json).

Source and isolated compatibility approved by independent scoped re-review; all five exact-head CI gates SUCCESS. New production application, release/deployment and operational enablement require separate approval. Hosted JWT/PostgREST/Storage/provider UAT is not-run; full suite gated skips are not that coverage. Task1 source ACL approval/actor RED and whole-branch review remain open. M1 baseline lint/router/expected-error noise remains deferred. Checkout, new email and media schedules stay off; no public preview is created.

Source revert removes this unmerged slice. A later database rollback must preserve uploaded intent/linked records and the hardened archive/actor bridge; reinstalling the known unsafe archive body is not an acceptable rollback. Formal backup/rollout/recovery validation is a separate gate.



</details>

Earlier SQL/profile receipts bind their own historical source composition. These isolated DB rehearsals were not repeated in this integration because the reviewed migration bytes are unchanged. No hosted/provider UAT or full typed restore is claimed.

## Actual local gates

Dedicated Windows worktree; Bun1.3.14 / Node24.18.0, patched dependencies. OS-only environment inheritance; Bun dotenv disabled; unavailable loopback59999 for tests and loopback54329 placeholders for build. No provider credentials or fixture mutation opt-ins.

| Command | Native PID | Exit | Result |
| --- | ---: | ---: | --- |
| `bun --no-env-file test --isolate --timeout 30000` | 27220 | 0 | 3176pass325skip0fail10347assert;118.77s |
| `node node_modules/typescript/bin/tsc --noEmit` | 19120 | 0 | separate strict TypeScript gate;91.86s |
| `node node_modules/eslint/bin/eslint.js src eslint.config.js vite.config.ts supabase/rls-tests` | 53432 | 0 | 0 errors;52 existing warnings;103.13s |
| `bun --no-env-file run build` | 49552 | 0 | existing bundle/deprecation warnings;136.95s |

Generated route tree remained current after build. [Complete raw receipts and streams](./sequential-source-189-20261006/) record argv/UTC/PID/source SHA/tree/environment/native exit and stream hashes. Skips are not optional DB/provider acceptance. Raw bytes retain original line endings. Build and typecheck are separate gates.

## Release status and rollback

Verified #184 main37488399449 all5+requiredstepsSUCCESS and productionda8 READY. #185 merged0b5e4999, main37490548409 and deployment pending. #186 prepared87d36cda freshCI37490791336 pending. These are qualified preparation observations; all sequential release decisions require fresh live checks.

code-complete: this reviewed source slice and current local integration. schema-ready: qualified isolated profiles only; production file(s) unapplied. deployed: this source merge pending. operationally-enabled: false. Overall R01 remains partial; Task8 domain implementation, full typed restore and provider UAT NOT_RUN.

All fourteen new R01 forward migrations remain DO_NOT_APPLY and unapplied. No production migration/ledger repair, new paid resource, public preview, real payment/email/refund/content mutation or activation. Checkout/payment/new delivery/new media schedules remain disabled. Source rollback is a focused revert retaining patched Start dependencies; reverting a real defect fix can reintroduce that defect. No automatic reverse DDL/data deletion is supplied.
