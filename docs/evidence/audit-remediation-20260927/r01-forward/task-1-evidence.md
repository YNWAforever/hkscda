# R01 Task1 — partial source and guarded clone evidence

2026-10-01; isolated branch `codex/audit-r01-payment-columns-20261001`, BASE `4bbd4a4dffbd053328e92c03281a23d1d4ebe682`. This scoped forward SQL is **not production applied, deployed, operationally enabled or complete**. All original migrations/manifests/receipts remain; the canonical migration manifest adds one source checksum row, not an applied ledger entry.

## Current unresolved requirement

Real JWT RED demonstrates authenticated active treasurer can overwrite a server-controlled checkout field through inherited table UPDATE. The requested grant conversion would preserve exact old-column INSERT/UPDATE/grant-option rights, leave other ACLs/RLS unchanged, and withhold all five control fields. Automatic approval review rejected editing that SQL source because it considered the ACL effects insufficiently authorized. No rejected patch was saved or executed; explicit user authorization for source edits and isolated tests is pending. Production DDL remains a separate gate. Task1 must not be marked ready based on the intermediate GREEN below.

## Commands and results

| Proof | Command | Result |
| --- | --- | --- |
| Baseline full gates | bun run typecheck; bun test --isolate --timeout 30000; bun run lint; bun run build | All exit0;3195pass/188skip/0fail;10138assertions |
| Hosted-prestate RED | R01_FORWARD_ALLOW_LOCAL_FIXTURES=1 bun run supabase/rls-tests/helpers/runR01Forward.ts red | Exit1;0pass/1fail;actual missing-column42703 before forward migration |
| Modern NULL-hole RED | Same runner red-modern | Exit1;0pass/1fail;historical CHECK accepted keyedNULL, expected23514 absent |
| Finance actor RED | Same runner actor-red-modern | Exit1;0pass/1fail;active treasurer JWT direct checkout_url UPDATE accepted, expected42501 absent |
| First hosted GREEN attempt | Same runner green 20261001101333_r01_payment_idempotency_forward.sql | Exit1;5pass/1fail/23assertions;wrong test expected42501 for JWT-less UPDATE although RLS returned0; retained failed receipt |
| Intermediate modern GREEN | Same runner green-modern with exact migration filename | Exit0;6pass/0fail/26assertions, before actor requirement was added; not final GREEN |
| Pure harness guards | bun test supabase/rls-tests/helpers/productionSchemaClone.test.ts | Exit0;5pass/23assertions |
| Final safe local gates | bun run typecheck; bun test --isolate --timeout 30000; bun run lint; bun run build | All exit0;3200pass/197skip/0fail;10161assertions;52pre-existing lint warnings |
| Final independent harness smoke | See task-1-final-harness-smoke.json | Exact hosted parity158empty tables; seven fixture paths safe; both originals preserved; normal cleanup |

Baseline and final safe environment remove inherited *TEST_DATABASE_URL/*ALLOW_LOCAL_FIXTURES. CHECKOUT_POLICY_TEST_DATABASE_URL is loopback57322/postgres; SUPABASE_LOCAL_URL loopback52321. Build uses loopback54329 and ci-placeholder keys. No remote provider/production writes. Final local gate receipt is recorded separately and verifies BASE plus the explicit Task1 workingtree files later committed; opt-in actor RED is intentionally not run against original databases during the ordinary full suite. The nine additional skips are seven opt-in database cases plus before/after hooks; they do not establish database GREEN.

## Schema fidelity

Pinned authenticated Supabase CLI2.118.0 schema-only export public/private; catalog reads bracket capture to reject drift. Raw SQL/stderr stay in memory, no credentials/raw production dump/data persisted. New unique loopback52322 database explicitly OWNER postgres, derived only from the approved synthetic template; no original reset, FORCE, termination, engine restart or cluster role change.

Hosted normalized public/private catalog SHA256 `35bb5327140b49ae9ee3c507b468d5ef3d2f43e21745a0a2830a86c09b9dd170`;158application tables verified empty. Modern source hash `ff54a5cf4a410e0f192aad005ac5e8964fa6118f27b8adc5cd9e9c601720d27b`;162empty app tables. Comparison includes every column/function/constraint/index/trigger/policy/type/view, full effective ACL grant options/owners/config/RLS, extension owner/member metadata, relevant role attributes and default ACLs including global namespace0 (zero global entries). Restore aligns six actual schema-specific default ACL records and implicit public-schema usage rather than trusting schema-filtered export omissions.

citext/pg_trgm1.6 remain supabase_admin owned in the new DB. Synthetic retained Auth/Storage full metadata hash `482cc9eb2636bcdcc71e4217c34992570389e0c668119ef3ebe74d0a3464b00c`, including FKs/triggers/indexes/ACLs/policies/definitions; comparison before/after public/private replacement proves local prerequisites preserved, not hosted Auth/Storage equality. Empty search_path normalizes pg_get_* deparsing. Role attributes cover five reviewed roles; memberships cover entries into anon/authenticated/service_role, represented null because zero, not a full cluster inventory.

Latest actor receipt additionally proves both original synthetic sources unchanged by catalog, retained prerequisites, all non-system table row aggregates including ledgers, and sequence hashes. All target fixtures are synthetic. The original synthetic ledger is retained, never fabricated/restored from hosted versions, and is not deployment-readiness evidence.

## Forward migration and preservation

CLI-generated filename `20261001101333_r01_payment_idempotency_forward.sql`; canonical LF SHA256 `5c25abdd2507c102e2892db9c8ed878132301ca7aecd55c9e33f304790d230c6`. Five nullable/no-default fields; strict keyed fingerprint cannot pass UNKNOWN; legacy bothNULL preserved; unique non-null keys. Unknown types/defaults/constraint/index definitions abort for review. No backfill, function replacement or policy enablement.

Intermediate second apply preserves full catalog hash, pre-existing succeeded/refunded money/provider facts and temporary shadow tables. Wrong column type/default/nonunique index/unexpected CHECK abort55000; historical keyedNULL rows abort23514 with full transaction rollback. Concurrent key retries and payment claims create one winner, saved checkout URL persists, partial payment failure rolls back donation. These proofs do not resolve the newly watched direct-actor grant defect. Remaining final ACL/permission matrix, real-JWT old-column audit rollback and full final isolated GREEN remain pending.

## Reusable interface and limits

See [harness API](../../../../supabase/rls-tests/helpers/README.md). Imports have no top-level effects. The dump parser rejects data/global/role/schedule invocations and unsafe expression evaluation; stored network-bearing function definitions are not called. Fixture scanning rejects direct/transitive network or dynamic SQL trigger/default/check paths. Every later RPC requires its own full call-path review.

Failed attempts remain distinct. The first hosted failed GREEN and intermediate modern GREEN precede later guard/actor extensions; no overwrite or reclassification as final success. A setup parameter/parsing error and transient normal-disconnect cleanup refusal are documented in the scratch implementation report; the retained task-created clone was later verified session-free and dropped normally.

Controller independent review, scoped PR and fresh exact-head CI remain external/not run. Hosted forward DDL, paid branches, provider/browser/full recovery UAT and the other39requirements are not run by Task1. Production retains44 residual manifest issues at ledger112. Isolated checkout remains false/version1.
