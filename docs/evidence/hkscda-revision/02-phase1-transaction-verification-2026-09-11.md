# Phase 1.6 — Basic Transaction Verification

Recorded: 2026-09-11 · Branch `feat/hkscda-six-phase-revision`
Target: **isolated local Supabase stack**, DB `postgresql://postgres:postgres@127.0.0.1:55322/postgres`
Never the production project `iihqjzilgawhfdhdevam`.

## What this closes

Master plan §4.1 item 6 asks for a volunteer activity edit/approval and a manual
donation to be exercised through success, retry, version conflict, and rollback
on audit failure, against isolated data.

The finding here is that **the coverage already existed and had simply never
run**. The suites opt in through their own `*_ALLOW_LOCAL_FIXTURES` pair, and no
CI job set those variables, so every one of the suite's skipped tests was a
database test. `bun test` reported them as skips rather than failures, which is
why a green gate had been mistaken for database coverage.

## Result

```
bun run test:db      →  37 pass · 0 fail · 163 expect() calls · 4 files · exit 0
bun run test:rls     →  38 pass · 0 fail · exit 0
```

75 database-backed tests now execute against a real Postgres with all 56
migrations applied from zero by `bunx supabase db reset`.

### What the 37 actually exercise

From `src/lib/crm/manualGift.database.test.ts`:

| Requirement | Test |
|---|---|
| Retry / idempotency | concurrent identical commands produce one finance/audit/job/consent and stable IDs |
| Version conflict | changed payload conflicts without a second financial write |
| Partial state | pending gifts persist finance without a delivery job |
| Lease fencing | concurrent claims and expired lease recovery fence the stale worker |
| Permissions | anon and authenticated cannot execute finance, claim or retry RPCs |
| Scale | real summary totals include 1001 gifts and retain receipt association |
| Concurrency — last place | real concurrent staff approvals serialize for one remaining place; cancellation frees capacity |
| Shared lock | real public and staff approvals share the same activity lock |
| Capacity vs occupants | real group capacity, approved edits and activity reduction respect current occupants |
| Overbooking | real capacity reduction racing approval cannot overbook |
| **Rollback on audit failure** | real approval audit failure rolls back registration status |

Plus `publicIdentity.database.test.ts`, `lifecycle.integration.test.ts` and
`contentRead.integration.test.ts`.

## How it is kept running

- `package.json` gains `test:db`, which sets the four opt-in variables and points
  them at the loopback stack. The suites' own guards reject any non-loopback
  URL, and `publicIdentity.database.test.ts` additionally requires that exact
  connection string, so the script cannot be aimed at production.
- `.github/workflows/ci.yml`'s `rls-matrix` job gains a step running it. That job
  already starts the stack for the RLS tests, so the database these suites need
  was present all along and merely unused.

## Deliberately not changed

`rls-matrix` keeps `continue-on-error: true`. The repository's documented
promotion path is to prove a job green repeatedly on `main` and then make it a
required check through branch protection — the process its own comments record
for `brand-verify`. Making it blocking is a branch-protection decision for the
repository owner, not a change to slip in alongside the first run.

**Until that flip happens, a red database test still reports as a green CI run.**
That is the remaining gap, and it is a settings change rather than a code one.
