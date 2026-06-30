# Phase 4 — Admin Mobile Responsiveness Pass — Design

**Date:** 2026-06-30
**Branch:** `feat/admin-mobile-responsive` (continues the admin UX overhaul; Phases 0–3 complete — Phase 3 payments console is open as PR #13)
**Status:** Approved (approach A — migrate in-scope lists to `DataTable`; scope: core daily-use views; defer kanban + reports dashboards)

## Goal

Make the **core daily-use admin content views genuinely usable on phones**, building on the Phase 2 `DataTable` mobile-card seam. The admin shell navigation is already responsive (hamburger + `Sheet` drawer, 44px touch targets); this phase is about the list and detail **content** views, not the shell.

## Background — what exists

- **Phase 2 `DataTable<T>`** (`src/components/admin/DataTable.tsx`) renders a desktop `<table>` and, when given a `renderMobileCard` prop, shows per-row cards below the `md` breakpoint (hiding the table). It already provides skeleton loading (`loading`, `skeletonRows`) and an `empty` state. Used today by `AnimalsTable` and (Phase 3) `PaymentsReconcile` — these are the model.
- **The in-scope list views render the raw shadcn `<Table>` directly**, with no mobile seam, so they cramp/overflow on phones:
  - `SupporterList` — 5-column table (Supporter, Consent, Lifetime, Last gift, Receipts); rows link to `/admin/supporters/$id`. Uses `var(--color-*)` tokens. No `overflow-x` wrapper.
  - `CaseList` — 5-column table (Applicant, Requested animal, Phone, Created, Status `StatusBadge`) plus a filter bar (`lg:grid-cols-[…]`), page-size selector, pagination footer, export, and skeleton rows; rows link to `/admin/applications/$id`.
  - `AdopterList`, `TaskCenter` — same raw-`<Table>` family; their exact current columns are mapped during implementation.
- **Detail views** (`SupporterDetail`, `CaseDetail`, `AdopterDetail`) use multi-panel layouts that must stack on mobile.
- **`AdminLayout`** is already mobile-responsive (desktop collapsible sidebar; mobile top bar with a `Sheet` drawer nav) — explicitly out of scope.

## Non-goals (YAGNI)

- **`AnimalPipeline`** (1170-line kanban) and **`CoordinatorReports`** (505-line dashboards) — deferred to a later phase; mobile kanban and dense report tables are distinct, harder problems.
- No desktop layout redesign — desktop output is unchanged; we only add the mobile seam + responsive stacking.
- No new shared list primitive — reuse `DataTable`.
- No nav/shell changes; no data, API, or pagination-logic changes.

## Scope (7 views)

| View | Type | Treatment |
|---|---|---|
| CRM `SupporterList` | list | raw `<Table>` → `DataTable` + mobile card |
| CRM `SupporterDetail` | detail | stack panels on mobile; ≥44px touch targets |
| Adoptions `CaseList` | list | → `DataTable` + mobile card (keep filters / pagination / export) |
| Adoptions `CaseDetail` | detail | stack panels |
| Adoptions `AdopterList` | list | → `DataTable` + mobile card |
| Adoptions `AdopterDetail` | detail | stack panels |
| Coordinator `TaskCenter` | list | → `DataTable` (or card list) + mobile card |

## List treatment

- Replace each list's raw `<Table>` row rendering with `<DataTable<T> columns rows getRowKey loading empty renderMobileCard />`.
- **Desktop columns map 1:1** to the current table columns — no intended desktop visual change.
- **`renderMobileCard(row)`** — a compact stacked card: primary identity (tappable `Link` to the row's detail route) + 2–3 key facts + the status pill/badge, following the `PaymentsReconcile` mobile card. Concretely:
  - `SupporterList`: name (→ `/admin/supporters/$id`) + email; lifetime + last-gift amounts; consent summary + receipts flag.
  - `CaseList`: applicant name (→ `/admin/applications/$id`) + email; requested animal + type; phone + created date; `StatusBadge`.
  - `AdopterList` / `TaskCenter`: same recipe applied to each view's existing columns (mapped during implementation).
- **Loading + empty** states come from `DataTable` (`loading`, `empty`). The current **inline error rows move to an error banner** rendered above the table when the query errors (`DataTable` has no error prop — small, deliberate adaptation).
- **Filters, search, page-size, pagination, and export stay exactly as-is** — they live outside the `<Table>` and are untouched.

## Detail treatment

- Side-by-side panel layouts collapse to a **single stacked column below `md`** (`grid-cols-1 md:grid-cols-N`).
- Tables-within-detail (timelines, gift history, etc.) get the same `DataTable` card seam or a horizontal-scroll wrapper.
- Action bars become full-width and tappable. **Nothing is hidden on mobile** — content reflows, it is not removed.

## Cross-cutting polish

- Interactive controls currently `h-9` / `size="sm"` get **≥44px effective touch height on mobile**.
- Verify **no horizontal page overflow at 375px** width on every in-scope view.
- Keep all colours on `var(--color-*)` tokens.

## Architecture

- Each view is an **isolated, independently reviewable change** — no cross-view coupling, no shared state.
- A row→card mapping carrying non-trivial logic goes in a small **pure `*Logic.ts` + unit test** (matching the `*Logic.ts` convention); a trivial mapping stays an inline renderer.
- Reuse `DataTable`, `StatusBadge` / `StatusPill`, and existing tokens — no new primitives.

## Testing & verification

- Keep `bun test` green; introduce no new `tsc` errors (baseline is ~111 pre-existing, almost all `Cannot find module 'bun:test'` noise); lint **changed files only** with `bunx eslint <file>` (the whole-project `eslint .` is pathologically slow on this repo).
- Any extracted card/logic helper gets a unit test.
- Admin is behind login, so headless screenshots are not possible. Verify on a **Vercel preview at mobile widths**: mobile cards appear below `md`, no horizontal overflow at 375px, detail panels stack to one column, touch targets are comfortable — consistent with the Phase 2/3 verification note.

## Out of scope / future

- Mobile treatment for the `AnimalPipeline` kanban and `CoordinatorReports` dashboards.
- Any new responsive list primitive beyond `DataTable`.
