# T15 / ADMIN-03 — shared admin list search

Branch: `codex/audit-list-query-20260927`, based on `758fc9ac5f6423379a9cd87318d969e6e940ee63` (T00–T02 draft PR #134).

## Scope and reproduction

Before this change, typing `a` then `ab` in the supporter list produced two list requests. The isolated 390px browser regression initially exited 1 on that assertion. The same uncoordinated query/filter/page state existed in supporter, sponsorship pledge, adoption case, content, and volunteer activity lists.

`useListQueryState` now debounces free text for 300ms after IME composition, restores the tab's query from session storage, keeps non-sensitive filter/page state in history, cancels obsolete requests via AbortSignal, preserves prior data with a visible refresh state, and resets page on filter changes. Volunteer selection is cleared when filter or committed query scope changes; stale rows cannot be selected for a bulk operation. Export and page controls cannot act on an old scope during a pending search.

## Isolated acceptance

| Check | Environment | Result |
| --- | --- | --- |
| Four affected component suites | Bun, synthetic component mocks | 12 pass, 0 fail |
| Full suite: `$env:SUPABASE_LOCAL_URL='http://127.0.0.1:57321'; bun test` | Disposable `supabase_db_hkscda-audit-remediation-20260927`; synthetic fixtures | exit 0; 2787 pass, 83 skip, 0 fail across 468 files |
| `npm.cmd run typecheck` | Isolated worktree | exit 0 |
| `npm.cmd run lint` | Isolated worktree | exit 0; 52 existing warnings, 0 errors |
| `npm.cmd run build` | Isolated worktree | exit 0 |
| `bun scripts/verify-admin-list-query.mjs` then `node scripts/verify-admin-list-query.mjs` | Synthetic Playwright, 390×844 | exit 0; rapid input one request, Chinese IME one committed request, old slow response ignored, error distinct from empty, real back/forward route restoration, private query absent from browser URL, filter scope clears selection, no horizontal overflow |

The final screenshot is `ui/t15-list-query-synthetic-390.png`, SHA-256 `89ab3df9ebaf215657aaa485c216f0766291aba1437b3c2161adbbd2fa45db02`. This is synthetic UI evidence, not a staff login or production screenshot. The earlier baseline reproduction used the same browser fixture; the rapid-input assertion exited 1 before the hook and exits 0 after it.

An untargeted first `bun test` reached the older local default stack on port 55321 and exited 1 with schema-related RLS failures. Explicitly targeting the disposable audit stack on 57321 yielded 43/43 in the two previously failing RLS files, before the final full-suite rerun. This wrong-stack result is retained as an environment finding, not counted as a code pass.

## Privacy and release boundary

The browser address contains only non-sensitive filters and page. Free-text query is tab session state and is not sent to analytics by this change. Existing list and export endpoints still receive their `q` parameter in the HTTP request URL; no claim is made that reverse-proxy access logs redact it. A transport change would require separate server API and privacy review if request URLs must contain no free text.

No database migration or privileged policy change is included. This PR requires the T00–T02 base. A revert of this PR restores the prior per-list behavior; it does not affect supporter versioned edits in the separate T15 PR #149. No production data, real staff identity, email, payment, or public preview was used. Real-role UAT and same-environment latency measurement remain pending.
