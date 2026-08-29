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
    limit() {
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
      successful_adoption: [
        { count: 2, error: null },
        { data: [{ animal_id: "a1" }, { animal_id: "a2" }], error: null },
      ],
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
