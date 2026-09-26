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
