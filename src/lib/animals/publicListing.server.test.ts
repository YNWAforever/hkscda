import { afterAll, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";

// Spread into a plain object: mock.module mutates the shared module-registry
// exports object in place, so a bare reference captured here would be
// mutated out from under us the moment the mock below is installed.
const realSupabaseModule = { ...(await import("../supabase")) };

function createListingFakeClient(
  data: Record<string, unknown>[],
  missingGallery = false,
  serverRowCap?: number,
) {
  const eqFilters: Array<[string, unknown]> = [];
  let inFilter: { column: string; values: readonly string[] } | undefined;
  let columns = "";
  const query = {
    select: (value: string) => {
      columns = value;
      return query;
    },
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
    range: async (from: number, to: number) => {
      if (missingGallery && columns.split(",").includes("gallery"))
        return {
          data: null,
          error: { code: "42703", message: "column animals.gallery does not exist" },
        };
      const filtered = data.filter((row) => {
        const passesEq = eqFilters.every(([column, value]) => row[column] === value);
        const passesIn = !inFilter || inFilter.values.includes(row[inFilter.column] as string);
        return passesEq && passesIn;
      });
      return {
        data: filtered.slice(from, Math.min(to + 1, from + (serverRowCap ?? to - from + 1))),
        error: null,
      };
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
  test("reads later animals when the server caps each response below the requested batch", async () => {
    const rows = Array.from({ length: 3 }, (_, index) => ({
      ...baseAnimal,
      id: `animal-${index}`,
      type: "cat",
      status: "available",
    }));
    mock.module("../supabase", () => ({ supabase: createListingFakeClient(rows, false, 2) }));
    const { readPublicAnimals } = await import("./publicListing.server");

    const result = await readPublicAnimals({ type: "cat", genderFilter: "all" });

    expect(result.map((animal) => animal.id)).toEqual(["animal-0", "animal-1", "animal-2"]);
  });

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

test("reads published legacy photos before gallery migration without including drafts", async () => {
  const rows = [
    {
      ...baseAnimal,
      id: "visible",
      type: "cat",
      status: "available",
      image_url: "https://example.invalid/real-cat.jpg",
    },
    { ...baseAnimal, id: "draft", type: "cat", status: "available", publication_state: "draft" },
  ];
  mock.module("../supabase", () => ({ supabase: createListingFakeClient(rows, true) }));
  const { readPublicAnimals } = await import("./publicListing.server");
  const result = await readPublicAnimals({ type: "cat", genderFilter: "all" });
  expect(result.map((a) => a.id)).toEqual(["visible"]);
  expect(result[0].image_url).toBe(rows[0].image_url);
  expect(result[0].gallery).toEqual([]);
});
