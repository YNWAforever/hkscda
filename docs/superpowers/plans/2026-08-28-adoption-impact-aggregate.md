# Privacy-Safe Adoption-Impact Aggregate (BP-1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `/report/adoption`'s static "not published yet" state with a real, privacy-safe adoption-impact report, and fix the homepage's silently-broken adopted-count stat cards — both sourced from one new server-side aggregate over `successful_adoption`.

**Architecture:** A new `lib/adoptions` public-impact module follows this codebase's established `repository.server.ts` → orchestration `.server.ts` → `createServerFn` `.functions.ts` layering (mirrored closely on `lib/content/publicStoriesPage.*`). The repository uses the service-role client (`createSupabaseServiceClient`, already used elsewhere) since `successful_adoption` has no anon grant. No RLS policy or migration changes.

**Tech Stack:** TanStack Start (React 19), Supabase Postgres (service-role client for this domain only), Bun test runner, `bun:test` + `react-dom/server` `renderToString`.

**Spec:** `docs/superpowers/specs/2026-08-28-adoption-impact-aggregate-design.md`

---

## Git setup

This plan runs in an isolated worktree on branch `docs/adoption-impact-aggregate-impl`, branched from `docs/adoption-impact-aggregate-design` (which already has the spec commit `f7b2c50` on top of `main`). A single PR from the impl branch targets `main` directly at the end — no stacking needed for this single-feature plan.

---

### Task 1: Pure trailing-months and report-shaping logic

**Files:**
- Create: `src/lib/adoptions/publicImpact.ts`
- Test: `src/lib/adoptions/publicImpact.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/adoptions/publicImpact.test.ts
import { describe, expect, test } from "bun:test";
import { buildAdoptionImpactReport, trailingMonths } from "./publicImpact";

describe("trailingMonths", () => {
  test("returns 12 months ending at the given date, oldest first", () => {
    const months = trailingMonths(new Date("2026-08-15T00:00:00.000Z"));

    expect(months).toHaveLength(12);
    expect(months[0].month).toBe("2025-09");
    expect(months[11].month).toBe("2026-08");
    expect(months[11].start).toBe("2026-08-01");
    expect(months[11].end).toBe("2026-09-01");
    expect(months[11].label).toBe("2026年8月");
  });

  test("handles a January now correctly across the year boundary", () => {
    const months = trailingMonths(new Date("2026-01-10T00:00:00.000Z"));

    expect(months[0].month).toBe("2025-02");
    expect(months[11].month).toBe("2026-01");
  });
});

describe("buildAdoptionImpactReport", () => {
  test("zero-fills months with no adoptions and keeps the lifetime total separate", () => {
    const report = buildAdoptionImpactReport({
      total: 342,
      monthlyCounts: { "2026-08": 5, "2026-06": 2 },
      now: new Date("2026-08-15T00:00:00.000Z"),
    });

    expect(report.total).toBe(342);
    expect(report.monthly).toHaveLength(12);
    expect(report.monthly.find((m) => m.month === "2026-08")?.count).toBe(5);
    expect(report.monthly.find((m) => m.month === "2026-07")?.count).toBe(0);
    expect(report.asOf).toBe("2026-08-15T00:00:00.000Z");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/lib/adoptions/publicImpact.test.ts`
Expected: FAIL — `publicImpact.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/adoptions/publicImpact.ts
export type SpeciesTotals = { cat: number; dog: number };

export type TrailingMonth = {
  month: string; // "YYYY-MM"
  start: string; // "YYYY-MM-DD", inclusive
  end: string; // "YYYY-MM-DD", exclusive
  label: string; // zh-HK, e.g. "2026年8月"
};

export type AdoptionImpactReport = {
  total: number;
  monthly: Array<{ month: string; label: string; count: number }>;
  asOf: string; // ISO
};

export function trailingMonths(now: Date, count = 12): TrailingMonth[] {
  const nowYear = now.getUTCFullYear();
  const nowMonth = now.getUTCMonth();
  const months: TrailingMonth[] = [];

  for (let i = count - 1; i >= 0; i--) {
    const start = new Date(Date.UTC(nowYear, nowMonth - i, 1));
    const end = new Date(Date.UTC(nowYear, nowMonth - i + 1, 1));
    const month = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`;
    const label = new Intl.DateTimeFormat("zh-HK", {
      year: "numeric",
      month: "long",
      timeZone: "Asia/Hong_Kong",
    }).format(start);

    months.push({
      month,
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
      label,
    });
  }

  return months;
}

export function buildAdoptionImpactReport(input: {
  total: number;
  monthlyCounts: Record<string, number>;
  now: Date;
}): AdoptionImpactReport {
  const months = trailingMonths(input.now);
  return {
    total: input.total,
    monthly: months.map((m) => ({
      month: m.month,
      label: m.label,
      count: input.monthlyCounts[m.month] ?? 0,
    })),
    asOf: input.now.toISOString(),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/lib/adoptions/publicImpact.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/adoptions/publicImpact.ts src/lib/adoptions/publicImpact.test.ts
git commit -m "feat: add trailing-months and adoption-impact-report shaping logic"
```

---

### Task 2: Service-role repository over `successful_adoption`

**Files:**
- Create: `src/lib/adoptions/publicImpactRepository.server.ts`
- Test: `src/lib/adoptions/publicImpactRepository.server.test.ts`

**Context:** `successful_adoption` is granted only to `authenticated`/service-role (confirmed: `grant select, insert, update, delete on public.successful_adoption to authenticated;` in `supabase/migrations/20260626140914_adoption_coordinator_foundation.sql`, no `anon` grant anywhere). This repository must only ever be called with a service-role client, from server-only code. It selects `animal_id` (to join species) and `id` (for counts) from `successful_adoption`, and `id, type` from `animals` — never any adopter, case, or fee field.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/adoptions/publicImpactRepository.server.test.ts
import { describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getAdoptionLifetimeTotal,
  getAdoptionMonthlyCounts,
  getAdoptionSpeciesTotals,
} from "./publicImpactRepository.server";

type FakeResult = {
  data?: unknown[] | null;
  count?: number | null;
  error?: { message: string } | null;
};

function createBuilder(calls: unknown[], result: FakeResult) {
  const builder: Record<string, unknown> = {
    select(columns: string, options?: unknown) {
      calls.push({ name: "select", columns, options });
      return builder;
    },
    eq(column: string, value: unknown) {
      calls.push({ name: "eq", column, value });
      return builder;
    },
    gte(column: string, value: unknown) {
      calls.push({ name: "gte", column, value });
      return builder;
    },
    lt(column: string, value: unknown) {
      calls.push({ name: "lt", column, value });
      return builder;
    },
    in(column: string, values: unknown[]) {
      calls.push({ name: "in", column, values });
      return builder;
    },
    then(resolve: (value: FakeResult) => void) {
      resolve(result);
    },
  };
  return builder;
}

function createClient(results: Record<string, FakeResult | FakeResult[]>) {
  const calls: unknown[] = [];
  const cursors: Record<string, number> = {};
  const client = {
    calls,
    from(table: string) {
      calls.push({ name: "from", table });
      const entry = results[table];
      if (Array.isArray(entry)) {
        const i = cursors[table] ?? 0;
        cursors[table] = i + 1;
        return createBuilder(calls, entry[i]);
      }
      return createBuilder(calls, entry ?? { data: [], count: 0, error: null });
    },
  };
  return client as unknown as SupabaseClient & { calls: unknown[] };
}

describe("getAdoptionLifetimeTotal", () => {
  test("counts all successful_adoption rows with no filter", async () => {
    const client = createClient({ successful_adoption: { count: 342, error: null } });
    await expect(getAdoptionLifetimeTotal(client)).resolves.toBe(342);
  });

  test("throws when the count query errors", async () => {
    const client = createClient({
      successful_adoption: { count: null, error: { message: "connection refused" } },
    });
    await expect(getAdoptionLifetimeTotal(client)).rejects.toThrow("connection refused");
  });
});

describe("getAdoptionSpeciesTotals", () => {
  test("joins successful_adoption to animals.type and tallies by species", async () => {
    const client = createClient({
      successful_adoption: {
        data: [{ animal_id: "a1" }, { animal_id: "a2" }, { animal_id: "a3" }],
        error: null,
      },
      animals: {
        data: [
          { id: "a1", type: "cat" },
          { id: "a2", type: "cat" },
          { id: "a3", type: "dog" },
        ],
        error: null,
      },
    });

    await expect(getAdoptionSpeciesTotals(client)).resolves.toEqual({ cat: 2, dog: 1 });
  });

  test("selects only animal_id, id, and type - nothing adopter- or case-identifying", async () => {
    const client = createClient({
      successful_adoption: { data: [{ animal_id: "a1" }], error: null },
      animals: { data: [{ id: "a1", type: "cat" }], error: null },
    });

    await getAdoptionSpeciesTotals(client);

    const selects = client.calls.filter(
      (c) => (c as { name: string }).name === "select",
    );
    expect(selects).toEqual([
      { name: "select", columns: "animal_id", options: undefined },
      { name: "select", columns: "id, type", options: undefined },
    ]);
  });

  test("returns zero totals with no second query when there are no adoptions", async () => {
    const client = createClient({ successful_adoption: { data: [], error: null } });
    await expect(getAdoptionSpeciesTotals(client)).resolves.toEqual({ cat: 0, dog: 0 });
  });
});

describe("getAdoptionMonthlyCounts", () => {
  test("issues 12 range-filtered counts and keys them by YYYY-MM", async () => {
    const now = new Date("2026-08-15T00:00:00.000Z");
    const monthlyResults: FakeResult[] = Array.from({ length: 12 }, (_, i) => ({
      count: i === 11 ? 5 : 0,
      error: null,
    }));
    const client = createClient({ successful_adoption: monthlyResults });

    const counts = await getAdoptionMonthlyCounts(client, now);

    expect(counts["2026-08"]).toBe(5);
    expect(counts["2026-07"]).toBe(0);
    expect(Object.keys(counts)).toHaveLength(12);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/lib/adoptions/publicImpactRepository.server.test.ts`
Expected: FAIL — `publicImpactRepository.server.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/adoptions/publicImpactRepository.server.ts
import type { SupabaseClient } from "@supabase/supabase-js";

import { trailingMonths } from "./publicImpact";
import type { SpeciesTotals } from "./publicImpact";

async function countRows(
  query: PromiseLike<{ count: number | null; error: { message: string } | null }>,
): Promise<number> {
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function getAdoptionLifetimeTotal(client: SupabaseClient): Promise<number> {
  return countRows(
    client.from("successful_adoption").select("id", { count: "exact", head: true }),
  );
}

export async function getAdoptionSpeciesTotals(client: SupabaseClient): Promise<SpeciesTotals> {
  const { data, error } = await client.from("successful_adoption").select("animal_id");
  if (error) throw new Error(error.message);

  const animalIds = Array.from(
    new Set((data ?? []).map((row) => (row as { animal_id: string }).animal_id)),
  );
  if (animalIds.length === 0) return { cat: 0, dog: 0 };

  const { data: animalRows, error: animalError } = await client
    .from("animals")
    .select("id, type")
    .in("id", animalIds);
  if (animalError) throw new Error(animalError.message);

  const totals: SpeciesTotals = { cat: 0, dog: 0 };
  for (const row of (animalRows ?? []) as Array<{ id: string; type: string }>) {
    if (row.type === "cat") totals.cat += 1;
    else if (row.type === "dog") totals.dog += 1;
  }
  return totals;
}

export async function getAdoptionMonthlyCounts(
  client: SupabaseClient,
  now: Date,
): Promise<Record<string, number>> {
  const months = trailingMonths(now);
  const counts = await Promise.all(
    months.map((m) =>
      countRows(
        client
          .from("successful_adoption")
          .select("id", { count: "exact", head: true })
          .gte("approval_date", m.start)
          .lt("approval_date", m.end),
      ),
    ),
  );
  return Object.fromEntries(months.map((m, i) => [m.month, counts[i]]));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/lib/adoptions/publicImpactRepository.server.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/adoptions/publicImpactRepository.server.ts src/lib/adoptions/publicImpactRepository.server.test.ts
git commit -m "feat: add service-role repository for the adoption-impact aggregate"
```

---

### Task 3: Orchestration layer with injectable client and clock

**Files:**
- Create: `src/lib/adoptions/publicImpact.server.ts`
- Create: `src/lib/adoptions/publicImpact.functions.ts`
- Test: `src/lib/adoptions/publicImpact.server.test.ts`

**Context:** `createSupabaseServiceClient` already exists at `src/lib/supabase.server.ts` and is re-exported from `src/lib/donations/supabase.server.ts` — the same import path `lib/content/publicStoriesPage.server.ts` uses (`import { createSupabaseServiceClient } from "../donations/supabase.server";`). Follow that exact import.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/adoptions/publicImpact.server.test.ts
import { describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { loadAdoptionImpactReport, loadAdoptionSpeciesTotals } from "./publicImpact.server";

type FakeResult = { data?: unknown[] | null; count?: number | null; error?: unknown };

function createBuilder(result: FakeResult) {
  const builder: Record<string, unknown> = {
    select() {
      return builder;
    },
    eq() {
      return builder;
    },
    gte() {
      return builder;
    },
    lt() {
      return builder;
    },
    in() {
      return builder;
    },
    then(resolve: (value: FakeResult) => void) {
      resolve(result);
    },
  };
  return builder;
}

function createFakeClient(results: Record<string, FakeResult | FakeResult[]>) {
  const cursors: Record<string, number> = {};
  return {
    from(table: string) {
      const entry = results[table];
      if (Array.isArray(entry)) {
        const i = cursors[table] ?? 0;
        cursors[table] = i + 1;
        return createBuilder(entry[i]);
      }
      return createBuilder(entry ?? { data: [], count: 0, error: null });
    },
  } as unknown as SupabaseClient;
}

describe("loadAdoptionImpactReport", () => {
  test("combines the lifetime total and monthly counts from the injected client", async () => {
    const now = new Date("2026-08-15T00:00:00.000Z");
    const monthlyResults: FakeResult[] = Array.from({ length: 12 }, (_, i) => ({
      count: i === 11 ? 5 : 0,
      error: null,
    }));
    const client = createFakeClient({
      successful_adoption: [{ count: 342, error: null }, ...monthlyResults],
    });

    const report = await loadAdoptionImpactReport(now, () => client);

    expect(report.total).toBe(342);
    expect(report.monthly.find((m) => m.month === "2026-08")?.count).toBe(5);
  });
});

describe("loadAdoptionSpeciesTotals", () => {
  test("tallies species counts from the injected client", async () => {
    const client = createFakeClient({
      successful_adoption: { data: [{ animal_id: "a1" }, { animal_id: "a2" }], error: null },
      animals: {
        data: [
          { id: "a1", type: "cat" },
          { id: "a2", type: "dog" },
        ],
        error: null,
      },
    });

    await expect(loadAdoptionSpeciesTotals(() => client)).resolves.toEqual({ cat: 1, dog: 1 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/lib/adoptions/publicImpact.server.test.ts`
Expected: FAIL — `publicImpact.server.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/adoptions/publicImpact.server.ts
import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseServiceClient } from "../donations/supabase.server";
import {
  getAdoptionLifetimeTotal,
  getAdoptionMonthlyCounts,
  getAdoptionSpeciesTotals,
} from "./publicImpactRepository.server";
import { buildAdoptionImpactReport } from "./publicImpact";
import type { AdoptionImpactReport, SpeciesTotals } from "./publicImpact";

type ClientFactory = () => SupabaseClient;

export async function loadAdoptionImpactReport(
  now: Date,
  createClient: ClientFactory = createSupabaseServiceClient,
): Promise<AdoptionImpactReport> {
  const client = createClient();
  const [total, monthlyCounts] = await Promise.all([
    getAdoptionLifetimeTotal(client),
    getAdoptionMonthlyCounts(client, now),
  ]);
  return buildAdoptionImpactReport({ total, monthlyCounts, now });
}

export async function loadAdoptionSpeciesTotals(
  createClient: ClientFactory = createSupabaseServiceClient,
): Promise<SpeciesTotals> {
  return getAdoptionSpeciesTotals(createClient());
}
```

```ts
// src/lib/adoptions/publicImpact.functions.ts
import { createServerFn } from "@tanstack/react-start";

export const getAdoptionImpactReport = createServerFn({ method: "GET" }).handler(async () => {
  const { loadAdoptionImpactReport } = await import("./publicImpact.server");
  return loadAdoptionImpactReport(new Date());
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/lib/adoptions/publicImpact.server.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Typecheck**

Run: `bunx tsc --noEmit`
Expected: no new errors. `createSupabaseServiceClient`'s real return type must satisfy `SupabaseClient` — it already does, since `src/lib/supabase.server.ts` calls `createClient(...)` from `@supabase/supabase-js` directly.

- [ ] **Step 6: Commit**

```bash
git add src/lib/adoptions/publicImpact.server.ts src/lib/adoptions/publicImpact.functions.ts src/lib/adoptions/publicImpact.server.test.ts
git commit -m "feat: wire the adoption-impact repository behind an injectable client and server fn"
```

---

### Task 4: Fix the homepage's broken adopted-count stat cards

**Files:**
- Modify: `src/lib/animals/publicImpact.functions.ts`

**Context:** Read the current file first — it queries `animals` where `status = 'adopted'` through the anon client (`../supabase`), which the RLS policy always returns empty for, so `buildPublicImpact` silently drops the two adopted-count cards. Replace only the adopted-count source; the available-count queries (anon-visible, already correct) and `buildPublicImpact` itself are untouched.

- [ ] **Step 1: Replace the implementation**

```ts
// src/lib/animals/publicImpact.functions.ts
import { createServerFn } from "@tanstack/react-start";

import { buildPublicImpact, type PublicImpactItem } from "./publicImpact";

type CountResult = { count: number | null; error: { message: string } | null };

/**
 * Read-only public projection over the anonymous client for available counts,
 * so the existing RLS policy stays authoritative there. Adopted counts come
 * from the service-role adoption-impact aggregate instead - the anon policy
 * exposes only available animals, so an anon query for status = adopted could
 * only ever return empty (defect G-04).
 */
export const getPublicImpactItems = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ items: PublicImpactItem[]; asOf: string | null }> => {
    const { supabase } = await import("../supabase");
    const { loadAdoptionSpeciesTotals } = await import("../adoptions/publicImpact.server");

    async function countAvailable(type: "cat" | "dog"): Promise<CountResult> {
      const { count, error } = await supabase
        .from("animals")
        .select("id", { count: "exact", head: true })
        .eq("type", type)
        .eq("status", "available");
      return { count: count ?? null, error: error ? { message: error.message } : null };
    }

    const [availableCats, availableDogs, adoptedTotals] = await Promise.all([
      countAvailable("cat"),
      countAvailable("dog"),
      loadAdoptionSpeciesTotals().catch(() => null),
    ]);

    const verified = (r: CountResult) => (r.error ? null : r.count);
    const asOf = new Date().toISOString();
    const items = buildPublicImpact({
      availableCats: verified(availableCats),
      availableDogs: verified(availableDogs),
      adoptedCats: adoptedTotals?.cat ?? null,
      adoptedDogs: adoptedTotals?.dog ?? null,
      asOf,
    });

    return { items, asOf: items.length ? asOf : null };
  },
);
```

- [ ] **Step 2: Run the existing pure-function tests to confirm no regression**

Run: `bun test src/lib/animals/publicImpact.test.ts`
Expected: PASS (1 test) — unchanged, since `buildPublicImpact` itself was not touched. `getPublicImpactItems` (the `createServerFn` handler) has no direct test in this codebase today, matching the existing convention for this file; its behavior is exercised indirectly through `loadAdoptionSpeciesTotals`'s own tests (Task 3) and the manual browser check in Task 6.

- [ ] **Step 3: Typecheck and lint**

```bash
bunx tsc --noEmit
bunx eslint src/lib/animals/publicImpact.functions.ts
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/animals/publicImpact.functions.ts
git commit -m "fix: source the homepage's adopted-count cards from the real aggregate"
```

---

### Task 5: Real loader and UI for `/report/adoption`

**Files:**
- Modify: `src/routes/report/adoption.tsx`
- Test: `src/routes/report/adoption.test.tsx` (new)

**Context:** Read the current file first. It has no loader today — the whole page is static, ending in a `PublicStateShell` "暫未發佈" block. Follow `src/routes/report/audit.tsx`'s established pattern exactly: `loader: resilientPublicLoader(...)`, an `errorComponent`, a thin route component branching on `result.status`, and a separate exported plain-props page component. `resilientPublicLoader` (`src/lib/routing/resilientLoader.ts`) wraps a zero-arg loader and returns `{status:"ok", data}` or `{status:"error"}` — it already discards any TanStack Router-supplied loader context, so no extra context-free wrapper is needed.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/routes/report/adoption.test.tsx
import { expect, mock, test } from "bun:test";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";

import type { AdoptionImpactReport } from "@/lib/adoptions/publicImpact";

const realReactRouter = await import("@tanstack/react-router");

mock.module("@tanstack/react-router", () => ({
  ...realReactRouter,
  createFileRoute: () => (options: unknown) => options,
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

const report: AdoptionImpactReport = {
  total: 342,
  monthly: [
    { month: "2025-09", label: "2025年9月", count: 8 },
    { month: "2025-10", label: "2025年10月", count: 5 },
    { month: "2025-11", label: "2025年11月", count: 6 },
    { month: "2025-12", label: "2025年12月", count: 4 },
    { month: "2026-01", label: "2026年1月", count: 3 },
    { month: "2026-02", label: "2026年2月", count: 7 },
    { month: "2026-03", label: "2026年3月", count: 9 },
    { month: "2026-04", label: "2026年4月", count: 6 },
    { month: "2026-05", label: "2026年5月", count: 5 },
    { month: "2026-06", label: "2026年6月", count: 4 },
    { month: "2026-07", label: "2026年7月", count: 6 },
    { month: "2026-08", label: "2026年8月", count: 5 },
  ],
  asOf: "2026-08-15T00:00:00.000Z",
};

test("renders the lifetime total and all 12 months", async () => {
  const { AdoptionImpactReportPage } = await import("./adoption");
  const html = renderToString(<AdoptionImpactReportPage report={report} />);

  expect(html).toContain("342");
  expect(html).toContain("2025年9月");
  expect(html).toContain("2026年8月");
  expect(html).not.toContain("暫未發佈");
  expect(html.match(/<h1/g) ?? []).toHaveLength(1);
});

test("renders a real verified zero without suppressing it", async () => {
  const { AdoptionImpactReportPage } = await import("./adoption");
  const zeroReport: AdoptionImpactReport = { ...report, total: 0 };
  const html = renderToString(<AdoptionImpactReportPage report={zeroReport} />);

  expect(html).toContain(">0<");
});

test("shows a distinct temporarily-unavailable state on load failure", async () => {
  const { AdoptionImpactReportLoadError } = await import("./adoption");
  const html = renderToString(<AdoptionImpactReportLoadError />);

  expect(html).toContain("暫時未能載入");
  expect(html).not.toContain("暫未發佈");
  expect(html).toContain('role="alert"');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/routes/report/adoption.test.tsx`
Expected: FAIL — `AdoptionImpactReportPage`/`AdoptionImpactReportLoadError` are not exported yet.

- [ ] **Step 3: Replace the route implementation**

```tsx
// src/routes/report/adoption.tsx
import { createFileRoute } from "@tanstack/react-router";
import { publicUrl } from "@/lib/publicOrigin";

import { PublicPageFrame } from "../../components/site/PublicPageFrame";
import { resilientPublicLoader } from "../../lib/routing/resilientLoader";
import { getAdoptionImpactReport } from "../../lib/adoptions/publicImpact.functions";
import type { AdoptionImpactReport } from "../../lib/adoptions/publicImpact";

export const Route = createFileRoute("/report/adoption")({
  loader: resilientPublicLoader(() => getAdoptionImpactReport()),
  errorComponent: AdoptionImpactReportLoadError,
  head: () => ({
    meta: [
      { title: "領養工作成效 · 香港拯救貓狗協會 HKSCDA" },
      {
        name: "description",
        content:
          "香港拯救貓狗協會累計成功領養總數及過去12個月數字，每月更新，統計口徑與資料截止日期於本頁公開。",
      },
      { property: "og:title", content: "領養工作成效 · HKSCDA" },
      { property: "og:description", content: "累計成功領養總數及過去12個月數字，每月更新。" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: publicUrl("/report/adoption") }],
  }),
  component: AdoptionReportRoute,
});

function AdoptionReportRoute() {
  const result = Route.useLoaderData();
  if (result.status === "error") return <AdoptionImpactReportLoadError />;
  return <AdoptionImpactReportPage report={result.data} />;
}

function formatAsOf(value: string) {
  return new Intl.DateTimeFormat("zh-HK", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Hong_Kong",
  }).format(new Date(value));
}

export function AdoptionImpactReportPage({ report }: { report: AdoptionImpactReport }) {
  return (
    <PublicPageFrame
      eyebrow="透明與問責"
      title="領養工作成效"
      description="我們公開領養成效的統計方式與資料來源。數字來自已完成的領養記錄，並以核准日期歸入相應月份。"
      chapters={[
        {
          eyebrow: "統計口徑",
          title: "怎樣計算一次成功領養",
          description:
            "成效數據以已完成的領養記錄為準，並以核准日期歸入相應月份；未完成、已取消或仍在跟進的個案不會計入。",
          bullets: [
            "以核准日期歸入月份，不以資料更新時間計算",
            "同一動物的重複記錄只計算一次",
            "不公開任何可識別領養者身分的資料",
          ],
        },
        {
          eyebrow: "發佈安排",
          title: "資料截止日期與更新頻率",
          description:
            "每次發佈都會標示資料截止日期與發佈日期，讓讀者知道數字對應的時間範圍；在未有核實數據前，本頁不會顯示零值或估算數字。",
        },
      ]}
      cta={{
        eyebrow: "查看其他公開資料",
        title: "年報及審計報告已經公開。",
        description: "如需了解協會的財務與工作紀錄，可先查閱已發佈的年報及審計報告。",
        action: { label: "查看年報及審計", to: "/report/audit" },
      }}
    >
      <section className="section">
        <div className="public-container">
          <div className="impact-data">
            <div>
              <strong>{report.total}</strong>
              <span>累計成功領養宗數</span>
            </div>
          </div>

          <ul className="mt-8 divide-y divide-[var(--color-border)]">
            {report.monthly.map((m) => (
              <li key={m.month} className="flex items-center justify-between py-3">
                <span className="text-[var(--color-text-muted)]">{m.label}</span>
                <span className="font-bold text-[var(--color-text)]">{m.count}</span>
              </li>
            ))}
          </ul>

          <p className="mt-4 text-sm text-[var(--color-text-muted)]">
            資料截至 {formatAsOf(report.asOf)}
          </p>
        </div>
      </section>
    </PublicPageFrame>
  );
}

export function AdoptionImpactReportLoadError() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <div
        role="alert"
        className="border border-[var(--color-border)] bg-[var(--color-surface-offset)] p-6"
      >
        <h1 className="text-lg font-bold">暫時未能載入領養成效數據</h1>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">
          請稍後再試，或電郵至{" "}
          <a className="underline" href="mailto:info@hkscda.com">
            info@hkscda.com
          </a>
          。
        </p>
        <a href="/report/adoption" className="btn-secondary mt-5 min-h-11">
          重新載入 / Retry
        </a>
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/routes/report/adoption.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Run the full test suite**

Run: `bun test --isolate`
Expected: PASS, no regressions.

- [ ] **Step 6: Typecheck and lint**

```bash
bunx tsc --noEmit
bunx eslint src/routes/report/adoption.tsx src/routes/report/adoption.test.tsx
```

Fix nothing yourself beyond a scoped, single-file `bunx prettier --write <file>` for a pure formatting issue — never `bun run format`, which reformats the entire repo.

- [ ] **Step 7: Commit**

```bash
git add src/routes/report/adoption.tsx src/routes/report/adoption.test.tsx
git commit -m "feat: publish the real adoption-impact report on /report/adoption"
```

---

### Task 6: Group gate — full verification, parity doc, and manual browser check

**Files:**
- Modify: `docs/public-route-parity.md`

- [ ] **Step 1: Update the parity table's `/report/adoption` row**

The current row reads:

```
| `/report/adoption` | WP-6 | yes | static | yes | yes |
```

Change the "Data" column from `static` to `loader`, since the route now has a real server loader:

```
| `/report/adoption` | WP-6 | yes | loader | yes | yes |
```

- [ ] **Step 2: Update the Known gaps section**

Remove this bullet (BP-1 is now done):

```
- `/report/adoption` shows an unpublished state rather than figures: the anonymous
  policy exposes only available animals, so no adoption total can be derived
  client-side. BP-1 owns the privacy-safe aggregate.
```

- [ ] **Step 3: Run the full verification gate**

```bash
bunx tsc --noEmit
bun test --isolate
bun run lint
bun run build
```

Fix nothing yourself beyond a scoped, single-file `bunx prettier --write <file>` for a pure formatting issue. Anything else that fails: STOP and report. `bun run verify:brand` requires a running preview server against a Supabase-shaped fixture — skip it if unavailable, matching the documented gap from the earlier public-route-port work.

- [ ] **Step 4: Manual browser check**

No fabricated data allowed in this check — the report reads real `successful_adoption` rows, so what it shows depends on what's actually in the connected database. Start the dev server (`bun run dev`, or the project's existing preview tooling) and verify in a real browser:

- `/report/adoption` no longer shows "暫未發佈" — it shows a real total and a 12-row month list, and the page still has exactly one `<h1>`.
- The homepage's "已領養貓貓" / "已領養狗狗" stat cards now render (previously silently absent) if the database has any adopted-cat/adopted-dog rows; if the current database genuinely has zero successful adoptions, confirm the cards still correctly stay absent (a verified zero doesn't fabricate a `0` stat card on the homepage's `buildPublicImpact`, which already drops non-positive values by design — this is expected, not a bug).
- No console errors on either page.

Report clearly what the manual check found, including the actual numbers seen (or their absence, if the database has no successful-adoption rows), since that reflects reality and isn't something to paper over.

- [ ] **Step 5: Commit**

```bash
git add docs/public-route-parity.md
git commit -m "docs: mark /report/adoption's real adoption-impact loader in the parity record"
```
