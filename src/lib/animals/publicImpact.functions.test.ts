import { describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { resolvePublicImpactItems } from "./publicImpact.functions";

// resolvePublicImpactItems calls supabase.from("animals") twice concurrently
// (once per species, via Promise.all) -- from() must hand back a FRESH query
// object with its own filter state each time, or the two calls' .eq()/.in()
// pushes land on the same shared arrays and corrupt each other's filters.
function createImpactFakeClient(data: Record<string, unknown>[]) {
  function createQuery() {
    const eqFilters: Array<[string, unknown]> = [];
    let inFilter: { column: string; values: readonly string[] } | undefined;
    const query = {
      select: () => query,
      eq: (column: string, value: unknown) => {
        eqFilters.push([column, value]);
        return query;
      },
      in: (column: string, values: readonly string[]) => {
        inFilter = { column, values };
        return query;
      },
      is: async () => {
        const matched = data.filter((row) => {
          const passesEq = eqFilters.every(([column, value]) => row[column] === value);
          const passesIn = !inFilter || inFilter.values.includes(row[inFilter.column] as string);
          return passesEq && passesIn;
        });
        return { count: matched.length, error: null };
      },
    };
    return query;
  }
  return { from: () => createQuery() } as unknown as SupabaseClient;
}

describe("resolvePublicImpactItems", () => {
  test("counts fostered cats and dogs as available, not just status='available'", async () => {
    const data = [
      { type: "cat", status: "available", adoption_eligible: true, retired_at: null },
      { type: "cat", status: "fostered", adoption_eligible: true, retired_at: null },
      { type: "cat", status: "adopted", adoption_eligible: true, retired_at: null },
      { type: "dog", status: "fostered", adoption_eligible: true, retired_at: null },
    ];

    const { items } = await resolvePublicImpactItems({
      supabase: createImpactFakeClient(data),
      loadAdoptionSpeciesTotals: async () => ({ cat: 0, dog: 0 }),
    });

    expect(items.find((item) => item.label === "待領養貓貓")?.value).toBe(2);
    expect(items.find((item) => item.label === "待領養狗狗")?.value).toBe(1);
  });
});
