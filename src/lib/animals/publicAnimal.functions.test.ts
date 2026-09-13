import { describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { resolvePublicAnimal } from "./publicAnimal.functions";

function createAnimalFakeClient(data: Record<string, unknown>[], missingGallery = false) {
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
    maybeSingle: async () => {
      if (missingGallery && columns.split(",").includes("gallery"))
        return {
          data: null,
          error: { code: "42703", message: "column animals.gallery does not exist" },
        };
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
      publication_state: "published",
      public_profile: null,
    };

    const result = await resolvePublicAnimal(
      { id: "12345678-1234-1234-1234-123456789012", type: "cat" },
      { supabase: createAnimalFakeClient([fosterCat]) },
    );

    expect(result?.id).toBe("12345678-1234-1234-1234-123456789012");
  });
});

test("resolves a published detail before gallery migration", async () => {
  const id = "12345678-1234-1234-1234-123456789012";
  const result = await resolvePublicAnimal(
    { id, type: "dog" },
    {
      supabase: createAnimalFakeClient(
        [
          {
            id,
            type: "dog",
            status: "available",
            publication_state: "published",
            adoption_eligible: true,
            image_url: "https://example.invalid/real-dog.jpg",
          },
        ],
        true,
      ),
    },
  );
  expect(result?.id).toBe(id);
  expect(result?.gallery).toEqual([]);
});
