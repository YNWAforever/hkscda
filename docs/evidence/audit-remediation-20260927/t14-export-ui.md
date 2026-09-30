# T14 / ADMIN-01 — immediate CRM export status and failures

Status: immediate export UI code complete, overall ADMIN-01 partial because background export is not implemented; schema-ready no; deployed no; operationally enabled no. Source branch codex/audit-export-ui-20260927 from T00 commit 758fc9ac5f6423379a9cd87318d969e6e940ee63. Source commit 04d425cdd614e31f4bfbd7cf8146b7066c5f01cf. Draft PR [#147](https://github.com/YNWAforever/hkscda/pull/147), based on #134.

## Reproduction and change

At baseline, the ExportBar click returned an uncaught Promise. Any 401/403/413/500 or network failure appeared as no visible action, and repeated clicks could start multiple downloads. The added state/view test began red with 0 pass and one missing-export failure. A later mobile browser test reproduced a stale retry button after filters changed; it timed out waiting for that error to clear.

The immediate UI now announces exporting, disables both buttons and guards double clicks synchronously. It reports 401 sign-in, 403 permission, 413 with server count and a 5,000-row narrowing action, 500 server failure, and network/download failure without exposing server response bodies. Retry uses the exact failed filter snapshot; changing visible filters clears that retry so the next export matches the screen. Success announces that download started. The existing server read model still returns 413 for 5,001 rows and refuses any incomplete envelope before CSV; the route sets UTF-8 CSV and existing CSV escaping/formula protection remains. Background export is explicitly described as unavailable until its separate job slice is reviewed.

## Verification on 2026-09-27

Environment: isolated T14 worktree and loopback Supabase API 127.0.0.1:57321; synthetic 390x844 browser fixture 127.0.0.1:56545 with intercepted export API and fake access token. No production donor data or public preview was used.

| Command or gate | Exit | Result |
| --- | ---: | --- |
| bun test src/components/admin/crm/ExportBar.test.tsx before fix | 1 | 0 pass, missing ExportBarView; no progress/error view. |
| bun test src/components/admin/crm/ExportBar.test.tsx src/lib/crm/readModel.server.test.ts src/lib/crm/csv.test.ts | 0 | 19 pass, 0 fail; 5,001-row 413/no truncation, 5,000 exact, CSV escaping/formula prefixes and state/error classifications. |
| node scripts/verify-export-bar.mjs before stale-filter correction | 1 | Existing error/retry remained after visible filter changed. |
| node scripts/verify-export-bar.mjs after correction | 0 | 413 with 5,001 count and no download; pending guard; one complete authorized CSV; retry retained original filter; 403 shown; filter change cleared stale retry. |
| SUPABASE_LOCAL_URL=http://127.0.0.1:57321 bun test --timeout=30000 --max-concurrency=8 | 0 | 2792 pass, 83 skip, zero fail across 469 files before the small pure-classifier extraction. Focused tests passed after extraction. |
| bun run typecheck | 0 | Final strict TypeScript passed. |
| bun run lint | 0 | Final full lint: 52 existing warnings, zero errors; targeted edited files: zero warnings. |
| bun run build | 0 | Client, SSR and Nitro build passed without deployment. |
| git diff --cached --check | 0 | Staged diff had no whitespace errors. |

Synthetic mobile [413 error screenshot](ui/t14-export-413-after.png). The baseline failure was visible only as a missing error/progress state; the red test and browser reproduction record it. Same-environment public performance comparison is in [ui-performance.md](ui-performance.md); no T14 admin performance delta was measured.

## Boundary and next job slice

This PR has no migration and can be reverted without schema rollback. ADMIN-01 remains partial. The next independent PR must add a background job bound to actor, role and immutable filter snapshot; page through all rows; create a private short-lived artifact; support cancellation; reauthorize every download after role changes; clean expired artifacts; and test retries and partial failures in an isolated DB. Only after that slice and role UAT can large export be called complete. The owner must approve any private storage/schema change and release; no production migration, public preview, main merge or real data export was attempted here.
