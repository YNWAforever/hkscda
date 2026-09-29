import { describe, expect, test } from "bun:test";

import type { Animal } from "../../types/animal";
import { parseAgeFilter } from "../../types/animal";
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
    const animals = [animal("c"), animal("a"), animal("b")];

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

test("searches codes and nullable profile facts before pagination", () => {
  const animals = Array.from({ length: 40 }, (_, index) => ({
    ...animal(String(index).padStart(2, "0")),
    public_profile: {
      code: `CAT-${index}`,
      birthday: null,
      neutered: index % 2 === 0 ? true : null,
      suitability: "newbie" as const,
      personality: null,
      health: null,
      story: null,
      recordDate: null,
    },
  }));
  const input = {
    animals,
    type: "cat" as const,
    ageFilter: "all" as const,
    genderFilter: "all" as const,
    page: 2,
    pageSize: 5,
    q: " cat- ",
    neutered: "unknown" as const,
    suitability: "newbie" as const,
  };
  const result = buildPublicAnimalListing(input);
  expect(result.total).toBe(20);
  expect(result.animals.map(({ id }) => id)).toEqual(["11", "13", "15", "17", "19"]);
  expect(
    buildPublicAnimalListing({ ...input, q: "CAT-39", page: 1 }).animals.map(({ id }) => id),
  ).toEqual(["39"]);
  expect(buildPublicAnimalListing({ ...input, neutered: "no" }).total).toBe(0);
});

test("keeps absent profiles unknown, trims search, and combines facts with membership", () => {
  const animals = [
    animal("a"),
    { ...animal("b"), name_en: "Snowy", retired_at: "2026-01-01" },
    animal("c", { type: "dog" }),
  ];
  const input = {
    animals,
    type: "cat" as const,
    ageFilter: "all" as const,
    genderFilter: "all" as const,
    page: 1,
    pageSize: 1,
    q: "  ",
    neutered: "unknown" as const,
    suitability: "unknown" as const,
  };
  expect(buildPublicAnimalListing(input).animals.map(({ id }) => id)).toEqual(["a"]);
  expect(buildPublicAnimalListing({ ...input, q: "sNoWy" }).total).toBe(0);
  expect(buildPublicAnimalListing({ ...input, neutered: "no" }).total).toBe(0);
});

test("does not invent adult age for an unknown birthday and age", () => {
  const result = buildPublicAnimalListing({
    animals: [animal("unknown", { age: "不詳" }), animal("adult")],
    type: "cat",
    ageFilter: "adult",
    genderFilter: "all",
    page: 1,
    pageSize: 15,
  });
  expect(result.animals.map(({ id }) => id)).toEqual(["adult"]);
});

test("includes fostered animals alongside available ones, still excludes adopted", () => {
  const animals = [
    animal("shelter-cat", { status: "available" }),
    animal("foster-cat", { status: "fostered" }),
    animal("adopted-cat", { status: "adopted" }),
  ];

  const result = buildPublicAnimalListing({
    animals,
    type: "cat",
    ageFilter: "all",
    genderFilter: "all",
    page: 1,
    pageSize: 10,
  });

  expect(result.animals.map(({ id }) => id).sort()).toEqual(["foster-cat", "shelter-cat"]);
  expect(result.total).toBe(2);
});

test("featured listing filters missing photos before its two-animal page", () => {
  const animals = [
    animal("a"),
    animal("b"),
    { ...animal("c"), image_url: "/real-cat-c.jpg" },
    { ...animal("d"), image_url: "/real-cat-d.jpg" },
  ];
  const input = {
    animals,
    type: "cat" as const,
    ageFilter: "all" as const,
    genderFilter: "all" as const,
    page: 1,
    pageSize: 2,
    withPhoto: true,
  };
  const result = buildPublicAnimalListing(input);
  expect(result.animals.map(({ id }) => id)).toEqual(["c", "d"]);
  expect(result.total).toBe(2);
  expect(buildPublicAnimalListing({ ...input, withPhoto: false }).total).toBe(4);
});

test("strict age normalization preserves unknown text and converts older month ages", () => {
  expect(parseAgeFilter("rescue 2026")).toBe("unknown");
  expect(parseAgeFilter("不詳")).toBe("unknown");
  expect(parseAgeFilter("18 months")).toBe("adult");
  expect(parseAgeFilter("約 8 個月")).toBe("bb");
  expect(parseAgeFilter("約 10 歲")).toBe("senior");
});
