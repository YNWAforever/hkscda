import { afterAll, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";

// Spread into a new object, not a bare reference -- bun's mock.module mutates
// the shared module namespace in place, so a bare reference would be mutated
// out from under us the moment the mock below is installed, and afterAll's
// "restore" would silently restore the already-mocked object. See 23566de
// and 4480fdb for the two prior times this exact bug was fixed in this repo.
const realSupabaseModule = { ...(await import("../supabase")) };
const realPublicImpactServerModule = { ...(await import("../adoptions/publicImpact.server")) };

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

afterAll(() => {
  mock.module("../supabase", () => realSupabaseModule);
  mock.module("../adoptions/publicImpact.server", () => realPublicImpactServerModule);
});

describe("resolvePublicImpactItems", () => {
  test("counts fostered cats and dogs as available, not just status='available'", async () => {
    const data = [
      { type: "cat", status: "available", adoption_eligible: true, retired_at: null },
      { type: "cat", status: "fostered", adoption_eligible: true, retired_at: null },
      { type: "cat", status: "adopted", adoption_eligible: true, retired_at: null },
      { type: "dog", status: "fostered", adoption_eligible: true, retired_at: null },
    ];
    mock.module("../supabase", () => ({ supabase: createImpactFakeClient(data) }));
    mock.module("../adoptions/publicImpact.server", () => ({
      loadAdoptionSpeciesTotals: async () => ({ cat: 0, dog: 0 }),
    }));
    const { resolvePublicImpactItems } = await import("./publicImpact.functions");

    const { items } = await resolvePublicImpactItems();

    expect(items.find((item) => item.label === "待領養貓貓")?.value).toBe(2);
    expect(items.find((item) => item.label === "待領養狗狗")?.value).toBe(1);
  });
});
