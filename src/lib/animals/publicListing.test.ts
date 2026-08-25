import { describe, expect, test } from "bun:test";

import type { Animal } from "../../types/animal";
import { buildPublicAnimalListing } from "./publicListing";

function animal(
  id: string,
  input: Partial<Pick<Animal, "type" | "gender" | "age" | "status" | "created_at">> = {},
): Animal {
  return {
    id,
    type: input.type ?? "cat",
    name: id,
    name_en: null,
    gender: input.gender ?? "female",
    age: input.age ?? "約 2 歲",
    age_en: null,
    description: null,
    description_en: null,
    notes: null,
    notes_en: null,
    status: input.status ?? "available",
    image_url: null,
    created_at: input.created_at ?? "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
  };
}

describe("buildPublicAnimalListing", () => {
  test("filters the full result set before calculating totals and pagination", () => {
    const animals = [
      animal("c", { gender: "male", age: "約 3 歲", created_at: "2026-08-03T00:00:00Z" }),
      animal("b", { gender: "male", age: "約 10 歲", created_at: "2026-08-02T00:00:00Z" }),
      animal("a", { gender: "female", age: "約 4 歲", created_at: "2026-08-01T00:00:00Z" }),
      animal("d", { type: "dog", gender: "male", age: "約 2 歲" }),
      animal("e", { gender: "male", age: "約 2 歲", status: "adopted" }),
    ];

    const result = buildPublicAnimalListing({
      animals,
      type: "cat",
      ageFilter: "adult",
      genderFilter: "male",
      page: 1,
      pageSize: 1,
    });

    expect(result.total).toBe(1);
    expect(result.totalPages).toBe(1);
    expect(result.animals.map(({ id }) => id)).toEqual(["c"]);
  });

  test("recognises Chinese and English month ages as 幼年 and keeps a stable tie-break", () => {
    const animals = [
      animal("b", { age: "About 9 months old" }),
      animal("a", { age: "約 8 個月" }),
      animal("c", { age: "約 8 歲" }),
    ];

    const result = buildPublicAnimalListing({
      animals,
      type: "cat",
      ageFilter: "bb",
      genderFilter: "all",
      page: 1,
      pageSize: 16,
    });

    expect(result.animals.map(({ id }) => id)).toEqual(["a", "b"]);
  });

  test("slices only after stable sorting and reports a no-more-pages result", () => {
    const animals = [
      animal("c"),
      animal("a"),
      animal("b"),
    ];

    const secondPage = buildPublicAnimalListing({
      animals,
      type: "cat",
      ageFilter: "all",
      genderFilter: "all",
      page: 2,
      pageSize: 2,
    });
    const beyondLastPage = buildPublicAnimalListing({
      animals,
      type: "cat",
      ageFilter: "all",
      genderFilter: "all",
      page: 3,
      pageSize: 2,
    });

    expect(secondPage.animals.map(({ id }) => id)).toEqual(["c"]);
    expect(secondPage.total).toBe(3);
    expect(beyondLastPage.animals).toEqual([]);
    expect(beyondLastPage.totalPages).toBe(2);
  });
});
