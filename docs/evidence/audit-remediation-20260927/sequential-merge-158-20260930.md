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

## Dependency continuation, 2026-10-01 HKT

Code SHA `7b426c61ab9bfb1085fe5cfad02b83b709d880a5` incorporates final #157 `381e6ad409d7dce6b717feff3d77250e1cfd200f` and #156 `edd13112c66bf83c2b840b8d93441e0c3b9c838e`. T23 application source matches original reviewed `ad640d1d`; inherited recovery/portal source matches #157. The framework-generated tree retains both task-overview endpoints and recovery verification. Four documentation conflicts were resolved by preserving both historical evidence sections and a field-wise three-way tracker merge:34 rows each, zero conflicting/unexpected cells. Independent integration review found no actionable findings and reran12 focused tests/73 assertions.

| Command | Exit | Environment and actual result |
| --- | --- | --- |
| `bun test` | 0 | Bun1.3.14; local checkout Postgres57322/Auth52321 and preference schema clone52322;3024 pass,97 skip,0 fail,9384 assertions,528 files,101.56s |
| `bun run typecheck` | 0 | Strict TypeScript on combined candidate |
| `bun run lint` | 0 | 0 errors;52 existing warnings |
| `bun run build` | 0 | Synthetic loopback54329/ci-placeholder; serial Vercel build; generated routes current |
| `node scripts/verify-task-overview-review.mjs` | 0 | Actual component at loopback56557;390/768/1366px; keyboard role changes, suspended identity hides cards and makes no request, zero/unavailable distinction, Axe0/page errors0/no overflow including200% zoom |
| `bun scripts/verify-task-overview-local.mjs` | 0 | Real isolated Auth/PostgREST57321; generated identity only; staff5/treasurer4/admin5 cards; all metrics ready;401/403/405 paths, pending/disabled identity, same-token role recheck, caller role ignored; no email sent; synthetic identity cleaned |

New captures `ui/t23-overview-integrated-after-{390,768,1366}.png` preserve the earlier before/after files. No new migration is introduced by T23; the combined manifest has48 entries because it includes the new #156 challenge schema. Code-complete=yes for the overview slice; ADMIN-04 remains partial for later bulk/filter slices. Deployed=no for #158; operationally-enabled=no. #134–#155 remain22/46 merged and main/production alias remains24196faf. #156 latest five CI gates are green; #157 latest gates and this newly published #158 head must be checked before release. Exact #156 new-migration approval is pending; #157 preference migration is already specifically approved. No production DDL, data mutation, real email, payment or new schedule occurred in this checkpoint.

The97 skipped scenarios, production metric query plans/live staff identities, hosted-provider recovery parity, full backup restore and same-environment production before/after performance remain not-run. Disable recovery/payment/new schedules and preserve all predecessor data/schema on rollback. This newer checkpoint supersedes the historical predecessor blocker state above while retaining the original audit record.
# Supporter release destination checkpoint — 2026-10-01 HKT

Documentation integration16f1021258f03a99c147285290a61385094f4b18 includes corrective supporter PR181 headf8e91932 and real main5b3c1e6b ancestry. The `src`, `scripts`, `supabase` and workflow trees remain identical to #158 reviewed f2604c80; its previous full3024/97skip/0fail and typecheck/lint/build0 are source verification, not a new local rerun. Current publication must obtain fresh exact-head CI. #158 base is now explicitly main. Every subsequent merge must verify baseRefName=main before mutation.

#156 is merged/deployed at5b3c1e6b; five main gates green. #157 migration was separately approved/applied (actual20260930165057, ledger97, unchanged supporter15/consent22/audit600), but #157 accidentally merged only into its dependency branch. Main publication is being corrected by PR181; main releases remain23/46 until that correction passes CI and deploys. Recovery/payments/new sending remain disabled. [Actual execution, backup, signatures and rollback](sequential-execution-20261001.md). No additional #158 migration or production data operation is required; existing full-restore/hosted staff UAT limits remain.

