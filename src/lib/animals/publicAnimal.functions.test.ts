import { afterAll, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";

// Spread into a new object, not a bare reference -- bun's mock.module mutates
// the shared module namespace in place, so a bare reference would be mutated
// out from under us the moment the mock below is installed, and afterAll's
// "restore" would silently restore the already-mocked object. See 23566de
// and 4480fdb for the two prior times this exact bug was fixed in this repo.
const realSupabaseModule = { ...(await import("../supabase")) };

function createAnimalFakeClient(data: Record<string, unknown>[]) {
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
    maybeSingle: async () => {
      const match = data.find((row) => {
        const passesEq = eqFilters.every(([column, value]) => row[column] === value);
        const passesIn = !inFilter || inFilter.values.includes(row[inFilter.column] as string);
        return passesEq && passesIn;
      });
      return { data: match ?? null, error: null };
    },
  };
  return { from: () => query } as unknown as SupabaseClient;
}

afterAll(() => {
  mock.module("../supabase", () => realSupabaseModule);
});

describe("resolvePublicAnimal", () => {
  test("finds a fostered animal by id, same as an available one", async () => {
    const fosterCat = {
      id: "12345678-1234-1234-1234-123456789012",
      type: "cat",
      name: "Mochi",
      name_en: null,
      gender: "female",
      age: "約 2 歲",
      age_en: null,
      description: null,
      description_en: null,
      notes: null,
      notes_en: null,
      status: "fostered",
      image_url: null,
      created_at: "2026-08-01T00:00:00.000Z",
      updated_at: "2026-08-01T00:00:00.000Z",
      adoption_eligible: true,
      sponsorship_eligible: true,
      retired_at: null,
      public_profile: null,
    };
    mock.module("../supabase", () => ({ supabase: createAnimalFakeClient([fosterCat]) }));
    const { resolvePublicAnimal } = await import("./publicAnimal.functions");

    const result = await resolvePublicAnimal({
      id: "12345678-1234-1234-1234-123456789012",
      type: "cat",
    });

    expect(result?.id).toBe("12345678-1234-1234-1234-123456789012");
  });
});
