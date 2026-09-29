# Audit remediation baseline — T00

Captured: 2026-09-27 01:56 HKT (2026-09-26 17:56 UTC). This is a read-only baseline and an isolated worktree; no production mutation occurred.

## Git and deployment

- Existing checkout `feat/story-promotion-ws3-public` at `5443bb55b8784990a9d345b6c062cd78df3cb3b6` contains extensive unrelated uncommitted work. It was not edited.
- `git fetch origin main` completed; `origin/main` and isolated branch base are `f8d5e5d5840d1775efb7d7f4ae2768f6557096b5`. There are no commits in `f8d5e5d..origin/main`.
- Isolated worktree: `.worktrees/audit-remediation-20260927`, branch `codex/audit-remediation-20260927`.
- Vercel `hkscda.vercel.app` resolves to READY production deployment `dpl_Ggm7uaMZXqFFw7yqZyE7z8D3zg5m`, `githubCommitSha=f8d5e5d5840d1775efb7d7f4ae2768f6557096b5`, region `iad1` (Vercel deployment metadata, captured this run).
- GitHub Actions [CI run 36258190910](https://github.com/YNWAforever/hkscda/actions/runs/36258190910) for that SHA is completed/success: verify, rls-matrix, performance-verify, brand-verify, a11y-verify each success. OPS-01 is historically closed. New release SHAs require fresh gates.

## Handoff integrity

All nine files in supplied `SHA256SUMS.txt` matched SHA-256. The two supplied HTML audits have the same heading sets and issue ID sets as their Markdown editions. The historical reports were copied without alteration under the requested plan directory.

## Local baseline (`Bun 1.3.14`, Windows isolated worktree)

| Command | Exit | Observed |
|---|---:|---|
| `bun install --frozen-lockfile` | 0 | 609 packages installed |
| `bun run typecheck` | 0 | `tsc --noEmit` |
| `bun test --isolate` | 0 | 2712 pass, 139 skip, 0 fail across 466 files; database/RLS behavior requiring local stack skipped |
| `bun run lint` | 0 | 0 errors, 52 existing warnings |
| `VITE_SUPABASE_URL=https://example.supabase.co VITE_SUPABASE_ANON_KEY=ci-placeholder-anon-key bun run build` | 0 | Vercel output generated; build warnings present; build is not typecheck |
| `bun run test:acceptance:all` | not-run | Isolated migrated local DB has not been started |
| local brand/a11y/performance fixture gates | not-run | CI results above belong to baseline SHA; local fixture/browser gate still required for changes |

## Read-only production catalog (project `iihqjzilgawhfdhdevam`)

At capture, all 8 tables and all 14 public RPCs in the T01 minimum list were absent. `public_status_token.submission_fingerprint` was absent. Migration ledger count was 79 with latest version `20260914164558`. These are catalog and ledger observations, not a full release manifest. #133 restores public adoption instructions only for missing revision tables; CMS and submit/upload/finance paths remain incompatible until a reviewed migration is applied. No SQL mutation or personal data read occurred.

## Next gates

T01 must compare every app dependency with catalog signature/grants/RLS/seed, rehearse migrations on isolated DB, and produce an approved runbook. T02 must keep #133 fallback narrow while exposing degraded readiness. Payment and other implementation can continue in this worktree without enabling live checkout.
