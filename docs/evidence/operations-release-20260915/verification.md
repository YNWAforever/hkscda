# Final local verification — 2026-09-15

Candidate branch: `feat/hkscda-operations-release-20260915`, based on `33b158340dc8fcc137c3ccb3302e514f3676475e`. The original audit baseline and newer publishing changes were compared and retained. Implementation commit: `f5e2911`. Implementation and handoff commits can be located with `git log origin/main..HEAD`.

All database and browser checks used synthetic records in the dedicated local Supabase instance (API port 56321, database port 56322) and local app port 56336. The acceptance runner explicitly binds application and fixture clients to that instance and disables live provider credentials. No production queries, mutations, emails, payments, public preview, remote push, main merge or deployment were performed.

| Gate | Command or reproducible script | Final result |
|---|---|---|
| Full acceptance | `bun run test:acceptance:all` | 2,455 passed, zero failed; 8,555 assertions in 419 files, 42.76 seconds |
| Explicit RLS | `bun run test:acceptance:rls` | 45 passed, zero failed; 82 assertions in 3 files |
| TypeScript | `bun run typecheck` | Passed |
| Lint | `bun run lint` | Passed with zero errors; 45 existing warnings |
| Production build, local configuration | `bun run build` | Passed; large shared chunks remain a performance limitation |
| Public brand | `node scripts/verify-public-brand.mjs` with local base URL | 26 routes across 5 viewports passed |
| Public accessibility | Same script with `MODE=a11y` and local base URL | 26 routes across 1 viewport passed |
| Migration compatibility | `scripts/check-volunteer-compatibility.ts` | Older rehearsal database rejected; candidate accepted |
| Migration rehearsal | `scripts/rehearse-operations-migrations-local.ts` | All 109 migrations clean and upgrade paths passed; historical 103 files unchanged |
| Recovery rehearsal | `scripts/rehearse-operations-restore-local.ts` | Backup restored into a separate database; ledger, synthetic facts and grants verified |

The six additive migrations and exact hashes are in `migration-manifest.json`. Database-before-app deployment, rollback boundaries and approval gates are in `release-runbook.md`. Raw local logs remain in ignored `.local-policy-test`; their hashes are recorded in `verification-log-manifest.json`.

## Browser and adversarial acceptance

Member journeys exercised authenticated mobile booking, destination-term consent, rescheduling and cancellation in a non-Hong-Kong browser timezone. Role checks include member access and administrative denial. Bulk journeys exercised draft creation, persistent selection, preview/apply, responsive filters, keyboard drawer exit, calendar and treasurer denial. Quality journeys exercised keyboard pledge review without financial mutation, reference pagination beyond page 50, delayed draft hydration and image republishing. Recorded journeys had no JavaScript errors; the bulk workspace recorded zero Axe violations. See the individual JSON reports and screenshots rather than treating the 48-route static inventory as 48 complete browser journeys.

The mandatory real-database scenarios include a capacity-10 session with nine confirmed people and two concurrent last-seat requests; administrator role loss after preview; and 104 sessions across two shelters and 52 Hong Kong days with a cross-shelter fifth/sixth-person race. They passed 192 assertions. Existing attendance and money history are preserved.

Independent review identified and resolved early draft hydration/save races and referenced-image deletion during publication. Later isolated tests and browser follow-ups verify both fixes. An intermediate mobile screenshot rerun collided with concurrent fixture changes; the successful full journey report and subsequent read-only mobile verification are retained separately. A prior brand navigation abort during active editing was superseded by the final frozen-source successful run.

## Remaining release boundaries

Unresolved operating decisions are listed in `bulk/operations-decisions.md`; synthetic fixture policies are not approved client defaults. Editorial candidates require actual source review, not guessed content or bulk deletion. Production ledger/state inspection, staff pilot, hosted performance and post-release monitoring require approved target access and release approval.

Controlled measurements show substantial payload reductions and faster policy snapshot reads. Bulk SQL latency did not improve, and exploratory HTTP latency exceeded its development budget under concurrent work. These are explicit limitations in `performance.md`, not passing production performance claims. No new deployed Core Web Vitals claim is made.
