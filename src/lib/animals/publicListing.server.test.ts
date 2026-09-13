import { afterAll, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";

// Spread into a plain object: mock.module mutates the shared module-registry
// exports object in place, so a bare reference captured here would be
// mutated out from under us the moment the mock below is installed.
const realSupabaseModule = { ...(await import("../supabase")) };

function createListingFakeClient(data: Record<string, unknown>[]) {
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
    is: () => query,
    order: () => query,
    range: async () => {
      const filtered = data.filter((row) => {
        const passesEq = eqFilters.every(([column, value]) => row[column] === value);
        const passesIn = !inFilter || inFilter.values.includes(row[inFilter.column] as string);
        return passesEq && passesIn;
      });
      return { data: filtered, error: null };
    },
  };
  return { from: () => query } as unknown as SupabaseClient;
}

const baseAnimal = {
  name: "Test",
  name_en: null,
  gender: "female" as const,
  age: "約 2 歲",
  age_en: null,
  description: null,
  description_en: null,
  notes: null,
  notes_en: null,
  image_url: null,
  created_at: "2026-08-01T00:00:00.000Z",
  updated_at: "2026-08-01T00:00:00.000Z",
  adoption_eligible: true,
  sponsorship_eligible: true,
  retired_at: null,
  publication_state: "published",
  public_profile: null,
};

afterAll(() => {
  mock.module("../supabase", () => realSupabaseModule);
});

describe("readPublicAnimals", () => {
  test("includes fostered cats alongside available ones, excludes adopted", async () => {
    const data = [
      { ...baseAnimal, id: "shelter", type: "cat", status: "available" },
      { ...baseAnimal, id: "foster", type: "cat", status: "fostered" },
      { ...baseAnimal, id: "gone", type: "cat", status: "adopted" },
    ];
    mock.module("../supabase", () => ({ supabase: createListingFakeClient(data) }));
    const { readPublicAnimals } = await import("./publicListing.server");

    const result = await readPublicAnimals({ type: "cat", genderFilter: "all" });

    expect(result.map((a) => a.id).sort()).toEqual(["foster", "shelter"]);
  });
});
