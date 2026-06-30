# Admin Mobile Responsiveness Pass (Phase 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the core daily-use admin list and detail views genuinely usable on phones (375px+) by migrating five raw-`<Table>` list views to `DataTable` with `renderMobileCard`, and making three detail views stack to a single column below `md`. The admin shell navigation (hamburger, Sheet drawer) is already responsive and is out of scope.

**Architecture:** Each view is an independently reviewable change — no cross-view coupling. Mobile cards are inline renderers (no extracted helper needed for any of these mappings, as all field access is direct and non-computed). `DataTable` already provides skeleton loading and empty-state; inline error `<TableRow>` cells in the existing tables move to error banner `<div>` elements rendered above `<DataTable>`. Desktop output is pixel-identical — `DataTable` maps columns 1:1. Filters, pagination, search, and export wiring are untouched throughout.

**Tech Stack:** TanStack Start (React 19), TanStack Query, Tailwind v4 + shadcn/ui, Bun.

**Spec:** docs/superpowers/specs/2026-06-30-admin-mobile-responsive-pass-design.md

---

## Conventions for every task

- **Type check:** `bunx tsc --noEmit 2>&1 | grep <ComponentName>` — the baseline has ~111 pre-existing errors (almost all `Cannot find module 'bun:test'`). Only errors in files you touched count. Zero new errors is the gate.
- **Lint:** `bunx eslint --fix <file> && bunx eslint <file>`. Never run `bun run lint` or `eslint .` — these hang 10+ minutes on this repo.
- **Tests:** `bun test 2>&1 | tail -3` — must stay green.
- **Commit format:** Conventional Commits, e.g. `feat(admin): migrate SupporterList to DataTable + mobile card`. Add trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Colours:** Always `var(--color-*)` tokens — never hardcoded hex or Tailwind colour utilities for brand colours.
- **TDD note:** All seven views are purely presentational changes (data fetching, pagination logic, and query keys are untouched). No non-trivial pure helpers are extracted. Therefore, no failing-test-first step is required for any task — this is explicitly stated per-task below. Keep `bun test` green regardless.

---

## Task 1 — SupporterList: migrate raw `<Table>` → `DataTable` + mobile card

**Files:**
- `src/components/admin/crm/SupporterList.tsx`

### Steps

- [ ] **Read the file** end-to-end (already done in planning — confirms 5-column raw `<Table>`, inline loading and error rows, no pagination, no `overflow-x` wrapper).

- [ ] **Remove** imports: `Table, TableBody, TableCell, TableHead, TableHeader, TableRow` from `../../ui/table`.

- [ ] **Add** imports:
  ```tsx
  import { DataTable, type DataTableColumn } from "../DataTable";
  ```

- [ ] **Add** the `formatHkd` helper (already present inline in the file at line 18 — do not duplicate; it is used in both `columns` and `renderMobileCard`).

- [ ] **Replace** the `<Table>…</Table>` *inside* the existing `<div className="overflow-hidden rounded-lg border ... bg-[var(--color-surface)]">` wrapper with the `<DataTable>` — **keep that bordered wrapper** so the desktop card container is unchanged — and add an error banner ABOVE the wrapper. Net result:

  ```tsx
  {error && (
    <div
      role="alert"
      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm text-[var(--color-error)]"
    >
      Could not load supporters
    </div>
  )}

  <div className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
    <DataTable<SupporterSummary>
      columns={supporterColumns}
      rows={data?.supporters ?? []}
      getRowKey={(s) => s.id}
      loading={isLoading}
      skeletonRows={5}
      empty="No supporters found"
      renderMobileCard={renderSupporterCard}
    />
  </div>
  ```

- [ ] **Define** `supporterColumns` and `renderSupporterCard` immediately before the `return` statement (after the `search` memo). Use the exact field names from `SupporterSummary`:

  ```tsx
  const supporterColumns: DataTableColumn<SupporterSummary>[] = [
    {
      id: "supporter",
      header: "Supporter",
      cell: (s) => (
        <div>
          <Link
            to="/admin/supporters/$id"
            params={{ id: s.id }}
            className="font-semibold text-[var(--color-primary)] hover:underline"
          >
            {s.name}
          </Link>
          <div className="text-xs text-[var(--color-text-muted)]">{s.email}</div>
        </div>
      ),
    },
    {
      id: "consent",
      header: "Consent",
      cell: (s) => (
        <span className="text-xs">
          Email {s.emailConsent ?? "-"} / WhatsApp {s.whatsappConsent ?? "-"}
        </span>
      ),
    },
    {
      id: "lifetime",
      header: "Lifetime",
      cell: (s) => formatHkd(s.lifetimeAmountCents),
    },
    {
      id: "lastGift",
      header: "Last gift",
      cell: (s) => formatHkd(s.lastGiftAmountCents),
    },
    {
      id: "receipts",
      header: "Receipts",
      cell: (s) => (s.receiptNeeded ? "Needs review" : "Clear"),
    },
  ];

  function renderSupporterCard(s: SupporterSummary) {
    return (
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <Link
              to="/admin/supporters/$id"
              params={{ id: s.id }}
              className="font-semibold text-[var(--color-primary)] hover:underline"
            >
              {s.name}
            </Link>
            <div className="text-xs text-[var(--color-text-muted)]">{s.email}</div>
          </div>
          <div className="text-right text-sm font-medium text-[var(--color-panel)]">
            {formatHkd(s.lifetimeAmountCents)}
          </div>
        </div>
        <div className="text-xs text-[var(--color-text-muted)]">
          Last gift: {formatHkd(s.lastGiftAmountCents)} · Email {s.emailConsent ?? "-"} / WhatsApp{" "}
          {s.whatsappConsent ?? "-"}
        </div>
        <div className="text-xs text-[var(--color-text-muted)]">
          Receipts: {s.receiptNeeded ? "Needs review" : "Clear"}
        </div>
      </div>
    );
  }
  ```

- [ ] **TDD note:** No non-trivial helper extracted. No failing test needed. Run `bun test 2>&1 | tail -3` to confirm green.

- [ ] **Verify:**
  ```bash
  bunx eslint --fix src/components/admin/crm/SupporterList.tsx
  bunx eslint src/components/admin/crm/SupporterList.tsx
  bunx tsc --noEmit 2>&1 | grep SupporterList
  bun test 2>&1 | tail -3
  ```

- [ ] **Commit:**
  ```
  feat(admin): migrate SupporterList to DataTable + mobile card

  Replaces raw shadcn <Table> with DataTable<SupporterSummary>.
  Adds renderMobileCard: name/email identity + lifetime/last-gift
  amounts + consent summary + receipt flag.
  Inline error <TableRow> moved to error banner above DataTable.
  Desktop columns unchanged.

  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  ```

---

## Task 2 — CaseList: migrate raw `<Table>` → `DataTable` + mobile card

**Files:**
- `src/components/admin/adoptions/CaseList.tsx`

### Steps

- [ ] **Read the file** end-to-end (confirmed: 5-column raw `<Table>` inside a `<section>` with a header row showing count + page-size selector; pagination footer lives outside the `<Table>` in its own `<div>`; inline loading skeletons and error row; filter bar in a separate `<section>` above; `StatusBadge` for the status column; uses `formatDate`, `formatFallback` from `./caseWorkflowLogic`).

- [ ] **Remove** imports: `Table, TableBody, TableCell, TableHead, TableHeader, TableRow` from `../../ui/table`.

- [ ] **Add** import:
  ```tsx
  import { DataTable, type DataTableColumn } from "../DataTable";
  ```
  (`StatusBadge` is already imported from `../StatusBadge`.)

- [ ] **Remove** the `<Table aria-busy={…}>…</Table>` block (lines 222–304 in the original). The containing `<section>` (which holds the table's header bar and pagination footer) stays untouched; only the raw `<Table>` and its tbody content are replaced.

- [ ] **Insert** the following between the section header bar and the pagination footer (i.e., where `<Table>` was):

  ```tsx
  {error && !isLoading && (
    <div
      role="alert"
      className="border-t border-[var(--color-border)] px-4 py-3 text-sm text-[var(--color-error)]"
    >
      {error.message}
    </div>
  )}

  <DataTable<AdoptionCaseSummary>
    columns={caseColumns}
    rows={cases}
    getRowKey={(c) => c.id}
    loading={isLoading}
    skeletonRows={5}
    empty="No cases found"
    renderMobileCard={renderCaseCard}
  />
  ```

- [ ] **Add** `aria-busy` back on the wrapping `<section>` tag (it was on `<Table>` before):
  ```tsx
  <section
    aria-busy={isLoading || isFetching}
    className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]"
  >
  ```

- [ ] **Define** `caseColumns` and `renderCaseCard` before the `return` statement:

  ```tsx
  const caseColumns: DataTableColumn<AdoptionCaseSummary>[] = [
    {
      id: "applicant",
      header: "Applicant",
      className: "px-4",
      cell: (c) => (
        <div>
          <Link
            to="/admin/applications/$id"
            params={{ id: c.id }}
            className="font-semibold text-[var(--color-primary)] hover:underline"
          >
            {c.applicantName}
          </Link>
          <div className="text-xs text-[var(--color-text-muted)]">
            {formatFallback(c.applicantEmail)}
          </div>
        </div>
      ),
    },
    {
      id: "animal",
      header: "Requested animal",
      cell: (c) => (
        <div>
          <div className="font-medium text-[var(--color-panel)]">
            {formatFallback(c.requestedAnimalName)}
          </div>
          <div className="text-xs text-[var(--color-text-muted)]">
            {formatFallback(c.animalType)}
          </div>
        </div>
      ),
    },
    {
      id: "phone",
      header: "Phone",
      cell: (c) => (
        <span className="text-[var(--color-panel)]">
          {formatFallback(c.applicantPhone)}
        </span>
      ),
    },
    {
      id: "created",
      header: "Created",
      cell: (c) => (
        <span className="text-[var(--color-text-muted)]">{formatDate(c.createdAt)}</span>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: (c) => <StatusBadge status={c.status} />,
    },
  ];

  function renderCaseCard(c: AdoptionCaseSummary) {
    return (
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <Link
              to="/admin/applications/$id"
              params={{ id: c.id }}
              className="font-semibold text-[var(--color-primary)] hover:underline"
            >
              {c.applicantName}
            </Link>
            <div className="text-xs text-[var(--color-text-muted)]">
              {formatFallback(c.applicantEmail)}
            </div>
          </div>
          <StatusBadge status={c.status} />
        </div>
        <div className="text-xs text-[var(--color-text-muted)]">
          {formatFallback(c.requestedAnimalName)} · {formatFallback(c.animalType)}
        </div>
        <div className="text-xs text-[var(--color-text-muted)]">
          {formatFallback(c.applicantPhone)} · {formatDate(c.createdAt)}
        </div>
      </div>
    );
  }
  ```

- [ ] **TDD note:** No non-trivial helper extracted. `formatDate` and `formatFallback` are reused from `./caseWorkflowLogic`. No failing test needed. Run `bun test 2>&1 | tail -3`.

- [ ] **Verify:**
  ```bash
  bunx eslint --fix src/components/admin/adoptions/CaseList.tsx
  bunx eslint src/components/admin/adoptions/CaseList.tsx
  bunx tsc --noEmit 2>&1 | grep CaseList
  bun test 2>&1 | tail -3
  ```

- [ ] **Commit:**
  ```
  feat(admin): migrate CaseList to DataTable + mobile card

  Replaces raw shadcn <Table> with DataTable<AdoptionCaseSummary>.
  Adds renderMobileCard: applicant identity + StatusBadge + animal
  + phone/date facts. Filters, pagination, page-size, export, and
  aria-busy untouched. Error row moved to error banner above DataTable.

  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  ```

---

## Task 3 — AdopterList: migrate raw `<Table>` → `DataTable` + mobile card

**Files:**
- `src/components/admin/adoptions/AdopterList.tsx`

### Steps

- [ ] **Read the file** end-to-end (confirmed: 5-column raw `<Table>` — Name and area / Contact / History / Latest case / Action; inline loading skeletons and error row; pagination footer below table; `BlacklistBadge`, `LatestCaseCell` defined as local components; uses `formatDate`, `formatFallback` from `./caseWorkflowLogic` and `formatCount` defined locally; `Badge` from `../../ui/badge`).

- [ ] **Remove** imports: `Table, TableBody, TableCell, TableHead, TableHeader, TableRow` from `../../ui/table`.

- [ ] **Add** import:
  ```tsx
  import { DataTable, type DataTableColumn } from "../DataTable";
  ```
  (`Badge` from `../../ui/badge` stays — used in `BlacklistBadge` and `renderAdopterCard`.)

- [ ] **Remove** the `<Table aria-busy={…}>…</Table>` block inside the `<section className="overflow-hidden …">`. The section header bar and pagination footer stay untouched.

- [ ] **Add** `aria-busy` to the wrapping `<section>` tag:
  ```tsx
  <section
    aria-busy={isLoading || isFetching}
    className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]"
  >
  ```

- [ ] **Insert** after the section header bar, where `<Table>` was:

  ```tsx
  {error && !isLoading && (
    <div
      role="alert"
      className="border-t border-[var(--color-border)] px-4 py-3 text-sm text-[var(--color-error)]"
    >
      {error.message}
    </div>
  )}

  <DataTable<AdopterSummary>
    columns={adopterColumns}
    rows={adopters}
    getRowKey={(a) => a.id}
    loading={isLoading}
    skeletonRows={5}
    empty="No adopters found"
    renderMobileCard={renderAdopterCard}
  />
  ```

- [ ] **Define** `adopterColumns` and `renderAdopterCard` before the `return` statement. Reuse the existing `BlacklistBadge`, `LatestCaseCell`, and `formatCount` helpers already in the file:

  ```tsx
  const adopterColumns: DataTableColumn<AdopterSummary>[] = [
    {
      id: "nameArea",
      header: "Name and area",
      className: "min-w-64 px-4",
      cell: (a) => (
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/admin/coordinator/adopters/$id"
              params={{ id: a.id }}
              className="font-semibold text-[var(--color-primary)] hover:underline"
            >
              {a.displayName}
            </Link>
            <BlacklistBadge isBlacklisted={a.isBlacklisted} />
          </div>
          <div className="mt-1 text-xs text-[var(--color-text-muted)]">
            {formatFallback(a.livingArea)}
            {a.supporterId ? ` · ${a.supporterId}` : ""}
          </div>
        </div>
      ),
    },
    {
      id: "contact",
      header: "Contact",
      className: "min-w-52",
      cell: (a) => (
        <div>
          <div className="break-words text-[var(--color-panel)]">{formatFallback(a.phone)}</div>
          <div className="break-words text-xs text-[var(--color-text-muted)]">
            {formatFallback(a.email)}
          </div>
        </div>
      ),
    },
    {
      id: "history",
      header: "History",
      className: "min-w-56",
      cell: (a) => (
        <div className="flex flex-wrap gap-1.5">
          <Badge
            variant="outline"
            className="border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-panel)]"
          >
            {formatCount(a.openCaseCount)} open cases
          </Badge>
          <Badge
            variant="outline"
            className="border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-panel)]"
          >
            {formatCount(a.successfulAdoptionCount)} adoptions
          </Badge>
          <Badge
            variant="outline"
            className="border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-panel)]"
          >
            {formatCount(a.openTaskCount)} open tasks
          </Badge>
        </div>
      ),
    },
    {
      id: "latestCase",
      header: "Latest case",
      className: "min-w-32",
      cell: (a) => <LatestCaseCell latestCase={a.latestCase} />,
    },
    {
      id: "action",
      header: "Action",
      className: "w-32",
      cell: (a) => (
        <Link
          to="/admin/coordinator/adopters/$id"
          params={{ id: a.id }}
          className="inline-flex h-8 items-center justify-center rounded-md border border-[var(--color-border)] px-3 text-xs font-medium text-[var(--color-panel)] hover:bg-[var(--color-surface-2)]"
        >
          Open
        </Link>
      ),
    },
  ];

  function renderAdopterCard(a: AdopterSummary) {
    return (
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <Link
              to="/admin/coordinator/adopters/$id"
              params={{ id: a.id }}
              className="font-semibold text-[var(--color-primary)] hover:underline"
            >
              {a.displayName}
            </Link>
            <div className="mt-0.5 text-xs text-[var(--color-text-muted)]">
              {formatFallback(a.livingArea)}
            </div>
          </div>
          <BlacklistBadge isBlacklisted={a.isBlacklisted} />
        </div>
        <div className="text-xs text-[var(--color-text-muted)]">
          {formatFallback(a.phone)} · {formatFallback(a.email)}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge
            variant="outline"
            className="border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-panel)]"
          >
            {formatCount(a.openCaseCount)} open
          </Badge>
          <Badge
            variant="outline"
            className="border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-panel)]"
          >
            {formatCount(a.successfulAdoptionCount)} adopted
          </Badge>
          <Badge
            variant="outline"
            className="border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-panel)]"
          >
            {formatCount(a.openTaskCount)} tasks
          </Badge>
        </div>
        <LatestCaseCell latestCase={a.latestCase} />
      </div>
    );
  }
  ```

- [ ] **TDD note:** No non-trivial helper extracted. `BlacklistBadge`, `LatestCaseCell`, `formatCount`, `formatFallback`, `formatDate` are all reused. No failing test needed. Run `bun test 2>&1 | tail -3`.

- [ ] **Verify:**
  ```bash
  bunx eslint --fix src/components/admin/adoptions/AdopterList.tsx
  bunx eslint src/components/admin/adoptions/AdopterList.tsx
  bunx tsc --noEmit 2>&1 | grep AdopterList
  bun test 2>&1 | tail -3
  ```

- [ ] **Commit:**
  ```
  feat(admin): migrate AdopterList to DataTable + mobile card

  Replaces raw shadcn <Table> with DataTable<AdopterSummary>.
  Adds renderMobileCard: name/area + blacklist badge + contact +
  open/adopted/tasks counts + LatestCaseCell. Filters, pagination,
  page-size, export untouched. Error row moved to banner above table.

  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  ```

---

## Task 4 — TaskCenter: apply responsive stacking (not a DataTable migration)

**Files:**
- `src/components/admin/adoptions/TaskCenter.tsx`
- `src/components/admin/adoptions/TaskPanel.tsx`

### Judgement: TaskCenter is NOT a tabular list

Reading `TaskCenter.tsx` reveals it renders a summary stat grid, then a `<TaskPanel>` component. `TaskPanel` is a custom card-based list of `<TaskItem>` components — each task is already rendered as a `<article>` with a two-column `xl:grid-cols-[…]` editorial card layout, NOT a raw `<Table>`. There are no `<Table>` / `<TableRow>` / `<TableCell>` imports in `TaskCenter.tsx` itself.

The responsive problem here is not "table on mobile" but "multi-column task card forms cramping on narrow screens". The treatment is: make the wide filter bar and the `TaskItem` inner form grid stack gracefully below `md`, and ensure the summary stat grid (already `sm:grid-cols-2 xl:grid-cols-6`) works at 375px.

No `DataTable` migration needed for `TaskCenter`. The plan applies targeted responsive-stacking edits to both files.

### Steps

**`TaskCenter.tsx` changes:**

- [ ] **Filter bar** — the filter grid uses `xl:grid-cols-[minmax(260px,1fr)_180px_180px_220px_170px_auto]`. This already stacks to a single column below `xl`. Confirm it also stacks correctly at `md` (i.e., no `md:` override is needed — the default `grid` (1-col) applies below `xl`). No change required here — it already stacks.

- [ ] **Summary stat grid** — already `grid gap-3 sm:grid-cols-2 xl:grid-cols-6`. At 375px this renders 1 column (below `sm`). Confirm this works. No change needed.

- [ ] **Pagination buttons** (`Previous` / `Next`) at the bottom are `variant="outline"` — no `size="sm"`. They already have `h-10` effective touch height via shadcn's default Button. Confirm: no change needed.

**`TaskPanel.tsx` changes (TaskItem):**

- [ ] **`TaskItem` info/form two-column split** — the outer grid is:
  ```tsx
  // line 272
  className="grid gap-3 px-4 py-4 xl:grid-cols-[minmax(220px,1.1fr)_minmax(360px,2fr)]"
  ```
  This already stacks to 1 column below `xl`. Confirm at `md` (375px) it correctly renders as a single column. No change needed — it already stacks.

- [ ] **`TaskItem` form controls inner grid** — the controls grid is:
  ```tsx
  // line 306
  className="grid gap-3 md:grid-cols-2 xl:grid-cols-3"
  ```
  At 375px (below `md`) this renders as 1 column — correct. No change needed.

- [ ] **`TaskItem` date/time inputs** — `<Input type="datetime-local">` renders at default height. On mobile, `datetime-local` inputs should be at least 44px tall. Add `className="h-11"` to each of the four `datetime-local` inputs inside `TaskItem` (due, scheduled, completed, next-step):
  ```tsx
  // before:
  <Input id={`task-due-${task.id}`} type="datetime-local" value={form.dueAt} … />
  // after:
  <Input id={`task-due-${task.id}`} type="datetime-local" value={form.dueAt} className="h-11" … />
  ```
  Apply the same `className="h-11"` to the `task-scheduled`, `task-completed`, and `task-next` inputs.

- [ ] **`TaskPanel` create form** — the create form grid is `lg:grid-cols-[minmax(220px,1fr)_200px_180px_180px_minmax(220px,1fr)_auto]`. Below `lg` it already stacks. The two `datetime-local` inputs in the create form (due, scheduled) also need `className="h-11"`:
  ```tsx
  <Input id="task-due" type="datetime-local" value={form.dueAt} className="h-11" … />
  <Input id="task-scheduled" type="datetime-local" value={form.scheduledAt} className="h-11" … />
  ```

- [ ] **`TaskPanel` header** — already `flex min-h-14 items-center justify-between`. No change needed.

- [ ] **`TaskPanelAsyncError`** — already full-width `div`. No change needed.

- [ ] **`Save task` Button** (in `TaskItem`) — uses default size (h-10). Already ≥44px effective. No change.

- [ ] **TDD note:** Pure layout/className edits, no logic extracted. No failing test needed. Run `bun test 2>&1 | tail -3`.

- [ ] **Verify:**
  ```bash
  bunx eslint --fix src/components/admin/adoptions/TaskCenter.tsx src/components/admin/adoptions/TaskPanel.tsx
  bunx eslint src/components/admin/adoptions/TaskCenter.tsx src/components/admin/adoptions/TaskPanel.tsx
  bunx tsc --noEmit 2>&1 | grep -E "TaskCenter|TaskPanel"
  bun test 2>&1 | tail -3
  ```

- [ ] **Commit:**
  ```
  feat(admin): improve TaskCenter + TaskPanel mobile touch targets

  TaskCenter is not a tabular list — it renders TaskPanel (card-based
  TaskItem forms). Filter bar and stat grid already stack correctly.
  Adds h-11 (44px) to all datetime-local inputs in TaskItem and the
  TaskPanel create form for comfortable mobile touch targets.

  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  ```

---

## Task 5 — SupporterDetail: stack detail panels to one column on mobile

**Files:**
- `src/components/admin/crm/SupporterDetail.tsx`

### What needs changing (specific containers found by reading the file)

`SupporterDetail` is an entirely linear single-column layout at all sizes except for two places that need attention:

1. **Summary stat cards grid** (line 157):
   ```tsx
   // current:
   <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
   ```
   Already stacks to 1 col below `sm` (375px). No change needed.

2. **Header row** (line 119):
   ```tsx
   <div className="flex flex-wrap items-start justify-between gap-4">
   ```
   Already wraps. No change needed.

3. **Action bar** (line 105):
   ```tsx
   <div className="flex flex-wrap items-center justify-between gap-3">
   ```
   Already wraps. No change needed.

4. **Donation list rows** (line 189):
   ```tsx
   <div className="flex flex-wrap items-center justify-between gap-3 py-3">
   ```
   Already wraps. No change needed.

5. **Issue receipt Button** (`size="sm"`, line 207) — `h-9` by shadcn default for `size="sm"`. Touch target is below 44px. Change to default size on mobile:
   ```tsx
   // before:
   <Button type="button" variant="outline" size="sm" onClick={…} disabled={…}>
     <FileCheck className="h-4 w-4" />
     Issue receipt
   </Button>
   ```
   ```tsx
   // after (in the Donations section):
   <Button type="button" variant="outline" size="sm" className="min-h-[44px] sm:min-h-0" onClick={…} disabled={…}>
     <FileCheck className="h-4 w-4" />
     Issue receipt
   </Button>
   ```

6. **Void receipt Button** (`size="sm"`, line 250) — same treatment:
   ```tsx
   // before:
   <Button type="button" variant="outline" size="sm" onClick={…} disabled={…}>
     <FileX className="h-4 w-4" />
     Void
   </Button>
   ```
   ```tsx
   // after:
   <Button type="button" variant="outline" size="sm" className="min-h-[44px] sm:min-h-0" onClick={…} disabled={…}>
     <FileX className="h-4 w-4" />
     Void
   </Button>
   ```

7. **Back + action bar** (line 105–115): The `<Button asChild variant="ghost" size="sm">` back link is `size="sm"` (h-9). Apply the same `className="min-h-[44px] sm:min-h-0"` to it as well.

8. **ConsentEditor** — this is a child component (`./ConsentEditor`). If it contains `size="sm"` buttons, those are out of scope for this task (separate component, separate PR concern). Do not touch `ConsentEditor.tsx` in this task.

- [ ] Apply the six `className="min-h-[44px] sm:min-h-0"` additions to the `size="sm"` buttons described above (Back button, Issue receipt, Void).

- [ ] **TDD note:** Pure className additions. No logic extracted. No failing test needed. `bun test 2>&1 | tail -3`.

- [ ] **Verify:**
  ```bash
  bunx eslint --fix src/components/admin/crm/SupporterDetail.tsx
  bunx eslint src/components/admin/crm/SupporterDetail.tsx
  bunx tsc --noEmit 2>&1 | grep SupporterDetail
  bun test 2>&1 | tail -3
  ```

- [ ] **Commit:**
  ```
  feat(admin): SupporterDetail mobile touch target improvements

  Summary grid already stacks (sm:grid-cols-2). Adds min-h-[44px]
  on mobile to size="sm" buttons (back link, Issue receipt, Void)
  so touch targets meet the 44px spec. Desktop h-9 preserved via
  sm:min-h-0. No layout redesign.

  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  ```

---

## Task 6 — CaseDetail: stack detail panels to one column on mobile

**Files:**
- `src/components/admin/adoptions/CaseDetail.tsx`

### What needs changing (specific containers found by reading the file)

1. **`DetailGrid` inner grid** (line 114):
   ```tsx
   // current — already responsive:
   <div className="grid md:grid-cols-2 xl:grid-cols-3">
   ```
   Below `md` (375px) this is already 1 column. No change needed.

2. **`RecordSummary` inner grid** (line 157):
   ```tsx
   // current — already responsive:
   <div className="grid md:grid-cols-2">
   ```
   Below `md` this is already 1 column. No change needed.

3. **Status controls form** (line 388):
   ```tsx
   // current:
   <form onSubmit={handleStatusSubmit} className="grid gap-4 p-4 lg:grid-cols-[260px_1fr_auto]">
   ```
   Below `lg` (below 1024px, which includes 375px) this is already 1 column. No change needed.

4. **`Save status` Button** inside the Status controls form (line 417): default Button size — already ≥44px. No change needed.

5. **`Refresh` Button** in the header action bar (line 339): `variant="outline"` default size — already ≥44px. No change needed.

6. **`Back to cases` link** (line 326): an inline anchor (not a Button component), styled:
   ```tsx
   className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-primary)] hover:underline"
   ```
   Touch target is text-only height (~20px). Add `py-2` for 44px effective height on mobile:
   ```tsx
   // before:
   className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-primary)] hover:underline"
   // after:
   className="inline-flex items-center gap-2 py-2 text-sm font-medium text-[var(--color-primary)] hover:underline"
   ```
   There are two instances (in the loading skeleton error state at line 305, and in the main render at line 326). Apply to both.

7. **Loading skeleton inner grid** (line 289):
   ```tsx
   <div className="grid gap-3 p-4 md:grid-cols-3">
   ```
   Below `md` already stacks to 1 column. No change needed.

8. **`TaskPanel`** and **`MatchPanel`** — these are child components edited in Task 4 (TaskPanel) and are already card-based. No additional changes in `CaseDetail.tsx` for those.

9. **`FinalizationPanel`** — out-of-scope child component. Do not touch.

- [ ] Apply `py-2` to both instances of the `Back to cases` inline link (error state + main render).

- [ ] **TDD note:** Pure className additions. No logic extracted. No failing test needed. `bun test 2>&1 | tail -3`.

- [ ] **Verify:**
  ```bash
  bunx eslint --fix src/components/admin/adoptions/CaseDetail.tsx
  bunx eslint src/components/admin/adoptions/CaseDetail.tsx
  bunx tsc --noEmit 2>&1 | grep CaseDetail
  bun test 2>&1 | tail -3
  ```

- [ ] **Commit:**
  ```
  feat(admin): CaseDetail mobile layout review

  DetailGrid, RecordSummary, and Status controls form already stack
  correctly below md/lg. Adds py-2 to the Back to cases inline link
  (both error + main renders) for a comfortable 44px touch target.
  No content removed.

  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  ```

---

## Task 7 — AdopterDetail: stack detail panels to one column on mobile + migrate case history tables

**Files:**
- `src/components/admin/adoptions/AdopterDetail.tsx`

### What needs changing (specific containers found by reading the file)

`AdopterDetail` has two distinct concerns: (a) the `DetailGrid` sections (already responsive) and (b) two raw `<Table>` components inside `Section` panels — "Case history" and "Successful adoptions" — which will overflow at 375px.

1. **`DetailGrid` inner grid** (line 145) — same implementation as `CaseDetail`:
   ```tsx
   <div className="grid md:grid-cols-2 xl:grid-cols-3">
   ```
   Already 1 column below `md`. No change needed.

2. **`Back to adopters` link** (lines 235 and 219 in the error state):
   ```tsx
   className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-primary)] hover:underline"
   ```
   Apply `py-2` to both instances (same pattern as Task 6):
   ```tsx
   className="inline-flex items-center gap-2 py-2 text-sm font-medium text-[var(--color-primary)] hover:underline"
   ```

3. **`Refresh` Button** (line 251) — default size, already ≥44px. No change.

4. **"Case history" table** (lines 326–387) — a raw `<Table>` with 5 columns: Applicant / Requested animal / Dates / Status / Action. This is an embedded detail table inside a Section panel. Per the spec: "Tables-within-detail get the same `DataTable` card seam or a horizontal-scroll wrapper." Use `DataTable` with `renderMobileCard` for consistency.

   - [ ] Add import: `import { DataTable, type DataTableColumn } from "../DataTable";` (and remove `Table, TableBody, TableCell, TableHead, TableHeader, TableRow` from `../../ui/table` if no other raw table remains — check that the Successful adoptions table is handled in the same task first).

   - [ ] Replace the `<Table>…</Table>` block in the "Case history" Section with:

     ```tsx
     <DataTable<AdopterCaseHistoryRow>
       columns={caseHistoryColumns}
       rows={adopter.cases}
       getRowKey={(c) => c.id}
       empty="No case history"
     />
     ```

   - [ ] Define `caseHistoryColumns` before the `return` statement:

     ```tsx
     const caseHistoryColumns: DataTableColumn<AdopterCaseHistoryRow>[] = [
       {
         id: "applicant",
         header: "Applicant",
         className: "min-w-56 px-4",
         cell: (c) => (
           <div>
             <Link
               to="/admin/applications/$id"
               params={{ id: c.id }}
               className="font-semibold text-[var(--color-primary)] hover:underline"
             >
               {c.applicantName}
             </Link>
             <div className="text-xs text-[var(--color-text-muted)]">
               {formatFallback(c.animalType)}
             </div>
           </div>
         ),
       },
       {
         id: "animal",
         header: "Requested animal",
         className: "min-w-48",
         cell: (c) => (
           <div className="font-medium text-[var(--color-panel)]">
             {formatFallback(c.requestedAnimalName)}
           </div>
         ),
       },
       {
         id: "dates",
         header: "Dates",
         className: "min-w-40",
         cell: (c) => (
           <div className="text-xs text-[var(--color-text-muted)]">
             <div>Created: {formatDate(c.createdAt)}</div>
             <div>Closed: {formatDate(c.closedAt)}</div>
           </div>
         ),
       },
       {
         id: "status",
         header: "Status",
         className: "min-w-48",
         cell: (c) => <StatusChip status={c.status} />,
       },
       {
         id: "action",
         header: "Action",
         className: "w-32",
         cell: (c) => (
           <Link
             to="/admin/applications/$id"
             params={{ id: c.id }}
             className="inline-flex h-8 items-center justify-center rounded-md border border-[var(--color-border)] px-3 text-xs font-medium text-[var(--color-panel)] hover:bg-[var(--color-surface-2)]"
           >
             Open case
           </Link>
         ),
       },
     ];
     ```

   - [ ] Define `renderCaseHistoryCard` for mobile:

     ```tsx
     function renderCaseHistoryCard(c: AdopterCaseHistoryRow) {
       return (
         <div className="space-y-2">
           <div className="flex items-start justify-between gap-2">
             <div>
               <Link
                 to="/admin/applications/$id"
                 params={{ id: c.id }}
                 className="font-semibold text-[var(--color-primary)] hover:underline"
               >
                 {c.applicantName}
               </Link>
               <div className="text-xs text-[var(--color-text-muted)]">
                 {formatFallback(c.animalType)}
               </div>
             </div>
             <StatusChip status={c.status} />
           </div>
           <div className="text-xs text-[var(--color-text-muted)]">
             {formatFallback(c.requestedAnimalName)}
           </div>
           <div className="text-xs text-[var(--color-text-muted)]">
             Created: {formatDate(c.createdAt)} · Closed: {formatDate(c.closedAt)}
           </div>
         </div>
       );
     }
     ```

   - [ ] Update the `DataTable` call to pass `renderMobileCard`:
     ```tsx
     <DataTable<AdopterCaseHistoryRow>
       columns={caseHistoryColumns}
       rows={adopter.cases}
       getRowKey={(c) => c.id}
       empty="No case history"
       renderMobileCard={renderCaseHistoryCard}
     />
     ```

5. **"Successful adoptions" table** (lines 389–439) — a raw `<Table>` with 5 columns: Case number / Animal / Fee / Approval / Pickup. Apply the same DataTable migration:

   - [ ] Replace `<Table>…</Table>` in the "Successful adoptions" Section with:

     ```tsx
     <DataTable<AdopterSuccessfulAdoptionRow>
       columns={successfulAdoptionColumns}
       rows={adopter.successfulAdoptions}
       getRowKey={(a) => a.id}
       empty="No successful adoptions recorded"
       renderMobileCard={renderSuccessfulAdoptionCard}
     />
     ```

   - [ ] Define `successfulAdoptionColumns` before the `return` statement:

     ```tsx
     const successfulAdoptionColumns: DataTableColumn<AdopterSuccessfulAdoptionRow>[] = [
       {
         id: "caseNumber",
         header: "Case number",
         className: "min-w-44 px-4",
         cell: (a) => (
           <span className="font-semibold text-[var(--color-panel)]">{a.caseNumber}</span>
         ),
       },
       {
         id: "animal",
         header: "Animal",
         className: "min-w-48",
         cell: (a) => (
           <div>
             <div className="font-medium text-[var(--color-panel)]">
               {formatFallback(a.animalName)}
             </div>
             <div className="break-words text-xs text-[var(--color-text-muted)]">{a.animalId}</div>
           </div>
         ),
       },
       {
         id: "fee",
         header: "Fee",
         className: "min-w-32",
         cell: (a) => (
           <span className="text-[var(--color-panel)]">{formatHkdCents(a.adoptionFeeCents)}</span>
         ),
       },
       {
         id: "approval",
         header: "Approval",
         className: "min-w-40",
         cell: (a) => (
           <span className="text-[var(--color-text-muted)]">{formatDate(a.approvalDate)}</span>
         ),
       },
       {
         id: "pickup",
         header: "Pickup",
         className: "min-w-40",
         cell: (a) => (
           <span className="text-[var(--color-text-muted)]">{formatDate(a.pickupDate)}</span>
         ),
       },
     ];
     ```

   - [ ] Define `renderSuccessfulAdoptionCard`:

     ```tsx
     function renderSuccessfulAdoptionCard(a: AdopterSuccessfulAdoptionRow) {
       return (
         <div className="space-y-1.5">
           <div className="flex items-center justify-between gap-2">
             <span className="font-semibold text-[var(--color-panel)]">{a.caseNumber}</span>
             <span className="text-sm text-[var(--color-panel)]">
               {formatHkdCents(a.adoptionFeeCents)}
             </span>
           </div>
           <div className="font-medium text-[var(--color-panel)]">
             {formatFallback(a.animalName)}
           </div>
           <div className="text-xs text-[var(--color-text-muted)]">
             Approval: {formatDate(a.approvalDate)} · Pickup: {formatDate(a.pickupDate)}
           </div>
         </div>
       );
     }
     ```

6. **Remove** `Table, TableBody, TableCell, TableHead, TableHeader, TableRow` from the `../../ui/table` import (both raw tables are now replaced). Confirm `StatusChip` is already defined locally in `AdopterDetail.tsx` — it is (line 83). No import change needed for it.

7. **Define the row types by deriving them from the already-imported detail data type** — do NOT add new named imports from `../../../lib/adoptions/types` (those row types may not be exported under those names; deriving avoids a missing-export `tsc` error). `adopter` is typed `AdopterDetailData` (the file already imports `AdopterDetail as AdopterDetailData`). Add, near the top of the module (after imports):
   ```tsx
   type AdopterCaseHistoryRow = AdopterDetailData["cases"][number];
   type AdopterSuccessfulAdoptionRow = AdopterDetailData["successfulAdoptions"][number];
   ```
   If `adopter.cases` / `adopter.successfulAdoptions` are named differently in this file, derive from the actual property names you see when reading it. The field names used in the columns/cards above (`applicantName`, `animalType`, `requestedAnimalName`, `createdAt`, `closedAt`, `status`; `caseNumber`, `animalName`, `animalId`, `adoptionFeeCents`, `approvalDate`, `pickupDate`) are lifted from the existing `<Table>` cells — if any differs, the `bunx tsc ... | grep AdopterDetail` step will flag it; fix to match the real field.

- [ ] **TDD note:** No non-trivial helper extracted. `formatDate`, `formatFallback`, `formatHkdCents`, `StatusChip` all reused. No failing test needed. `bun test 2>&1 | tail -3`.

- [ ] **Verify:**
  ```bash
  bunx eslint --fix src/components/admin/adoptions/AdopterDetail.tsx
  bunx eslint src/components/admin/adoptions/AdopterDetail.tsx
  bunx tsc --noEmit 2>&1 | grep AdopterDetail
  bun test 2>&1 | tail -3
  ```

- [ ] **Commit:**
  ```
  feat(admin): AdopterDetail mobile stacking + migrate embedded tables

  Adds py-2 to Back to adopters links for 44px touch target.
  Migrates the Case history and Successful adoptions raw <Table>
  elements inside detail Section panels to DataTable with
  renderMobileCard — stacked identity + status + date facts on mobile.
  Desktop column layout unchanged.

  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  ```

---

## Task 8 — Final verification gate

**Files:** all 7 modified files + Vercel preview.

### Steps

- [ ] **Run full test suite:**
  ```bash
  bun test 2>&1 | tail -10
  ```
  Must show all passing, zero new failures.

- [ ] **Type-check across all touched files:**
  ```bash
  bunx tsc --noEmit 2>&1 | grep -E "SupporterList|CaseList|AdopterList|TaskCenter|TaskPanel|SupporterDetail|CaseDetail|AdopterDetail"
  ```
  Must be empty (zero new errors — pre-existing baseline errors elsewhere are expected and ignored).

- [ ] **Lint all changed files in one pass:**
  ```bash
  bunx eslint --fix \
    src/components/admin/crm/SupporterList.tsx \
    src/components/admin/crm/SupporterDetail.tsx \
    src/components/admin/adoptions/CaseList.tsx \
    src/components/admin/adoptions/CaseDetail.tsx \
    src/components/admin/adoptions/AdopterList.tsx \
    src/components/admin/adoptions/AdopterDetail.tsx \
    src/components/admin/adoptions/TaskCenter.tsx \
    src/components/admin/adoptions/TaskPanel.tsx

  bunx eslint \
    src/components/admin/crm/SupporterList.tsx \
    src/components/admin/crm/SupporterDetail.tsx \
    src/components/admin/adoptions/CaseList.tsx \
    src/components/admin/adoptions/CaseDetail.tsx \
    src/components/admin/adoptions/AdopterList.tsx \
    src/components/admin/adoptions/AdopterDetail.tsx \
    src/components/admin/adoptions/TaskCenter.tsx \
    src/components/admin/adoptions/TaskPanel.tsx
  ```
  Zero errors.

- [ ] **Spec cross-check:**

  | Spec requirement | Task that satisfies it |
  |---|---|
  | SupporterList → DataTable + mobile card | Task 1 |
  | CaseList → DataTable + mobile card (keep filters/pagination/export) | Task 2 |
  | AdopterList → DataTable + mobile card | Task 3 |
  | TaskCenter → DataTable or card list | Task 4 — card-based `TaskPanel` already used; datetime-local inputs get h-11 touch targets |
  | Inline error rows → error banner above DataTable | Tasks 1, 2, 3 |
  | SupporterDetail stack + ≥44px touch targets | Task 5 |
  | CaseDetail stack + ≥44px touch targets | Task 6 |
  | AdopterDetail stack + ≥44px touch targets + embedded tables | Task 7 |
  | `AnimalPipeline` and `CoordinatorReports` deferred | Not in any task (correct) |
  | No content removed on mobile | Confirmed — all task steps reflow, not hide |
  | No new tsc errors | Task 8 gate |
  | `bun test` stays green | Every task + final gate |
  | Colours via `var(--color-*)` tokens | All card JSX uses tokens per model |

- [ ] **Vercel preview deploy** (admin is behind login — headless screenshots not possible):
  ```bash
  vc deploy --scope ynwaforevers-projects
  ```
  On the preview URL, log in as admin and check each in-scope view at 375px browser width:
  - List views: mobile cards appear below `md`, desktop table hidden; no horizontal scroll at 375px.
  - Detail views: panels stack to one column; touch targets on buttons are comfortable.
  - `AnimalPipeline` and `CoordinatorReports` remain unchanged (no regression).

- [ ] **Final summary commit** (if any polish fixes were applied during gate):
  ```
  fix(admin): phase 4 mobile pass — gate fixes

  <describe any specific fixes applied>

  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  ```
