# T10 / R03 — adoption CMS unsaved changes

Draft PR [#143](https://github.com/YNWAforever/hkscda/pull/143), implementation commit 62e22692d69b41135f705672c940976825281b53, based on T00 commit 7a603f2bbec5d446c9a766b5a9ec8c63ea953408. Status: code complete and isolated verified; schema not applicable; deployed no; operationally enabled no.

## Reproduction and change

At the T00 baseline, edit hero.title in the page-content tab and click the fees tab. The isolated Playwright test exited 1 because no alert dialog appeared and the editor unmounted. This is the R03 loss path.

The page editor now reports dirty state to its parent. The parent presents Save and leave, Discard and leave, or Cancel for tab and SPA route transitions. Save waits for the mutation and query invalidation; a failure keeps the editor and dialog open. Browser close/reload uses native beforeunload. Radix alert dialog manages focus and Escape. The local editing baseline stays pinned while dirty, even after a background refetch. On 409, the local text remains, a fresh server version is shown beside it, and adopting the server version requires an explicit action.

## Evidence on 2026-09-27

Environment: isolated worktree codex/audit-cms-unsaved-20260927; synthetic loopback Vite/Playwright fixture at 127.0.0.1:56541; unlinked local Supabase URL 127.0.0.1:57321 for the full automated suite. The browser fixture uses synthetic data and intercepts admin API responses. It is not authenticated staff UAT.

| Command | Exit | Result |
| --- | ---: | --- |
| node scripts/verify-adoption-unsaved.mjs before fix | 1 | No alert dialog on tab change (10-second timeout). |
| node scripts/verify-adoption-unsaved.mjs after fix | 0 | Tab/route cancel, failed and successful save, return, 409 compare, latest-server discard, keyboard Escape, native beforeunload and background refetch. |
| bun test src/components/admin/content/AdoptionInstructionsManagement.test.tsx src/components/admin/content/AdoptionInformationManagement.test.tsx | 0 | 11 pass, 0 fail. |
| SUPABASE_LOCAL_URL=http://127.0.0.1:57321 bun test --timeout=30000 --max-concurrency=8 | 0 | 2787 pass, 83 skip, 0 fail across 468 files. |
| bun run typecheck | 0 | Strict TypeScript accepted. |
| bun run lint | 0 | 53 warnings at first pass; one new hook dependency warning then corrected. Targeted final lint: 6 pre-existing fast-refresh warnings in the two edited files, 0 errors. |
| bun run build | 0 | Client, SSR and Nitro build passed. |
| git diff --cached --check | 0 | No whitespace errors. |

## Staff and release handoff

In the page-content editor, choose Save and leave only after the draft validates. A failed save keeps the local text; close the dialog to inspect the error. If another staff member changed the server draft, compare the local and server values before explicitly adopting the server version. Discard returns to the latest fetched server draft. Closing or reloading the browser uses the browser's native confirmation, whose buttons cannot be customized.

There is no migration, external provider action or changed publication state. Rollback: revert 62e22692d69b41135f705672c940976825281b53 before merge or in a later release. Remaining gate: draft PR review, authorized release approval, and authenticated staff UAT in an approved isolated environment. Production and public preview were untouched.
