# T16 / VOL-01, VOL-02 — volunteer availability and layout

Draft PR #151. Code commit: `6ac152e720b0b087919954ab83d1e3e94338a14f`. Branch `codex/audit-volunteer-availability-20260927`, stacked on T15 PR #150 at `040bc1b4137289816f12aca97eb3f71be6b413a7`.

## Before and after

The audit observed an empty volunteer calendar and a left-aligned public section. Source used `section-container` in two sections, while the public design system defines `public-container`. The public session browser gave the same empty message for an unfiltered calendar and a filtered search.

Both sections now use `public-container`. An unfiltered empty calendar says there are currently no published, verified sessions, offers the existing volunteer contact address and retry, and states that staff must approve and publish before booking. A filtered empty search explains the filter scope and offers clear filters. No session date, availability, consent, notification subscription, or approved schedule is invented.

The staff overview now shows a private 14/30-day read model from published policy versions and activity rows. It distinguishes published, unpublished/unbound, missing, off-day, policy-inapplicable, and unknown. Off-days do not count as missing. A failed or truncated read returns `coverage: null` rather than zero. It shows blockers and links to the existing activity generate/preview workspace and policy settings; publish and booking commands retain their existing revalidation.

## Isolated verification

| Check | Environment | Result |
| --- | --- | --- |
| Initial empty-state and policy-gap regressions | Bun, synthetic | Reproduced red before implementation |
| Targeted coverage/API/browser tests | Bun, synthetic | 15 pass, 0 fail, exit 0 |
| Existing copy contract plus new empty-state tests after repair | Bun, synthetic | 4 pass, 0 fail, exit 0 |
| Full suite: `$env:SUPABASE_LOCAL_URL='http://127.0.0.1:57321'; bun test` | Disposable audit Supabase stack, synthetic fixtures | exit 0; 2799 pass, 83 skip, 0 fail across 471 files |
| Policy DB scenarios with `VOLUNTEER_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:56322/postgres` and `VOLUNTEER_TEST_ALLOW_LOCAL_FIXTURES=1` | Separate disposable policy stack | exit 0; 6 pass, 0 fail, 345 assertions, 21.51s |
| `npm.cmd run typecheck` | Worktree | exit 0 |
| `npm.cmd run lint` | Worktree | exit 0; 52 existing warnings, 0 errors |
| `npm.cmd run build` after final source change | Worktree | exit 0; Vite build 27.38s |
| Synthetic Playwright component fixture | Chromium, 390/768/1366px and 200% at 768px | exit 0; expected copy/cards visible, no page errors or horizontal overflow |

The first full-suite run exited 1 on an existing empty-state copy assertion after wording changed from “先登入及完成身份登記.” That wording was restored; the focused regression and final full suite both passed. This is a repaired regression, not a skipped failure.

The separate policy DB scenarios cover newcomer and existing member gates, group enquiry and paired confirmation, 48-hour cancellation windows, waitlists, daily cross-session quotas, policy save/preview/publish/generate, concurrent booking, and incomplete-policy rejection. Test fixtures use policy catalogue values; the production-approved timetable, capacity, and newcomer quota were **not** asserted from production. The 09:30–12:30, 10-person, and 5-newcomer values occur in the catalogue and need operational confirmation before publication.

Screenshots: `ui/t16-public-synthetic-{390,768,1366}.png` and `ui/t16-admin-synthetic-{390,768,1366}.png`, plus `ui/t16-{public,admin}-synthetic-768-zoom200.png`. SHA-256 of the 390px public image: `a27c80c87200ebc068639a6a032c8344502fdcd999d27ac2b6d5ac42f905ff90`; 390px admin: `e99b7664ab531024014f409f38395e0ba1666936d3ad1c8ab62a54cee9bf20b7`. These are synthetic component screenshots using the actual public CSS and Tailwind styles. The full local route returned SSR HTML but its dev client entry was 404 in this worktree; hydrated end-to-end page acceptance is therefore not claimed.

## Release boundary and rollback

This PR adds no schema migration or session row. The coverage read is staff/admin-authorized and service-role-only after authorization; malformed centre query is rejected. No public user can read the staff coverage API through the handler. The public booking repository still only lists future, published sessions with a policy version. An unpublished or invalid session does not become available through this change.

Revert this PR to restore the previous overview and layout. Approved live policy versions, real published sessions, genuine volunteer/staff identity UAT, actual mobile browser journey, and release approval remain external gates. Publishing a session remains an independently authorized operational action.
