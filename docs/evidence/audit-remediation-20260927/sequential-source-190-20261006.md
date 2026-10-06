# Sequential source acceptance — #190 — 2026-10-06

Original reviewed source `5cd611721d5128f4a9f009ebe4b2646955d90db8` is integrated with preceding source slices and patched #200 hosting dependencies at `9de593baf1e18f7455b4e70a128c9e228dc7bafb` (tree `36ed50d316e1d94439260601c30aa4dad4c3409b`). All actual local gates below ran at this exact source. This later evidence commit changes documentation only. Actual-main reconciliation and fresh exact-head CI remain required before sequential merge.

## Scope and qualified earlier acceptance

Original reviewed source slice: fix(R01): restore CRM atomic commands with actor fencing. The original source/review/profile evidence below is retained; actual integration changes no reviewed migration bytes. Only R01 tracker conflicts may be resolved; every other issue row is compared and preserved.

<details><summary>Original scoped source/review snapshot; production and release status is historical</summary>

## R01 Task 6 — CRM atomic compatibility repair

**DRAFT / DO NOT MERGE OR APPLY.** Stacked on #189. Exact head: `5cd611721d5128f4a9f009ebe4b2646955d90db8`. Source, isolated schema readiness, production application, deployment and enablement are separate.

### Changes

- Restore three service-only public INVOKER commands: `mutate_crm_supporter_with_audit`, `replace_supporter_roles_atomic`, `append_crm_consents_with_audit`.
- Own private actor bridge fences confirmed/unbanned Auth then active admin/treasurer. Preserve version, supporter locks/triggers, atomic audit, identity, immutable consents and result contracts; reject malformed/empty consents before writes.
- Exact CRM permission code42501 becomes generic403/no-store in real mutation handlers; Response/Zod400/P4090409/unknown500 remain.
- Bind full owner/ACL/grant options, argument defaults, native/FK/Auth/default privileges and known catalog profiles before mutation. Unknown profiles refuse55000; no historical migration or Auth/cluster/default privilege normalization.
- Fix2 adds only one captured complete supporter profile, source-derived from existing #150 maintenance restrictions plus #177 prior-column writes. Existing known profiles and every definition/grant/body/signature tail are unchanged. New negatives cover assignment-column grants, grant options and hybrid table-wide writes.

### Latest actual local verification

All commands below bind final SQL SHA256 `2b1282a33bd5f6aa67c42af56ee45404fd97ff21e75ea9f3228b4c49d7a4cdd0` and head5cd61172.

| Command / environment | Exit | Result |
| --- | --- | --- |
| `R01_CRM_ALLOW_LOCAL_FIXTURES=1 bun run supabase/rls-tests/helpers/runR01CrmForward.ts green` — new zero-data hosted-schema clone, PG17.6 |0|25pass/205assert,63 preserved55000 refusals,2 applies |
| Same runner `green-modern` — new synthetic modern clone, PG17.6 |0|25pass/205assert,63 refusals,2 applies |
| Same runner `green-component` — new source-component clone, PG17.6 |0|25pass/205assert,64 refusals,2 applies |
| `bun run typecheck` — loopback57322/Auth52321 |0|58.14s |
| `bun test --isolate --timeout 30000` — loopback isolated full suite |0|3235pass/292skip/0fail/10499assert,113.29s |
| `bun run lint` |0|47.02s;52 existing warnings deferred |
| `bun run build` — loopback54329/placeholder keys |0|91.38s |

Final DB UTC2026-10-02: hosted00:19:58–00:20:33, modern00:21:01–00:21:38, component00:22:02–00:22:38. Final gates00:23:01–00:28:11. Each clone accepted a positive baseline before negatives and verified audit rollback, role/ban/disable/version races, concurrency/retries, temp shadows, two applies, complete catalog/rows/Auth table plus column ACL/default/native/ledger/source preservation and normal owned DROP. Dedicated full-suite fixture7a89→943093 is recorded separately; read-only templatec653 remains unchanged.

Unchanged actual-handler HTTP tests were originally7pass/20assert, with real4pass/3fail RED retained, and run inside the latest full suite. Direct isolated SQL and inert-handler tests are distinct from hosted JWT/PostgREST/provider/browser UAT, which is not-run.

### Failure-first and evidence

- Original absent RPC/unsafe actor/consent behavior RED and Fix1 actual old7f acceptance of12 unsafe metadata profiles are retained.
- Actual previous #190 CI36942406286 at8b: verify/a11y/brand/performance SUCCESS, RLS FAILED during Supabase17.11.0.002 startup with supporter55000; all RLS behavior steps skipped. Aggregate workflowSUCCESS comes from continue-on-error and does not satisfy five individual gates.
- Actual owned PG17.6 reconstruction of exact existing #150/#177 fragments reproduced the oldd608 supporter55000 after accepted baseline. Only table/column ACL facets changed; all other profiles/facets preserved. This component proof is explicitly not a full17.11 cold-bootstrap proof.
- Root independently verified final34 gate inputs/28 DB observations across all3 profiles/57 raw artifacts/runtime5/candidate8, diagnosis33 executed inputs and original7f/Fix1 immutable bindings/receipts against raw/canonical/Git bytes. Four exact8b source archives and three canonical-only historical script archives preserve actual version distinctions. Raw CI log127807bytes/hash3253123d is retained.
- Metadata-only binder/cp950 failures, historical setup/format failures and immutable-artifact whitespace exit2 versus source/metadata exit0 are qualified separately; none are passed-off domain results. No raw receipts overwritten or runtime rerun after commit.

[Current versioned report](https://github.com/YNWAforever/hkscda/blob/5cd611721d5128f4a9f009ebe4b2646955d90db8/docs/evidence/audit-remediation-20260927/r01-forward/task-6-crm-atomic.md), [Fix2 source binding](https://github.com/YNWAforever/hkscda/blob/5cd611721d5128f4a9f009ebe4b2646955d90db8/docs/evidence/audit-remediation-20260927/r01-forward/task-6-fix-2-source-binding.json), [migration and rollback context](https://github.com/YNWAforever/hkscda/blob/5cd611721d5128f4a9f009ebe4b2646955d90db8/supabase/migrations/20261001213914_r01_crm_atomic_forward.sql).

### Current gates and boundaries

Same-reviewer Fix2 scoped review: APPROVED at exact5cd61172; finding ADDRESSED, source spec/quality pass and no new Critical/Important breakage. Fresh exact5cd CI36947861601 attempt1: all five individual jobs SUCCESS, closed2026-10-02T01:00:21Z. Actual PG17.11.0.002 bootstrap/RLS raw log123573bytes/SHA70a08d retained. Task7 isolated dependency execution released; no production release. Fix1 I1/I2 addressed; baseline M1 and identical duplicated generator-property M2 remain deferred to whole-branch review.

Production remains112ledger/44gaps; cumulative isolated hosted22 is not production readiness. Task1 finance ACL approval remains pending and its SQL is excluded: **do not apply-all/db push**. No production DDL/DML, main merge/release/public preview, real payment/email/refund/content publication or new schedule activation. Checkout/new delivery/new media schedules remain off. Skipped292 tests, hosted Auth internals/live JWT/PostgREST/browser/provider/full checkout-recovery UAT are not-run. Separate exact release/migration approval is required.


</details>

Earlier SQL/profile receipts bind their own historical source composition. These isolated DB rehearsals were not repeated in this integration because the reviewed migration bytes are unchanged. No hosted/provider UAT or full typed restore is claimed.

## Actual local gates

Dedicated Windows worktree; Bun1.3.14 / Node24.18.0, patched dependencies. OS-only environment inheritance; Bun dotenv disabled; unavailable loopback59999 for tests and loopback54329 placeholders for build. No provider credentials or fixture mutation opt-ins.

| Command | Native PID | Exit | Result |
| --- | ---: | ---: | --- |
| `bun --no-env-file test --isolate --timeout 30000` | 36576 | 0 | 3183pass351skip0fail10368assert;105.11s |
| `node node_modules/typescript/bin/tsc --noEmit` | 30408 | 0 | separate strict TypeScript gate;78.08s |
| `node node_modules/eslint/bin/eslint.js src eslint.config.js vite.config.ts supabase/rls-tests` | 27668 | 0 | 0 errors;52 existing warnings;96.51s |
| `bun --no-env-file run build` | 34144 | 0 | existing bundle/deprecation warnings;180.67s |

Generated route tree remained current after build. [Complete raw receipts and streams](./sequential-source-190-20261006/) record argv/UTC/PID/source SHA/tree/environment/native exit and stream hashes. Skips are not optional DB/provider acceptance. Raw bytes retain original line endings. Build and typecheck are separate gates.

## Release status and rollback

Verified #200 main37485952883/95ab, #184 main37488399449/da8 and #185 main37490548409/0b: all five actual jobs and required steps SUCCESS; each alias READY at exact merged SHA. #186 merged82a47ef4 after exact-headCI37490791336 all5+stepsSUCCESS; main37492571276/deployment pending. Fresh metadata-only production read2026-10-06T16:01:38Z: PG170006, application158tables/355functions, ledger112/max20261001072505, no new R01 forward ledger entries, existing preference body5d9512de unchanged. Counts are not full146requirement admission. All subsequent source CI/release decisions require live refresh; all14 new SQL DO_NOT_APPLY, Task8 domain/full typed restore/provider UAT NOT_RUN.

code-complete: this reviewed source slice and current local integration. schema-ready: qualified isolated profiles only; production file(s) unapplied. deployed: this source merge pending. operationally-enabled: false. Overall R01 remains partial; Task8 domain implementation, full typed restore and provider UAT NOT_RUN.

All fourteen new R01 forward migrations remain DO_NOT_APPLY and unapplied. No production migration/ledger repair, new paid resource, public preview, real payment/email/refund/content mutation or activation. Checkout/payment/new delivery/new media schedules remain disabled. Source rollback is a focused revert retaining patched Start dependencies; reverting a real defect fix can reintroduce that defect. No automatic reverse DDL/data deletion is supplied.
