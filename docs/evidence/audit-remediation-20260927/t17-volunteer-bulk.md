# T17 / ADMIN-04 volunteer bulk — planning and recovery

Draft PR: pending. Code commit: `1bdb04ac26b5152c6b065a79b23755e6c55feefe`. Branch `codex/audit-volunteer-bulk-20260927`, stacked on T16 PR #151 at `01ecaa1f71d3a94d18bd012ca3e3879f1b2155aa`. ADMIN-04 remains partial because the cross-module queues and bulk work in T23 are separate.

## Before and after

The backend already provided immutable selection snapshots, preview groups, per-item validation, one transaction per date group, idempotent apply and status restoration. The prior UI exposed operation and policy UUIDs prominently, required a separate checkbox and click for every otherwise ready draft-generation group, did not summarize exception counts, and had only a four-week shortcut. A synthetic browser check for an eight-week control exited 1 before the fix.

The workspace now presents three staff steps: choose scope, preview differences/exceptions, then execute and inspect results. It shows selection scope and snapshot time/expiry, policy names, dates, before/after capacity, affected registration counts or explicit unknown, and eligible/skipped/conflict/failed counts. IDs and template keys are in expandable technical details. Both four- and eight-week shortcuts use the same Hong Kong date generator; 30-day ranges can be entered in the same workspace.

Only a pure draft-generation preview with every pending item ready can use one review checkbox and sequential execution. Each group still calls the existing authoritative API; a failed/conflicted group or transport uncertainty stops the sequence. The client reads status after an uncertain response, does not replay applied groups, and requires fresh review after restore/refresh/manual apply. Cancel, close, rebind, capacity effects, attendance corrections and any skipped item remain per-group review. Conflict requires a new selection and preview; failed groups retain the original operation retry path.

## Isolated verification

| Check | Environment | Result |
| --- | --- | --- |
| Review model and partial-resume regressions | Bun synthetic callbacks | Red before helper/count/resume fixes; final 5 pass, 0 fail |
| Eight-week UI control | Synthetic Chromium | Absent before fix (exit 1); present after fix |
| `bun test src/lib/volunteers/bulk` with `VOLUNTEER_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:56322/postgres` and `VOLUNTEER_TEST_ALLOW_LOCAL_FIXTURES=1` | Dedicated disposable policy DB | exit 0; 9 pass, 0 fail, 297 assertions; four-week 28 groups, stale preview, double apply, partial/retry, cancel, attendance, role/capacity/daily quota races |
| Notification test sink | Bun synthetic callback | exit 0; 4 pass, 0 fail; bulk follow-up without explicit delivery flags never invokes provider |
| Full suite: `$env:SUPABASE_LOCAL_URL='http://127.0.0.1:57321'; bun test` | Disposable audit Supabase | exit 0; 2805 pass, 83 skip, 0 fail across 472 files |
| `npm.cmd run typecheck` | Worktree | exit 0 |
| `npm.cmd run lint` | Worktree | exit 0; 52 existing warnings, 0 errors |
| `npm.cmd run build` | Worktree | exit 0; Vite 31.22s |
| Synthetic Playwright bulk workspace | Chromium 390/768/1366px and CSS 200% at 768px | exit 0; three steps, policy/capacity/review gate visible, pre-review sequence disabled, no page errors or horizontal overflow |

A concurrent full-suite run exited 1 because the existing migration search_path scan exceeded its 5-second test timeout. That file passed 46/46 alone, then the full suite passed without concurrent static gates. The failed run remains an environment/timing finding, not a pass.

Synthetic UI screenshots: `ui/t17-bulk-synthetic-{390,768,1366}.png` and `ui/t17-bulk-synthetic-768-zoom200.png`. SHA-256 of 390px image: `03a1fb0dafefa114fe2cbd91e4940193d5eefe647d15615d6f439666d0e85a95`. These do not constitute a real staff-login journey. The 1,000-selection case, a live 30-day staff exercise, provider-delivered notification and cross-module T23 operations are not run in this PR.

## Staff operation and rollback

1. Filter the desired dates and policy, then choose this page or all matching items. Confirm the locked count, snapshot time and expiry. Changed filters clear cross-page selection.
2. Preview before any mutation. Review each date, policy name, capacity change, affected people, skip and conflict. Resolve policy or group exceptions first.
3. For all-ready new draft generation, check the single review box and run groups sequentially. For cancellation, closure, policy changes and attendance, review each group separately. After interruption, refresh status; retry only failed groups with the same operation and re-preview conflicts.
4. Review notification or staff follow-up state separately. `provider_accepted` is not delivered. Current bulk `volunteer_operation_changed` outbox payloads omit `dry_run:false` and email channels, so the dispatcher queues/defer them; no send approval or real delivery occurred here.

Revert this PR to restore prior UI. No migration or bulk domain transaction changed. Stacked T15/T16 APIs and schema still apply. Real staff roles, production data, notification approval and release authorization remain external gates.
