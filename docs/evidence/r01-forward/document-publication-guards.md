# Document publication guards

The restoration and concurrency strengthening are separate migrations. Apply
restoration first. Do not reapply restoration after strengthening changes the
three restored function bodies.

Restoration installs only the three publication/inverse helpers, their three
constraint triggers and the associated named catalog dependencies. An exact
already-modern installation is unchanged. Unknown or partial installations fail
closed. Existing annual report functions, actor-aware mutation RPCs, grants,
defaults and audit behavior are preserved.

Concurrency strengthening adds an owner-only private publication fence. Every
participating operation locks the asset before touching its fence. Translated
knowledge assets retain sorted lock order. Supplemental annual publication and
asset kind/unpublish hooks preserve the existing annual and RPC definitions.
The fence does not change asset content, updated_at or audit records. Its foreign
key cascades when an otherwise unreferenced asset is deleted.

## Verification

Observed on PostgreSQL 17.6 disposable schema-only clones:

- Both missing and already-modern restoration profiles passed; the second
  restoration and both modern applications were raw no-ops.
- 32 preservation comparator tests passed with 87 assertions. Only five physical
  pg_class counters on matching system catalog heap/index identities may differ;
  raw equality is reported separately from logical preservation.
- Strengthening passed 15 actual private-role permission refusals, two rollback
  and FK cleanup cases, 26 business cases, 12 two-connection site/knowledge races
  and both annual RR publication-first targets.
- All races observed real blocking and preserved the publication invariant.
  READ COMMITTED refused with 23514; RR and Serializable refused with 40001.
- All four original annual/RPC function definitions and raw metadata remained
  unchanged. Owned databases were dropped normally and the template was preserved.

Native PostgreSQL 17.11 uses the committed Task12 seeded baseline, not a zero-data
baseline. Its known six counts are 2 assets, 2 slots, 4 knowledge posts and zero
annual reports, audit rows and Auth users. Those historical seed rows are
preserved; this work does not certify their pre-existing publication state.
The actual native 17.11 modern candidate passed two named raw no-op applications
and preserved all six original seed-table snapshots; all four owned containers
were removed normally. Missing-profile 17.11 restoration remains unsupported.
The 17.11 strengthening matrix and second installation require the fresh GitHub
CI fixture; the available local 55322 server is actually 17.6.

## Portable gates

The ordinary repository gates are `bun run typecheck`, `bun test --isolate`,
`bun run lint` and `bun run build`. The existing isolated database acceptance
entrypoint targets only its dedicated 56322 stack. The existing RLS CI stack is
55322. Brand, accessibility and performance use the tracked local Supabase
fixture and local preview server.

The new document integration entrypoint must be run explicitly against a
disposable local fixture. It has no production URL, .env fallback, provider
composition or ignored receipt dependency. Its modern-local clone route reads
57322 and writes only a newly owned 52322 UUID database. The dedicated 55322 CI
adapter reuses the same typed behavioral tests with an explicit opt-in pair and
actual postgres/session/database/version checks. Focused script strict coverage
and full repository typecheck passed. The typed 17.11 CI runtime remains pending.

The new strengthening no-op test compares original named catalog rows, indexes,
definitions, trigger/constraint identities, ACL/defaults and dependency rows.
Its first two local executions stopped before the first snapshot returned:
22P02 for a text-array parameter, then 22023 for a JSON parameter. The text-first
scalar correction passed: the actual second installation preserved all 111 named
catalog rows, and all 17/26/12/2 permission, business, site/knowledge race and
annual cases returned successfully. This independent strengthening-only route
did not submit restoration SQL or replace its failed strict raw check. Successful
markers do not certify the old unadmitted native proof prototype, full 657/71
validator, H1, production application or deployment.

### Current ordinary local results

Focused script strict, full typecheck, lint and build passed. Lint retains 52
existing warnings. The frozen unit retry passed 4,279 tests with 634 skips and
no failures; its optional API fixture was explicitly unavailable on loopback,
so these skips do not prove database or API acceptance. The unchanged slogan
scan passed separately in 15.77 seconds. Brand, accessibility and performance
passed against the synthetic local fixture and preview; performance scores were
95–100. The generated route-tree diff was empty.

The initial full unit run failed with seven named assertions/timeouts plus two
ENOENT errors caused by moving preserved prototypes after test enumeration.
That run is retained; the qualified retry is not evidence that the seven original
API/database failures were repaired. Dedicated 56322 acceptance could not start
because its local credential fixture is absent. Payment/provider, offsite, hosted
JWT and UAT checks are not run.

The shipping modern-local strict restoration check also failed, and a separate
owned-clone diagnostic reproduced it. Both the pg_statistic and inventory digests
changed; original statistic identity sets matched but values changed. Application,
Auth, ledger and sequence digests were equal. No cause was established and no
comparator exemption was added. This failure is separate from the earlier accepted
restoration profiles and the strengthening behavior tests. Fresh exact-head CI
must report the individual document integration and role/API steps; an aggregate
job result cannot substitute for their outcomes.

Do not commit the old private proof scratch files or ignored execution receipts.
Stage only the reviewed migrations, portable helpers/tests, entrypoint and docs.
Publishing a draft PR must preserve preview suppression and run ordinary CI;
there is no authority to merge, deploy or push directly to main.
