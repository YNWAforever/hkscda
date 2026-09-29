# T00–T02 verification (2026-09-27 HKT)

Checkout base and production alias SHA: `f8d5e5d5840d1775efb7d7f4ae2768f6557096b5`. Worktree branch: `codex/audit-remediation-20260927`. Code commits: `da9967a` (schema checker) and `9854087` (public submission safety). The after-browser measurement ran on the matching dirty working tree before these commits; no code edits followed until they were committed. No production write or public preview.

| Environment | Command | Exit | Result |
|---|---|---:|---|
| Isolated worktree | `bun test src/lib/operations/releaseSchema.test.ts src/lib/operations/releaseManifest.test.ts` | 0 | 10 pass; synthetic catalog |
| Isolated worktree | `bun test src/lib/adoptionInformation/publicPage.server.client.test.ts` | 0 | 12 pass; #133 matrix |
| Isolated worktree | T02 public-form/API/security targeted Bun suites | 0 | 73 pass |
| Dedicated local stack, unlinked `127.0.0.1:57322` | Fresh 143 migrations + `bun scripts/check-release-schema.ts` | 0 | 67 requirements, 0 issues |
| Same stack reset to `20260914164558`, no seed | `bunx supabase migration up --workdir node_modules/.audit-remediation-rehearsal --local` | 0 | 34 migrations, ledger 109 to 143 |
| Same upgraded stack | `bun scripts/check-release-schema.ts` | 0 | compatible, 67 requirements, 0 issues |
| Same upgraded stack with synthetic role fixtures | `bun run test:rls` | 0 | 50 pass, 0 fail |
| Same upgraded stack | `bun test --isolate` | 0 | 2787 pass, 83 skip, 0 fail, 468 files |
| Isolated worktree | `bun run typecheck` | 0 | strict `tsc --noEmit` |
| Isolated worktree | `bun run lint` | 0 | 0 errors, 52 existing warnings |
| Isolated worktree | `bun run build` | 0 | Vercel output generated; separate from typecheck |
| Shared older local stack | `bun test --isolate` | 1 | 6 existing RLS failures against older schema; diagnostic only; all three failing test files passed 48/48 on dedicated upgraded stack |
| Read-only synthetic fixture and built preview | `bun run verify:brand` | 0 | 26 routes × 5 viewports |
| Same fixture and preview | `bun run verify:a11y` | 0 | 26 routes × 1 viewport |
| Same fixture and preview | `bun run verify:performance` | 0 | 4 routes × 2 viewports × 3 cold runs; see `performance-runs.csv` |
| Same fixture, clean production-SHA baseline preview | `bun run verify:performance` | 0 | 24 comparable cold runs; see `performance-comparison.csv` |
| Provider sandbox / data-bearing DB | payment, concurrent retry, backup and rollback rehearsal | not-run | later tasks and external test inputs |

Tests use synthetic fixture identities and local demo keys. The compatibility script only performs SELECT queries; it never applies migrations. Production catalog remains missing the audited objects. This record does not mark the release deployable.

## T18 content eligibility (2026-09-27 HKT)

Isolated worktree codex/audit-content-eligibility-20260927; dedicated synthetic Supabase stack REST 127.0.0.1:57321, DB 127.0.0.1:57322. Schema rehearsal and fixture writes were confined to that stack and rollback transactions.

| Environment | Command | Exit | Result |
|---|---|---:|---|
| Dedicated isolated DB | bun test src/lib/content/publicationEligibility.integration.test.ts with CMS_LIFECYCLE_TEST_DATABASE_URL and local fixture flag | 0 | 1 pass, 13 assertions; metadata audit, eligibility, grants and public profile validation |
| Isolated worktree | SUPABASE_LOCAL_URL=http://127.0.0.1:57321 bun test | 0 | 2,821 pass, 84 skip, 0 fail; before final archived-card follow-up |
| Isolated worktree | bun test src/components/site/stories/StoryContentGrid.test.tsx | 1 then 0 | Red reproduces expired registration CTA; green 1 pass, 5 assertions |
| Isolated worktree | npm.cmd run typecheck | 0 | Strict TypeScript; before final archived-card follow-up |
| Isolated worktree | npm.cmd run lint | 0 | 0 errors, 52 existing warnings; before final archived-card follow-up |
| Isolated worktree | npm.cmd run build | 0 | Client/server output; before final archived-card follow-up |
| Local Chromium/Edge | Playwright browser visual acceptance | not-run | Browser launch timed out (180s Chromium, 20s Edge); desktop helper sandbox ACL failure |
| Production public API | GET /api/stories?page=1&pageSize=50 | 0 | Read-only 7 exact demo-label candidates; no classification change |
| Production content/catalog | migration, classification, upload, provider/payment/email | not-run | Awaiting owner and release approvals |

The subsequent full-suite, lint, typecheck and build checks for the final source tree appear below.

### T18 final source tree after archived-card fix

| Environment | Command | Exit | Result |
|---|---|---:|---|
| Isolated worktree + dedicated stack | SUPABASE_LOCAL_URL=http://127.0.0.1:57321 bun test | 0 | 2,822 pass, 84 skip, 0 fail, 8,597 assertions, 2,906 tests across 476 files |
| Isolated worktree | npm.cmd run typecheck | 0 | Strict TypeScript |
| Isolated worktree | npm.cmd run lint | 0 | 0 errors, 52 existing warnings |
| Isolated worktree | npm.cmd run build | 0 | Vercel client/server output built |


## T19 media repair (2026-09-27 HKT)

Environment: isolated worktree codex/audit-media-repair-20260927; disposable Supabase DB 127.0.0.1:57322 and REST 127.0.0.1:57321. No production mutation.

| Command | Exit | Result |
|---|---:|---|
| bun test src/lib/animals/publicationMediaRepair.database.test.ts src/lib/content/publicationMediaRepair.database.test.ts with MEDIA_REPAIR_TEST_DATABASE_URL and local fixture flag | 0 | 2 pass, 450 assertions; rollback-only DB fixtures |
| CHECK_RELEASE_SCHEMA_DATABASE_URL=local DB bun scripts/check-release-schema.ts | 0 | compatible, 84 requirements, zero issues |
| SUPABASE_LOCAL_URL=local REST bun test | 0 | 2,828 pass, 86 skip, 0 fail, 8,674 assertions across 481 files |
| npm.cmd run typecheck | 0 | strict TypeScript |
| npm.cmd run lint | 0 | 0 errors, 52 existing warnings |
| npm.cmd run build | 0 | Vercel client/server output built; separate from typecheck |
| Browser UI and production media worker | not-run | Browser helper unavailable; no production schedule or copy |
