# Phase 5 — Admin Mobile Pass: Pipeline + Reports — Design

**Date:** 2026-06-30
**Branch:** `feat/admin-pipeline-reports-mobile` (fresh branch off `main`; continues the admin UX overhaul — Phases 1–2 PR #12, Phase 3 PR #13, Phase 4 PR #14 all merged)
**Status:** Approved (scope: both deferred views in one phase; export-history table uses `DataTable` + full mobile card)

## Goal

Make the two admin views Phase 4 explicitly deferred genuinely usable at 375px: **`AnimalPipeline`** (`src/components/admin/adoptions/AnimalPipeline.tsx`, mounted at `/admin/coordinator/animals`) and **`CoordinatorReports`** (`src/components/admin/adoptions/CoordinatorReports.tsx`, mounted at `/admin/coordinator/reports`). This completes the admin content-view mobile pass begun in Phase 4.

## Background — what exists

- **Phase 4 shipped the pattern** (PR #14): raw shadcn `<Table>` → `DataTable<T>` + `renderMobileCard`; inline error `<TableRow>` → error banner `<div role="alert">` above the table; desktop output pixel-identical. `DataTable` (`src/components/admin/DataTable.tsx`) renders a desktop `<table>` and, when given `renderMobileCard`, shows per-row cards below `md` (hiding the table). Its API: `columns` (`DataTableColumn<T>` = `{ id, header, cell, className? }`), `rows`, `getRowKey`, `loading`, `skeletonRows`, `empty`, `renderMobileCard`, `className`. Cells and cards are arbitrary `ReactNode`, so interactive controls are allowed.
- **Phase 4's deferral note** (in `2026-06-30-admin-mobile-responsive-pass-design.md`, "Out of scope / future"): *"Mobile treatment for the `AnimalPipeline` kanban and `CoordinatorReports` dashboards."* The "kanban" framing was loose — `AnimalPipeline` is **grouped `<Table>`s**, not a drag-and-drop board. There is no kanban, no drag, no new layout problem; it reduces to the Phase 4 migration.
- **The new wrinkle vs Phase 4:** both these tables have **interactive cell controls** (Phase 4's were read-only links). Their mobile cards must preserve those controls. This is mechanical (cards are JSX) but is called out so it is not dropped.

### `AnimalPipeline` current structure

- Renders **one `<section>` per lifecycle group** (`groups.map(...)`); each group has a header (`group.label` + `{group.rows.length} animals`) and a raw `<Table>`.
- Group-level loading = 2 skeleton group `<section>`s; group-level empty = "No animals match these filters." Both sit **outside** the tables.
- Per-table columns (6): **Animal** (image/placeholder + `name` + `name_en`/`type`/`age`), **Lifecycle** (status `Badge` + an inline status-change `<Select>` wired to `lifecycleMutation`), **Flags** (4 badges: adoptable, support pool, chip Y/N/-, desex Y/N/-), **Position** (`currentPosition?.name` + `Cage {profile.cage}`), **Arrival** (`formatDate(profile.arrival_date)` + `arrivalSource?.name_zh` + optional `internal_code`), **Profile** (an **Edit** `Button` that calls `openProfileDialog(row)`).
- A profile-edit `<Dialog>` (`DialogContent` = `max-h-[86vh] max-w-4xl overflow-y-auto`) holds a multi-section form. The form's section grids are already `md:`/`sm:`-prefixed (e.g. `md:grid-cols-3`, `md:grid-cols-2`, `md:grid-cols-[minmax(0,1fr)_160px]`, `sm:grid-cols-2`), so they collapse to one column below the breakpoint.

### `CoordinatorReports` current structure

- **Metric tiles:** `<section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">` of `MetricTile`s → 1 column below `sm`.
- **Filter bar:** `grid ... lg:grid-cols-[160px_220px_minmax(260px,1fr)_auto]` → stacks below `lg`.
- **Export-history `<Table>`** inside a `<section>` with a header bar (record count + page-size `<Select>`); columns (7): **Timestamp** (`formatTimestamp`), **Actor** (`actorLabel`, truncated), **Kind** (`Badge`), **Rows** (right-aligned `formatCount(rowCount)`), **Filters** (`formatReportFiltersPreview`, truncated free text), **Source route** (`SourceRouteCell`), **Action** (a **Download again** `Button` wired to `downloadAgain`). In-table states: 5 skeleton rows while loading; "No exports match these filters." empty row; pagination lives in/around the section, outside the table.

## What changes

### View 1 — `AnimalPipeline`

1. **Per-group table → `DataTable<AnimalRow>`.** Replace each group's raw `<Table>` with a `<DataTable>` rendered inside that group's `<section>` (group header + count unchanged). Derive `AnimalRow` from the existing row type already used in the file (do not add new named imports that may not be exported — derive from the loaded data type, matching the Phase 4 AdopterDetail approach). The desktop `columns` map the existing 6 cells 1:1.
2. **`renderMobileCard` preserves all six cells, including interactivity:** identity (image + name + en/type/age), the Lifecycle status `Badge` **and** the inline status-change `<Select>` (must stay operable), the 4 Flags badges, Position (location + cage), Arrival (date + source + code), and the **Edit** button. Colours via `var(--color-*)` tokens only.
3. **Group-level states unchanged.** The 2-section loading skeleton and the "No animals match these filters." empty state stay at the group level (outside `DataTable`). Within a group there is always ≥1 row, so `DataTable`'s own `empty` does not trigger; `loading`/`skeletonRows` are not used per-group (the group skeleton already covers load). The query-error `<section role="alert">` already renders above the groups and is unchanged.
4. **Profile-edit `<Dialog>` mobile fit + touch targets.** The form already stacks (grids are `md:`/`sm:`-prefixed). Work is limited to: (a) confirm `DialogContent` fits 375px with no horizontal overflow (cap effective width, keep horizontal padding); (b) raise sub-44px touch targets on mobile — the `size="sm"` action buttons and `h-8` `<Select>` triggers inside the dialog — using the Phase 4 idiom (`min-h-[44px] sm:min-h-0` or `h-11` on inputs). **No** form restructuring, **no** field changes.

### View 2 — `CoordinatorReports`

1. **Metric tiles & filter bar — verify only.** Both already collapse below their breakpoints (like Phase 4 stat grids). Confirm at 375px; no change expected.
2. **Export-history `<Table>` → `DataTable<ExportRow>` + full mobile card.** Replace the raw `<Table>` (and its inline skeleton/empty rows) with `<DataTable>`: use `loading`/`skeletonRows` for the load state and `empty="No exports match these filters."`. The mobile card shows **all** fields (decision: nothing hidden) — timestamp, actor, kind badge, row count, filters preview, source route, and the interactive **Download again** button. Derive `ExportRow` from the existing export row type. The section header (record count + page-size `<Select>`) and pagination stay put.
3. **Inline error → banner.** Any in-table error row moves to an error banner `<div role="alert">` above the `DataTable`, per Phase 4.

## Error / empty / loading handling

Mirror Phase 4 exactly, per view:
- States that sit **inside** the table (skeleton rows, empty row) move into `DataTable` (`loading`/`skeletonRows`/`empty`) — applies to the CoordinatorReports export table.
- Inline error rows become an error banner `<div role="alert">` above the table.
- States that already sit **outside** the table stay as-is — applies to AnimalPipeline's group-level skeleton, empty, and query-error sections.

## Testing & verification

These are purely presentational changes — no new pure helpers are extracted, so no failing-test-first step is required (consistent with Phase 4). `coordinatorReportsLogic.ts`, `animalPipelineLogic.ts`, and their tests are untouched.

- **Tests:** `bun test 2>&1 | tail -3` — must stay green (~317 tests).
- **Type check:** `bunx tsc --noEmit 2>&1 | grep -E "AnimalPipeline|CoordinatorReports"` — zero new errors in touched files (baseline has ~111 pre-existing errors elsewhere, mostly `Cannot find module 'bun:test'`).
- **Lint:** `bunx eslint --fix <file> && bunx eslint <file>` on changed files only. **Never** `bun run lint` / `eslint .` — it hangs 10min+ on this repo.
- **Preview (admin is behind login — no headless screenshots):** Vercel preview at 375px — mobile cards appear below `md`, no horizontal overflow, and the interactive controls work on the card surface: the AnimalPipeline status `<Select>` and **Edit**, the CoordinatorReports **Download again**; the profile-edit dialog fits and its controls are comfortably tappable.

## Out of scope / future

- No data, query, mutation, pagination, filter, or grouping logic changes — presentation only.
- No new responsive primitive beyond `DataTable` (consistent with Phase 4).
- No desktop redesign — desktop output stays pixel-identical.
- No changes to `coordinatorReportsLogic.ts` / `animalPipelineLogic.ts` or their test files.
- The admin shell, and all Phase 4 list/detail views, are already done — not revisited.
