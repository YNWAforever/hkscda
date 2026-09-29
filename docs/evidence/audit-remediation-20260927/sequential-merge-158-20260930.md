# PR #158 / T23 task overview — sequential verification, 2026-09-30 HKT

## Scope and defect

Integrated baseline: `a4900e289cb4d4b2929ea25c470205ac32edff38`, incorporating reviewed #157. Repair and evidence harness commit: `40a019157daaeb010bc3817f714609ede1baad84`. This read-only slice adds role-scoped task cards and retains the existing six navigation groups. It does not change schema, process bulk operations, send notifications or enable workers. ADMIN-04 remains partial for later bulk slices and exact destination filters.

The original component cached every identity and role under one query key. In the actual component fixture, changing admin to staff retained admin task cards, and setting the known identity to disabled retained the old counts. Before-fix runner: **exit 1**, reproduced at 390/768/1366px. The fix scopes the key to Auth identity, role and status, enables it only for a currently active identity, passes AbortSignal to the request, removes inactive query data and hides cached cards when identity verification fails or becomes inactive. Server authorization remains authoritative.

## Verification

| Command | Environment | Result / exit |
| --- | --- | --- |
| `bun test --isolate src/lib/operations/taskOverview.server.test.ts src/routes/api/admin/task-overview.test.ts src/components/admin/operations/TaskOverview.test.tsx src/lib/admin/access.test.ts` | Synthetic dependencies | 12 pass, 0 fail, 73 assertions / **0** |
| `bun test --isolate --timeout 30000` | Dedicated checkout DB 57322; local Supabase API 52321 | 2980 pass, 101 skip, 0 fail; 9228 assertions, 525 files, 55.54s / **0** |
| `npm.cmd run typecheck` | Current worktree | **0** |
| `npm.cmd run lint` | Full configured lint | **0**, 52 existing warnings |
| `npm.cmd run build` | Synthetic keys and loopback 54329 | **0** |
| `node scripts/verify-task-overview-review.mjs` | Actual component at loopback 56557, synthetic identity and API | **0**, three widths, keyboard role switch, correct zero/unavailable distinction, suspended cards hidden, no suspended request, zero Axe violations/page errors, no overflow including 200% zoom at 768px |
| `bun scripts/verify-task-overview-local.mjs` | Actual handler + real isolated Auth/PostgREST 57321; generated identity only | **0**, three roles, all 11 unique metric query shapes, same-session role recheck and denied inactive identities |

The local Auth script calls the real requireAdmin implementation, mutates only its generated admin identity, then removes that admin row and Auth user in finally. The same verified session receives staff=5, treasurer=4 and admin=5 cards as its stored role changes. Missing/invalid token returns 401; a non-staff identity, pending invite and disabled staff return 403; POST returns 405; caller-supplied role is ignored. Success and inactive responses are no-store. It generates a magic link locally without sending email. It does not read production identities or mutate existing local records.

The browser fixture is stopped after verification. Before/after screenshots: `ui/t23-overview-{before,after}-{390,768,1366}.png`. Local brand/performance runs for this slice are not-run; remote CI is tracked separately. The 101 skipped full-suite scenarios are not passed. Real staff browser UAT, production metric query plans and production role sessions remain not-run.

## Compatibility and rollback

No migration is added. The count sources depend on previously reviewed schemas, including the #154 media repair columns and #153 content eligibility fields. Missing or failed sources remain individually unavailable; they are never presented as zero or healthy. Production readiness must be checked after predecessor migrations. No external content is changed by the overview.

Roll back this application slice to remove the overview link and page while preserving all records and predecessor schemas. No data rollback is needed. Staff should open the indicated workspace and confirm its filters before acting; exact filter-preserving destinations and cross-domain snapshot/preview/apply/result workflows are subsequent slices.

Sequential release remains blocked at #153's exact two-file approval and later at #156's local Auth concurrent OTP failure. #154 and #155 approvals are recorded but depend on predecessor completion. #157 migration approval remains separate. Nothing in this evidence enables payment, recovery email or new repair schedules.
