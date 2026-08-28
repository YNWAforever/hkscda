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

    const selects = client.calls.filter((c) => (c as { name: string }).name === "select");
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
