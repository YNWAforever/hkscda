# Animal list search implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this bounded change in the current isolated cloud checkout.

**Goal:** Let staff continuously search and recover the animal dashboard without losing the search controls.

**Architecture:** Preserve the existing dashboard/API boundary. The table owns stable filter controls and an optional results-state union; a small hook owns debounced IME input. React Query cancels superseded reads through its signal.

**Tech Stack:** TypeScript, React 19, TanStack Query/Router, Bun, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-25-animal-list-search-design.md`.

## Global constraints

- Zero hand-written `any`; bilingual admin copy; use shared LoadFailure.
- Preserve URL search, role and mutation contracts; no database or deployment changes.
- Tests use an owned in-memory server and synthetic Auth; block external browser requests.

## Review focus

- Back or category navigation while a debounce is pending must win.
- IME composition must never dispatch intermediate strings.
- Initial and filtered-empty pages must expose archive inclusion.
- Error and loading states must keep controls and hide obsolete row actions.
- Cancellation and delayed responses must not replace the latest results.

## Task 1: Finish and verify the list interaction

Files: `src/routes/admin/index.tsx`, `src/components/admin/AnimalsTable.tsx`, new `src/lib/animals/useAnimalSearch.ts`, new browser regression and synthetic fixture beside the existing admin browser tests.

- [x] Write browser regressions using the real dashboard, table, router and query client.
- [x] Run them on the baseline and record the expected control/focus/archive failures.
- [x] Add `useAnimalSearch(state: AnimalListState, onQueryChange: (query: string) => void)` with 300 ms debounce and composition handlers; synchronize external query changes and clear pending timers.
- [x] Add optional discriminated results state to AnimalsTable; keep controls mounted and archive inclusion always available. Hide results and actions during loading or failure; reuse LoadFailure.
- [x] Wire dashboard query signal and table results state; run browser and nearby locale/state tests to green.
- [x] Run typecheck, full isolated unit/browser suite, lint, build and public brand verification; record actual results and skips.
- [x] Review the whole diff, commit, push the dedicated branch and open the requested PR with validation and no-migration notes. Do not merge or deploy.

## Verification record

Final product/test tree: 7,380 tests passed, 728 skipped, zero failures (8,108 tests across 848 files). Typecheck, lint (zero errors, 53 warnings), build, generated-route-tree check and changed-file formatting passed. Public brand verification passed on 26 routes across five viewports, with no recorded failures. Three synthetic browser scenarios cover the real dashboard/router/query/table. Real-account or database integration is not claimed; no migration is required.

Independent review identified an obsolete archive confirmation surviving a list transition. A new failing browser regression reproduced it; confirmations now bind to their list snapshot and clear on navigation/data/result changes. The new regression passes, including cached Back/forward.

Deferred minor: the local Needs photo filter retains pending search text until the debounce settles; URL navigation and status/archive filters supersede it. No new reset-key API was introduced for this optional consistency change.
