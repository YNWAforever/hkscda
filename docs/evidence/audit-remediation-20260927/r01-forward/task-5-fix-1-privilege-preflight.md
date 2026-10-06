# R01 Task5 Fix1: effective Auth access and creation defaults

## Scope and authority

Round1/5 Important I1/I2 only, against FIX_BASE `1ba6a79a60309651c134aa0d525e632be64a43ac`. Original Task5 reports, bindings, receipts and reviewed legacy contracts remain historical evidence. This fix is source complete and verified in isolation, pending controller scoped re-review and exact-head CI. It makes no whole-branch readiness claim. Production schema application, deployment, release and enablement remain unauthorized and false.

Read the Task5 brief, original report and independent `task-5-review.md` before changes. Sole implementer; no delegated agents. Source discovery followed the current graph; known SQL/docs/scripts paths used direct reads because they are excluded from the graph. Existing Supabase, TDD, debugging, worktree and verification instructions applied. All local commands used the scoped escalation because the ordinary shell helper has a deny-read ACL; no filesystem ACL or engine change was made.

Controller authorized transaction-local Auth column/default grants only in individually owned, zero-data disposable clones, using existing roles and normal rollback/drop. No production actor call/data read/write, provider action, new role, role membership, cluster grant, lab default, shared helper or other-domain change occurred. Task1 payment source ACL approval and real actor RED remain open. Task4 PR188/head490 CI36913123561 attempt1 all five SUCCESS and scoped review closure remain recorded; Fix1 has its own pending review/CI.

## Reproduced defects before fixing

At 20:41:38–20:42:38 UTC on 2026-10-01, the original Task5 SQL (`4e535bfb6677cf5e249a0bf7188e0e83658be3c00189acc486deca863edb859e`) actually accepted all 13 unsafe profiles on an owned hosted schema clone, before final source changes. Expected RED exit 1. Each successful migration was forced to roll back. Full application/private catalog/default ACL, Auth table and column ACL, Auth and application row hashes, eight native RI triggers/dependencies, source inputs, ledger and original template/modern hashes were preserved; the exact owned clone was normally dropped.

I1 cases: SELECT(email) and UPDATE(banned_until), each granted directly to service_role and through PUBLIC. Actual PostgreSQL effective privilege probes were true for the affected operation despite the old table-only precondition accepting the migration. No production roles or memberships were changed. Current service_role has no inherited parent membership; PostgreSQL privilege APIs supply effective inheritance handling without manufacturing a new membership fixture.

I2 cases: existing dashboard_user received public schema function EXECUTE, private schema helper EXECUTE, public schema table SELECT, global function EXECUTE, and global table SELECT through postgres creation defaults. The actual newly created targets retained those effective unfamiliar rights on the first old-SQL apply. Three schema default grant-option cases and a missing global owner EXECUTE profile were also accepted by the old preflight. Defaults were restored by transaction rollback, not by compensating changes.

Original RED JSON and console bytes are retained exactly. The archived executed RED runner was **reconstructed later** from precise known later differences, and its SHA `3f7b0c89947b8ed488c5c231039973e34afcf92e5ad571742e0bc60e247b93e0` matches the original actual RED receipt. It is not an originally retained source copy. The binding verifies all 24 RED input hashes against FIX_BASE Git bytes, except that reconstructed runner; the old executed SQL is separately archived from its exact FIX_BASE blob.

## Smallest implementation

The pending forward SQL adds `has_any_column_privilege(service_role, auth.users, SELECT,UPDATE)` to the existing pre-mutation prerequisite. The runner enforces the same effective denial in its fresh managed Auth profile. No Auth ACL is granted, revoked or normalized by the migration.

Before any creation, SQL determines which exact table/public functions/private helper are absent. It validates only the applicable postgres global and schema default ACL entries. Unfamiliar recipients, grantors, grant options, unexpected privileges or an incomplete global owner profile raise 55000. Known nongrantable recipients are the existing explicit creation clamps; unknown rights are rejected before mutation. Schema additions and absent global entries retain PostgreSQL's normal semantics. Existing functions retain their reviewed ACL rather than being subjected to creation-only defaults.

[PostgreSQL default privilege documentation](https://www.postgresql.org/docs/current/sql-alterdefaultprivileges.html) establishes that creation uses the current role's defaults and combines global defaults with schema additions. [Privilege inquiry functions](https://www.postgresql.org/docs/current/functions-info.html) provide the effective table/column checks used here.

The entire creation/replacement phase is byte identical to FIX_BASE. Public archive remains INVOKER and the private actor bridge remains SECDEF/postgres/empty search_path/service-only EXECUTE. Their exact signatures, bodies, return/config/owner/grants, Auth→admin SHARE fence, audit/idempotency and linked-fact behavior are unchanged. Native eight RI checks, shared `productionSchemaClone.ts` SHA `5352ca4c2660e341b88bb34519e369aa7420711bb9df7c80daff5dadd9387519`, other domain code and production upload/cleanup callers are unchanged. See the exact creation-phase proof and the 24-source raw/canonical/Git blob binding.

The database test now checks effective SELECT and UPDATE denial for every Auth column and attempts direct service SELECT with LIMIT 0 and UPDATE with WHERE false. The synthetic managed Auth schema has 35 columns, 34 nongenerated columns. Generated UPDATE assignments are not executed because PostgreSQL rejects them before permission evaluation; their effective UPDATE denial is still asserted. No service Auth rows are returned or changed. The existing 17 behavior tests gained 141 assertions, totaling 241 per final profile.

## Actual validation and failed evidence

| Run | Actual exit / result |
| --- | --- |
| Old SQL red-privilege | 1 expected RED; 13 accepted profiles, every transaction rolled back |
| First hosted GREEN | 0; 17 pass / 241 assertions / 49 refusals; retained before fixture fix |
| First modern setup | 1; 42883 from redundant DROP of already absent private helper; retained failure |
| Final hosted | 0; 17 pass / 241 assertions; 13 new + 36 existing 55000 refusals |
| Final modern | 0; 17 pass / 241 assertions; 13 new + 36 existing 55000 refusals |
| Final typecheck | 0, 31.60 seconds |
| Final tests | 0, 3228 pass / 266 skip / 0 fail / 10478 assertions |
| Final lint | 0, 52 existing warnings |
| Final build | 0 |

The first modern failure was confined to fixture preparation: the source's private helper was already absent, so an unnecessary DROP failed before applying Task5 SQL. Removed only that DROP from the test runner, froze the final composition again, and reran both profiles and all four gates. The pre-fixture-fix runner is also a later exact reconstruction (SHA `1d7196a9be2ea7fab3421ad12dc32afa03bda0fc6f416ad6a182e184502a846c` matches both actual intermediate receipts); all 24 intermediate input profiles are separately bound. Failed setup rollback/source preservation and normal clone cleanup are retained separately; the first hosted result is not presented as the final runner execution.

Final hosted completed 20:51:56.568Z; modern completed 20:52:35.865Z; four gates completed 20:57:40.465654Z on 2026-10-01. Both profiles applied SQL twice, exercised temp shadow, rejected all 49 drift cases with full rollback preservation and preserved Auth ACL/defaults, rows, unrelated catalog, native RI enforcement/dependencies, ledger and frozen source hashes. Modern good media definitions remained exact; its known unsafe original archive body was changed only as authorized by original Task5, with the exact private prerequisite. Hosted public manifest remains 146 requirements, cumulative 44→41→41→33→30→25 in the accepted dependency order; modern remains 1→1. Task1 SQL was not applied. Public structural GREEN alone is not the acceptance argument.

The final SQL SHA is `2e63db57af4071932da88d7fee29d66b0f8c5fb37e7a29428380b872450fe4ca`. The current manifest checksum was updated before both final runs and gates. Twenty-four actual final inputs were equal across both final receipts and remained frozen through completion. Execution parent is FIX_BASE; tested source candidate tree is `ba9b3d63577beeac9ea53bac67c189119ad7fec0`; the later evidence packaging commit is a different identity.

### Commands and environment

The runner commands used `R01_ANIMAL_DRAFT_ALLOW_LOCAL_FIXTURES=1` and `R01_ANIMAL_DRAFT_EVIDENCE_LABEL=task-5-fix-1`, with:

```text
bun run supabase/rls-tests/helpers/runR01AnimalDraftForward.ts red-privilege 20261001193722_r01_animal_draft_archive_forward.sql
bun run supabase/rls-tests/helpers/runR01AnimalDraftForward.ts green 20261001193722_r01_animal_draft_archive_forward.sql
bun run supabase/rls-tests/helpers/runR01AnimalDraftForward.ts green-modern 20261001193722_r01_animal_draft_archive_forward.sql
C:/Python314/python.exe docs/evidence/audit-remediation-20260927/r01-forward/task-5-fix-1-gates.py final
```

The exact gate commands are `bun run typecheck`, `bun test --isolate --timeout 30000`, `bun run lint`, `bun run build`. Bun 1.3.14. Rehearsals use only uniquely owned `r01_clone_<32hex>` databases on loopback52322, zero application data, read-only template52322 and modern57322 captures. Auth service permissions match the actual production metadata; no clone calibration was required. The final wrapper clears inherited feature DB opt-ins, uses dedicated DB57322/Auth52321 and build54329 placeholder values. Only normal owned clone cleanup was used; no FORCE, backend termination, reset, backup restoration or cluster change.

The mandated full suite runs synthetic fixture transitions separately from the read-only source preservation proof. Dedicated57322 aggregate advanced from `f52f62aa3d27df6715922036a02c103cfbc82bd178981a8e3c272df9602fc448` to `2a008c317589a983c000926b42f1938ed19d34e7737bb3ba358d251e2f877631`; no restoration/reset. The template stayed `c653c8e55cd609b04ca58f3c288549e57da84afe92fe559882c423139a46edb6`. Before/after receipts are separate from per-clone preservation.

Fresh production catalog-only read at 20:55:04.338534Z confirmed effective service Auth SELECT/UPDATE false, ledger112, intent absent, public target overloads0 and private bridge absent. Earlier readonly defaults matched the allowed current-role profile; private/global creation entries were absent. These are compatibility metadata only; no production data or actor invocation.

## Evidence, self-review and remaining gates

`task-5-fix-1-binding.json` records actual raw/canonical SHA and Git blobs for all 24 final inputs and all 24 RED inputs, final commands/exits, failed setup, fixture transition and each immutable raw payload. `task-5-fix-1-receipts/.gitattributes` is separate metadata, using `* -text` only for this versioned folder. Original Task5 evidence remains unchanged. Raw logs retain exact CRLF/whitespace formatting; artifact formatting is surfaced separately from source validation in `task-5-fix-1-artifact-whitespace.json`. Actual full diff-check exit is **2**, confined to six immutable receipt payloads; scoped application/source/metadata diff-check exit is **0**. The raw package has 24 payloads totaling 813546 bytes, plus the separate attributes metadata. No blanket full diff-check success is claimed; the precise full exit and affected immutable receipt paths are recorded there. All non-receipt application/source/metadata paths must pass the scoped diff check.

Self-review covered the full FIX_BASE source diff, pre-mutation check ordering, creation-only default applicability, exact creation phase equality, all-column direct denial, inherited/PUBLIC API semantics, frozen source hashes, actual rollback/cleanup and both final receipt/gate outputs. The private bridge remains an explicit prerequisite rather than an additional public manifest requirement. No implementation source was edited after final runs.

Remaining: controller independent scoped re-review and exact-head CI; production/release/enablement approvals; hosted remote JWT/PostgREST/Storage and provider UAT not run. Local validation uses direct SQL and inert SQL-backed Auth/Storage DI. The 266 gated skips are not remote/provider coverage. Existing 52 lint warnings, router/expected-error output noise (M1), Task1 ACL/actor gate and analogous Task2/3 native FK whole-branch review remain deferred as declared; this fix does not broaden them. New sending, checkout, delivery and media cron remain off.
