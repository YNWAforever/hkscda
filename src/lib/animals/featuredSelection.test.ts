import { describe, expect, test } from "bun:test";

import { hasDisplayablePhoto, selectFeaturedAnimals } from "./featuredSelection";
import type { Animal } from "../../types/animal";

function animal(overrides: Partial<Animal> = {}): Animal {
  return {
    id: "11111111-2222-4333-8444-555555555555",
    type: "cat",
    name: "白雪",
    name_en: null,
    gender: "female",
    age: "2",
    age_en: null,
    description: null,
    description_en: null,
    notes: null,
    notes_en: null,
    status: "available",
    image_url: null,
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
    adoption_eligible: true,
    sponsorship_eligible: false,
    retired_at: null,
    public_profile: null,
    ...overrides,
  };
}

const photographed = animal({ id: "a-with-photo", image_url: "https://cdn.test/a/v1/cici.jpg" });
const unphotographed = animal({ id: "b-no-photo", image_url: null });

describe("hasDisplayablePhoto", () => {
  test("treats null, empty and whitespace-only URLs as no photograph", () => {
    expect(hasDisplayablePhoto({ image_url: null })).toBe(false);
    expect(hasDisplayablePhoto({ image_url: "" })).toBe(false);
    expect(hasDisplayablePhoto({ image_url: "   " })).toBe(false);
  });

  test("accepts a real URL", () => {
    expect(hasDisplayablePhoto({ image_url: "https://cdn.test/a/v1/cici.jpg" })).toBe(true);
  });
});

describe("selectFeaturedAnimals", () => {
  test("features only animals with a photograph", () => {
    // At the audit only 14 of 248 animals had a photo, so featuring the first
    // few regardless meant a homepage of placeholder icons.
    const featured = selectFeaturedAnimals([unphotographed, photographed, unphotographed]);
    expect(featured.map((a) => a.id)).toEqual(["a-with-photo"]);
  });

  test("does not pad with photo-less records when there are too few", () => {
    // No fallback on purpose: quietly backfilling with exactly the records the
    // rule excludes would defeat it.
    expect(selectFeaturedAnimals([unphotographed, unphotographed], 4)).toEqual([]);
  });

  test("returns nothing rather than something misleading when no photo exists", () => {
    // The band then renders its empty state, which links to the full list, so
    // the animals remain reachable.
    expect(selectFeaturedAnimals([unphotographed])).toEqual([]);
  });

  test("respects a limit and preserves the incoming order", () => {
    const first = animal({ id: "first", image_url: "https://cdn.test/1.jpg" });
    const second = animal({ id: "second", image_url: "https://cdn.test/2.jpg" });
    expect(selectFeaturedAnimals([first, second], 1).map((a) => a.id)).toEqual(["first"]);
    expect(selectFeaturedAnimals([first, second]).map((a) => a.id)).toEqual(["first", "second"]);
  });

  test("does not remove photo-less animals from the caller's own list", () => {
    // The full directory is unaffected: this selects for the homepage band and
    // returns a new array, leaving the source list intact.
    const directory = [unphotographed, photographed];
    selectFeaturedAnimals(directory);
    expect(directory).toHaveLength(2);
  });
});
