# Admin Mobile Pass — Pipeline + Reports (Phase 5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the two admin views Phase 4 deferred usable at 375px — migrate `AnimalPipeline`'s grouped `<Table>`s and `CoordinatorReports`'s export-history `<Table>` to `DataTable` + `renderMobileCard` (preserving their inline interactive controls), and bump the profile-edit dialog's date inputs to a comfortable mobile height.

**Architecture:** Phase 4 redux — the exact pattern already shipped in PR #14. Each raw `<Table>` becomes a `DataTable<T>` with a `renderMobileCard` that stacks the row's fields and **keeps every interactive control** (status `<Select>`, Edit button, Download-again button). Desktop output stays pixel-identical (columns map 1:1). No new primitive, no data/query/grouping/pagination changes. `aria-busy` moves from the `<Table>` to its wrapping `<section>`.

**Tech Stack:** TanStack Start (React 19), TanStack Query, Tailwind v4 + shadcn/ui, Bun.

**Spec:** `docs/superpowers/specs/2026-06-30-admin-mobile-phase-5-design.md`
**Branch:** `feat/admin-pipeline-reports-mobile` (already created off `origin/main`).

---

## Conventions for every task

- **Type check:** `bunx tsc --noEmit 2>&1 | grep <ComponentName>` — baseline has ~111 pre-existing errors (mostly `Cannot find module 'bun:test'`). Only errors in files you touched count. Zero new errors is the gate.
- **Lint:** `bunx eslint --fix <file> && bunx eslint <file>`. **Never** run `bun run lint` / `eslint .` — they hang 10+ minutes on this repo.
- **Tests:** `bun test 2>&1 | tail -3` — must stay green (~317 tests).
- **Commit format:** Conventional Commits. Trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Colours:** always `var(--color-*)` tokens — never hardcoded hex or Tailwind colour utilities.
- **TDD note:** Every task is a purely presentational change. `coordinatorReportsLogic.ts` / `animalPipelineLogic.ts` and their tests are untouched, no new pure helper is extracted, so no failing-test-first step is required. Keep `bun test` green regardless. (Same stance as Phase 4.)
- **`DataTable` API** (`src/components/admin/DataTable.tsx`): `columns: DataTableColumn<T>[]` where `DataTableColumn<T> = { id: string; header: ReactNode; cell: (row: T) => ReactNode; className?: string }`; plus `rows`, `getRowKey`, `loading?`, `skeletonRows?`, `empty?`, `renderMobileCard?`, `className?`. `renderMobileCard` returns the card's **inner** content — `DataTable` supplies the `rounded-xl border ... p-3` wrapper. Mobile cards show below `md`; the desktop table is `hidden md:block`.

---

## Task 1 — AnimalPipeline: migrate grouped `<Table>`s → `DataTable` + mobile card

**Files:**
- Modify: `src/components/admin/adoptions/AnimalPipeline.tsx`

The view renders one `<section>` per group (`groups.map`), each with a header and a raw `<Table>` (lines ~718–865). Columns: Animal / Lifecycle (status badge + inline status `<Select>`) / Flags (4 badges) / Position / Arrival / Profile (Edit button). The row type `AnimalPipelineRow` is already imported from `./animalPipelineLogic`. In-file helpers `formatFallback`, `formatDate`, `statusLabel`, `STATUS_BADGE_CLASSES`, `STATUS_ACTIONS`, and the component-scope `lifecycleMutation`, `isFetching`, `openProfileDialog` are all reused.

### Steps

- [ ] **Step 1: Swap the table import for the DataTable import.**

Remove this line (line 23):
```tsx
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
```
Add (next to the other `../` admin imports, e.g. directly above `import { fetchCoordinatorJson } from "./api";`):
```tsx
import { DataTable, type DataTableColumn } from "../DataTable";
```

- [ ] **Step 2: Define `animalColumns` and `renderAnimalCard` inside the component, immediately before the `return` statement** (after `const groups = useMemo(...)` / `const selectedRow = ...`, so they close over `lifecycleMutation` and `openProfileDialog`):

```tsx
  const animalColumns: DataTableColumn<AnimalPipelineRow>[] = [
    {
      id: "animal",
      header: "Animal",
      className: "w-[28%] px-4",
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-3">
          {row.image_url ? (
            <img
              src={row.image_url}
              alt=""
              className="h-10 w-10 shrink-0 rounded-md object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] text-xs font-semibold uppercase text-[var(--color-text-muted)]">
              {row.type.slice(0, 3)}
            </div>
          )}
          <div className="min-w-0">
            <div className="truncate font-semibold text-[var(--color-panel)]">{row.name}</div>
            <div className="truncate text-xs text-[var(--color-text-muted)]">
              {formatFallback(row.name_en)} / {row.type} / {row.age}
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "lifecycle",
      header: "Lifecycle",
      className: "w-44",
      cell: (row) => {
        const isUpdatingStatus =
          lifecycleMutation.isPending && lifecycleMutation.variables?.animalId === row.id;
        return (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={STATUS_BADGE_CLASSES[row.status]}>
              {statusLabel(row.status)}
            </Badge>
            <Select
              value={row.status}
              disabled={isUpdatingStatus}
              onValueChange={(value) =>
                lifecycleMutation.mutate({ animalId: row.id, status: value as AnimalStatus })
              }
            >
              <SelectTrigger aria-label={`Update ${row.name} lifecycle`} className="h-8 w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_ACTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      },
    },
    {
      id: "flags",
      header: "Flags",
      cell: (row) => (
        <div className="flex min-h-8 flex-wrap items-center gap-1.5">
          <Badge
            variant="outline"
            className="border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-panel)]"
          >
            {row.profile.is_adoptable ? "Adoptable" : "Not adoptable"}
          </Badge>
          {row.profile.is_inside_support_pool && (
            <Badge
              variant="outline"
              className="border-[var(--color-accent-warm)] bg-[var(--color-surface-2)] text-[var(--color-panel)]"
            >
              Support pool
            </Badge>
          )}
          <Badge
            variant="outline"
            className="border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-muted)]"
          >
            Chip {row.profile.has_chip === null ? "-" : row.profile.has_chip ? "Y" : "N"}
          </Badge>
          <Badge
            variant="outline"
            className="border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-muted)]"
          >
            Desex {row.profile.is_desexed === null ? "-" : row.profile.is_desexed ? "Y" : "N"}
          </Badge>
        </div>
      ),
    },
    {
      id: "position",
      header: "Position",
      cell: (row) => (
        <div className="text-sm text-[var(--color-panel)]">
          <div>{formatFallback(row.currentPosition?.name)}</div>
          <div className="text-xs text-[var(--color-text-muted)]">
            Cage {formatFallback(row.profile.cage)}
          </div>
        </div>
      ),
    },
    {
      id: "arrival",
      header: "Arrival",
      cell: (row) => (
        <div className="text-sm text-[var(--color-panel)]">
          <div>{formatDate(row.profile.arrival_date)}</div>
          <div className="text-xs text-[var(--color-text-muted)]">
            {formatFallback(row.arrivalSource?.name_zh)}
            {row.profile.internal_code ? ` / ${row.profile.internal_code}` : ""}
          </div>
        </div>
      ),
    },
    {
      id: "profile",
      header: "Profile",
      className: "w-32 text-right",
      cell: (row) => (
        <div className="flex justify-end">
          <Button type="button" size="sm" variant="outline" onClick={() => openProfileDialog(row)}>
            <Edit3 className="h-4 w-4" />
            Edit
          </Button>
        </div>
      ),
    },
  ];

  function renderAnimalCard(row: AnimalPipelineRow) {
    const isUpdatingStatus =
      lifecycleMutation.isPending && lifecycleMutation.variables?.animalId === row.id;
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          {row.image_url ? (
            <img
              src={row.image_url}
              alt=""
              className="h-12 w-12 shrink-0 rounded-md object-cover"
            />
          ) : (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] text-xs font-semibold uppercase text-[var(--color-text-muted)]">
              {row.type.slice(0, 3)}
            </div>
          )}
          <div className="min-w-0">
            <div className="font-semibold text-[var(--color-panel)]">{row.name}</div>
            <div className="text-xs text-[var(--color-text-muted)]">
              {formatFallback(row.name_en)} / {row.type} / {row.age}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={STATUS_BADGE_CLASSES[row.status]}>
            {statusLabel(row.status)}
          </Badge>
          <Select
            value={row.status}
            disabled={isUpdatingStatus}
            onValueChange={(value) =>
              lifecycleMutation.mutate({ animalId: row.id, status: value as AnimalStatus })
            }
          >
            <SelectTrigger aria-label={`Update ${row.name} lifecycle`} className="h-10 w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_ACTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge
            variant="outline"
            className="border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-panel)]"
          >
            {row.profile.is_adoptable ? "Adoptable" : "Not adoptable"}
          </Badge>
          {row.profile.is_inside_support_pool && (
            <Badge
              variant="outline"
              className="border-[var(--color-accent-warm)] bg-[var(--color-surface-2)] text-[var(--color-panel)]"
            >
              Support pool
            </Badge>
          )}
          <Badge
            variant="outline"
            className="border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-muted)]"
          >
            Chip {row.profile.has_chip === null ? "-" : row.profile.has_chip ? "Y" : "N"}
          </Badge>
          <Badge
            variant="outline"
            className="border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-muted)]"
          >
            Desex {row.profile.is_desexed === null ? "-" : row.profile.is_desexed ? "Y" : "N"}
          </Badge>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-xs text-[var(--color-text-muted)]">Position</div>
            <div className="text-[var(--color-panel)]">
              {formatFallback(row.currentPosition?.name)}
            </div>
            <div className="text-xs text-[var(--color-text-muted)]">
              Cage {formatFallback(row.profile.cage)}
            </div>
          </div>
          <div>
            <div className="text-xs text-[var(--color-text-muted)]">Arrival</div>
            <div className="text-[var(--color-panel)]">{formatDate(row.profile.arrival_date)}</div>
            <div className="text-xs text-[var(--color-text-muted)]">
              {formatFallback(row.arrivalSource?.name_zh)}
              {row.profile.internal_code ? ` / ${row.profile.internal_code}` : ""}
            </div>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={() => openProfileDialog(row)}
          className="min-h-[44px] w-full"
        >
          <Edit3 className="h-4 w-4" />
          Edit profile
        </Button>
      </div>
    );
  }
```

- [ ] **Step 3: Replace each group's `<Table>…</Table>` with `<DataTable>` and move `aria-busy` onto the group `<section>`.** In the `groups.map((group) => ( … ))` block, the group `<section>` currently opens as:
```tsx
            <section
              key={group.key}
              className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]"
            >
```
Change it to add `aria-busy`:
```tsx
            <section
              key={group.key}
              aria-busy={isFetching}
              className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]"
            >
```
Then delete the entire `<Table aria-busy={isFetching}> … </Table>` block (the `<TableHeader>` with the 6 `<TableHead>`s and the `<TableBody>` with the `group.rows.map` row rendering) and replace it with:
```tsx
              <DataTable<AnimalPipelineRow>
                columns={animalColumns}
                rows={group.rows}
                getRowKey={(row) => row.id}
                renderMobileCard={renderAnimalCard}
              />
```
Leave the group header `<div>` (label + `{group.rows.length} animals`) above it untouched. Do **not** pass `loading`/`empty` — the group-level skeleton (the 2 `animalsQuery.isLoading` sections) and the group-level empty state ("No animals match these filters.") already live outside the tables and stay as-is; each rendered group always has ≥1 row.

- [ ] **Step 4: Verify.**
```bash
bunx eslint --fix src/components/admin/adoptions/AnimalPipeline.tsx
bunx eslint src/components/admin/adoptions/AnimalPipeline.tsx
bunx tsc --noEmit 2>&1 | grep AnimalPipeline
bun test 2>&1 | tail -3
```
Expected: eslint clean; `grep AnimalPipeline` prints nothing (zero new type errors); tests green. If `tsc` flags a field name (e.g. `row.age`, `row.name_en`, `row.profile.cage`), fix it to match the real `AnimalPipelineRow` / `AnimalInternalProfile` field — these names were lifted verbatim from the current `<Table>` cells, so they should already match.

- [ ] **Step 5: Commit.**
```bash
git add src/components/admin/adoptions/AnimalPipeline.tsx
git commit -m "$(cat <<'EOF'
feat(admin): migrate AnimalPipeline groups to DataTable + mobile card

Replaces each lifecycle group's raw <Table> with DataTable<AnimalPipelineRow>.
Adds renderMobileCard preserving every interactive control: the inline
status-change Select (comfortable h-10 on mobile) and the Edit button
(full-width, min-h-44). Flags, position, and arrival facts stack on the
card. Group skeleton/empty states and aria-busy unchanged (aria-busy moved
to the group section). Desktop columns map 1:1.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2 — AnimalPipeline: profile-edit dialog date-input touch targets

**Files:**
- Modify: `src/components/admin/adoptions/AnimalPipeline.tsx`

The profile-edit `<Dialog>` (`DialogContent` = `max-h-[86vh] max-w-4xl overflow-y-auto`) already fits 375px: shadcn `DialogContent` is `w-full max-w-lg` (capped to the viewport — `max-w-4xl` only widens it on desktop), and every form section grid is `md:`/`sm:`-prefixed so it collapses to one column on mobile. The only sub-comfortable touch targets are the four `type="date"` inputs (shadcn `Input` is `h-9` = 36px). Bump them to `h-11` (44px) — the same idiom Phase 4 used for `datetime-local` inputs. The dialog's default-size buttons and selects are left at the admin-wide `h-9` baseline (Phase 4 only bumped `h-8`/sm controls and date-time inputs; matching that policy keeps the change consistent).

### Steps

- [ ] **Step 1: Add `className="h-11"` to each of the four date inputs.** They are identical except for `id`/field. For each, add the `className` line directly under `type="date"`:

`arrival-date`:
```tsx
                    <Input
                      id="arrival-date"
                      type="date"
                      className="h-11"
                      value={profileForm.arrival_date ?? ""}
                      onChange={(event) => updateProfileField("arrival_date", event.target.value)}
                    />
```
`desexed-at`:
```tsx
                        <Input
                          id="desexed-at"
                          type="date"
                          className="h-11"
                          value={profileForm.desexed_at ?? ""}
                          onChange={(event) => updateProfileField("desexed_at", event.target.value)}
                        />
```
`adopted-at`:
```tsx
                    <Input
                      id="adopted-at"
                      type="date"
                      className="h-11"
                      value={profileForm.adopted_at ?? ""}
                      onChange={(event) => updateProfileField("adopted_at", event.target.value)}
                    />
```
`deceased-at`:
```tsx
                    <Input
                      id="deceased-at"
                      type="date"
                      className="h-11"
                      value={profileForm.deceased_at ?? ""}
                      onChange={(event) => updateProfileField("deceased_at", event.target.value)}
                    />
```

- [ ] **Step 2: Confirm all four were updated.**
```bash
grep -c 'type="date"' src/components/admin/adoptions/AnimalPipeline.tsx   # expect 4
grep -c 'className="h-11"' src/components/admin/adoptions/AnimalPipeline.tsx # expect 4
```

- [ ] **Step 3: Verify.**
```bash
bunx eslint --fix src/components/admin/adoptions/AnimalPipeline.tsx
bunx eslint src/components/admin/adoptions/AnimalPipeline.tsx
bunx tsc --noEmit 2>&1 | grep AnimalPipeline
bun test 2>&1 | tail -3
```
Expected: clean, no new type errors, tests green.

- [ ] **Step 4: Commit.**
```bash
git add src/components/admin/adoptions/AnimalPipeline.tsx
git commit -m "$(cat <<'EOF'
feat(admin): AnimalPipeline profile dialog date-input touch targets

Bumps the four type="date" inputs in the internal-profile dialog to
h-11 (44px) for comfortable mobile tapping. Dialog already stacks and
fits 375px (shadcn DialogContent is w-full max-w-lg; form grids are
md:/sm:-prefixed); no layout change.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3 — CoordinatorReports: migrate export-history `<Table>` → `DataTable` + full mobile card

**Files:**
- Modify: `src/components/admin/adoptions/CoordinatorReports.tsx`

The export-history `<Table>` (lines ~381–475) has 7 columns: Timestamp / Actor / Kind (badge) / Rows (right-aligned) / Filters (free-text preview) / Source route (`SourceRouteCell`) / Action (Download-again button). Row type `CoordinatorExportAuditRow` is already imported. Helpers `formatTimestamp`, `actorLabel`, `KIND_LABELS`, `formatCount`, `formatReportFiltersPreview`, and the `SourceRouteCell` component are in-file; `downloadAgain`/`downloadingId` are component scope. The history error is **already** shown via `InlineAlert` at the top of the component (lines ~253–261), so no new error banner is added. The section header (record count + page-size `<Select>`) and the pagination footer (`Page x of y` + Previous/Next) stay untouched.

### Steps

- [ ] **Step 1: Swap the table import for the DataTable import.** Remove (line 16):
```tsx
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
```
Add (next to the other `../` imports, e.g. directly above `import { fetchCoordinatorJson } from "./api";`):
```tsx
import { DataTable, type DataTableColumn } from "../DataTable";
```

- [ ] **Step 2: Define `exportColumns` and `renderExportCard` inside the component, immediately before the `return` statement** (they close over `downloadAgain`/`downloadingId`):

```tsx
  const exportColumns: DataTableColumn<CoordinatorExportAuditRow>[] = [
    {
      id: "timestamp",
      header: "Timestamp",
      className: "min-w-44 px-4 font-medium text-[var(--color-panel)]",
      cell: (row) => formatTimestamp(row.timestamp),
    },
    {
      id: "actor",
      header: "Actor",
      className: "min-w-48 text-sm text-[var(--color-panel)]",
      cell: (row) => <span className="block max-w-48 truncate">{actorLabel(row)}</span>,
    },
    {
      id: "kind",
      header: "Kind",
      className: "min-w-40",
      cell: (row) => (
        <Badge
          variant="outline"
          className="border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-panel)]"
        >
          {KIND_LABELS[row.kind]}
        </Badge>
      ),
    },
    {
      id: "rows",
      header: "Rows",
      className: "w-28 text-right font-semibold text-[var(--color-panel)]",
      cell: (row) => formatCount(row.rowCount),
    },
    {
      id: "filters",
      header: "Filters",
      className: "min-w-72 text-xs text-[var(--color-text-muted)]",
      cell: (row) => (
        <span className="block max-w-72 truncate">{formatReportFiltersPreview(row.filters)}</span>
      ),
    },
    {
      id: "sourceRoute",
      header: "Source route",
      className: "min-w-72",
      cell: (row) => <SourceRouteCell value={row.sourceRoute} />,
    },
    {
      id: "action",
      header: "Action",
      className: "w-40",
      cell: (row) => (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void downloadAgain(row)}
          disabled={downloadingId === row.id}
        >
          <Download className="h-4 w-4" />
          {downloadingId === row.id ? "Downloading..." : "Download again"}
        </Button>
      ),
    },
  ];

  function renderExportCard(row: CoordinatorExportAuditRow) {
    return (
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-medium text-[var(--color-panel)]">
              {formatTimestamp(row.timestamp)}
            </div>
            <div className="truncate text-xs text-[var(--color-text-muted)]">{actorLabel(row)}</div>
          </div>
          <Badge
            variant="outline"
            className="shrink-0 border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-panel)]"
          >
            {KIND_LABELS[row.kind]}
          </Badge>
        </div>

        <div className="text-xs text-[var(--color-text-muted)]">
          Rows:{" "}
          <span className="font-semibold text-[var(--color-panel)]">{formatCount(row.rowCount)}</span>
        </div>

        <div className="text-xs text-[var(--color-text-muted)]">
          <div className="mb-1">Filters</div>
          <div className="text-[var(--color-panel)]">{formatReportFiltersPreview(row.filters)}</div>
        </div>

        <div className="text-xs text-[var(--color-text-muted)]">
          <div className="mb-1">Source route</div>
          <SourceRouteCell value={row.sourceRoute} />
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={() => void downloadAgain(row)}
          disabled={downloadingId === row.id}
          className="min-h-[44px] w-full"
        >
          <Download className="h-4 w-4" />
          {downloadingId === row.id ? "Downloading..." : "Download again"}
        </Button>
      </div>
    );
  }
```
Note: the mobile card drops the `max-w-72`/`max-w-48` truncation so **all** fields are fully visible (the design's "nothing hidden" decision); the desktop columns keep the truncation for the dense table.

- [ ] **Step 3: Replace the `<Table>…</Table>` block** (from `<Table aria-busy={…}>` through its closing `</Table>`, including the loading-skeleton rows, the empty `<TableRow>`, and the `exports.map` body) with:
```tsx
        <DataTable<CoordinatorExportAuditRow>
          columns={exportColumns}
          rows={exports}
          getRowKey={(row) => row.id}
          loading={historyQuery.isLoading}
          skeletonRows={5}
          empty={historyQuery.error ? null : "No exports match these filters."}
          renderMobileCard={renderExportCard}
        />
```
Keep the wrapping `<section className="overflow-hidden rounded-lg border …">` and its header `<div>` (title + record count + page-size `<Select>`) untouched. The `empty={historyQuery.error ? null : …}` preserves today's behavior: when the history query errors, the `InlineAlert` above is the message and the table shows no "no results" text.

- [ ] **Step 4: Verify.**
```bash
bunx eslint --fix src/components/admin/adoptions/CoordinatorReports.tsx
bunx eslint src/components/admin/adoptions/CoordinatorReports.tsx
bunx tsc --noEmit 2>&1 | grep CoordinatorReports
bun test 2>&1 | tail -3
```
Expected: clean; `grep CoordinatorReports` prints nothing; tests green. If `tsc` flags `row.rowCount` / `row.sourceRoute` / `row.filters` / `row.kind` / `row.timestamp`, fix to the real `CoordinatorExportAuditRow` field (names lifted verbatim from the current cells — should already match).

- [ ] **Step 5: Commit.**
```bash
git add src/components/admin/adoptions/CoordinatorReports.tsx
git commit -m "$(cat <<'EOF'
feat(admin): migrate CoordinatorReports export history to DataTable + card

Replaces the dense 7-column export-history <Table> with
DataTable<CoordinatorExportAuditRow>. Full mobile card shows every field
(timestamp, actor, kind, rows, filters, source route) untruncated and
keeps the Download-again button (full-width, min-h-44). Loading/empty
move into DataTable; the existing top-of-page InlineAlert still owns the
error state (empty suppressed on error). Pagination and page-size
unchanged.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4 — Final verification gate

**Files:** both modified components + Vercel preview.

### Steps

- [ ] **Step 1: Full test suite.**
```bash
bun test 2>&1 | tail -10
```
Expected: all passing, zero new failures.

- [ ] **Step 2: Type-check across touched files.**
```bash
bunx tsc --noEmit 2>&1 | grep -E "AnimalPipeline|CoordinatorReports"
```
Expected: empty (zero new errors; pre-existing baseline elsewhere is ignored).

- [ ] **Step 3: Lint both files in one pass.**
```bash
bunx eslint --fix \
  src/components/admin/adoptions/AnimalPipeline.tsx \
  src/components/admin/adoptions/CoordinatorReports.tsx
bunx eslint \
  src/components/admin/adoptions/AnimalPipeline.tsx \
  src/components/admin/adoptions/CoordinatorReports.tsx
```
Expected: zero errors.

- [ ] **Step 4: Spec cross-check.**

  | Spec requirement | Task |
  |---|---|
  | AnimalPipeline grouped tables → DataTable + mobile card | Task 1 |
  | Mobile card preserves inline status `<Select>` + Edit | Task 1 |
  | AnimalPipeline dialog fits 375px + comfortable touch targets | Task 2 (date inputs → h-11; dialog already stacks/fits) |
  | CoordinatorReports metric tiles / filter bar stack | Verified — already `sm:`/`lg:`-prefixed, no change |
  | CoordinatorReports export table → DataTable + full mobile card (nothing hidden) | Task 3 |
  | Error stays a banner above the table | Task 3 — existing top-of-page `InlineAlert` retained |
  | Pagination / page-size / filters / grouping untouched | Tasks 1 & 3 |
  | Desktop output pixel-identical | Tasks 1 & 3 (columns map 1:1) |
  | No new primitive; logic files untouched | All tasks |
  | Colours via `var(--color-*)` | All card/column JSX |
  | `bun test` green; no new `tsc` errors | Every task + this gate |

- [ ] **Step 5: Vercel preview deploy** (admin is behind login — no headless screenshots):
```bash
vc deploy --scope ynwaforevers-projects
```
On the preview, log in as admin and check at 375px browser width:
- **`/admin/coordinator/animals`** — each lifecycle group shows mobile cards below `md`, no horizontal overflow; the status `<Select>` changes a row's lifecycle; **Edit profile** opens the dialog; the dialog fits with no horizontal scroll and the date inputs are comfortably tappable.
- **`/admin/coordinator/reports`** — metric tiles are 1 column; the export-history list shows full cards (filters + source route fully visible); **Download again** works; pagination/page-size still function.
- Desktop (≥`md`) is unchanged for both.

- [ ] **Step 6 (optional): polish-fix commit** if the preview surfaced anything:
```bash
git commit -am "$(cat <<'EOF'
fix(admin): phase 5 mobile pass — gate fixes

<describe any specific fixes>

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7: Open the PR.**
```bash
git push -u origin feat/admin-pipeline-reports-mobile
gh pr create --title "feat(admin): Phase 5 — pipeline + reports mobile pass" \
  --body "Completes the admin mobile content-view pass: migrates AnimalPipeline grouped tables and the CoordinatorReports export-history table to DataTable + mobile cards (preserving inline status Select, Edit, and Download-again controls) and bumps the profile-dialog date inputs to 44px. Same Phase 4 pattern, no new primitive. Spec + plan in docs/superpowers/. Verified on Vercel preview at 375px."
```

---

## Self-review notes

- **Spec coverage:** every spec requirement maps to a task (table above). The two "verify only" items (CoordinatorReports metric tiles + filter bar) are confirmed already-responsive and need no code — called out so they aren't mistaken for gaps.
- **Type consistency:** `AnimalPipelineRow` (Task 1) and `CoordinatorExportAuditRow` (Task 3) are the already-exported/imported row types — no new types introduced. Field names in columns/cards are lifted verbatim from the current `<Table>` cells.
- **Touch-target policy:** matches what Phase 4 actually shipped against this repo's primitives (Button `default:h-9`, `sm:h-8`; Input/Select `h-9`): bump `sm`/`h-8`/date controls toward 44px on the new card surfaces and dialog; leave `h-9` defaults (the admin-wide baseline) alone.
- **No placeholders:** every code step shows complete JSX; no "similar to above" references.
