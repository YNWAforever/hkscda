import { describe, expect, test } from "bun:test";

import { adminAnimalFilter, isAdminSectionMember } from "./adminCatalogue";
import { isPublicAnimalMember } from "./publicListing";
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

describe("adminAnimalFilter", () => {
  test("treats sponsor as a programme, not a species", () => {
    expect(adminAnimalFilter("sponsor")).toEqual({
      column: "sponsorship_eligible",
      value: true,
    });
  });

  test("treats cat and dog as species", () => {
    expect(adminAnimalFilter("cat")).toEqual({ column: "type", value: "cat" });
    expect(adminAnimalFilter("dog")).toEqual({ column: "type", value: "dog" });
  });
});

describe("admin and public sponsorship membership agree", () => {
  test("a sponsorship-eligible cat is reachable from both sides", () => {
    // The defect: admin filtered `.eq("type", section)`, so this animal was
    // listed publicly at /sponsors but staff could not find it under
    // /admin?section=sponsor and therefore could not edit what visitors saw.
    const sponsoredCat = animal({ type: "cat", sponsorship_eligible: true });

    expect(isPublicAnimalMember(sponsoredCat, "sponsor")).toBe(true);
    expect(isAdminSectionMember(sponsoredCat, "sponsor")).toBe(true);
  });

  test("a legacy type=sponsor row stays reachable under the sponsor section", () => {
    // Retiring the legacy species value is a separate data migration; until
    // then the 20260906162436 backfill leaves these rows sponsorship_eligible.
    const legacy = animal({
      type: "sponsor",
      adoption_eligible: false,
      sponsorship_eligible: true,
    });

    expect(isPublicAnimalMember(legacy, "sponsor")).toBe(true);
    expect(isAdminSectionMember(legacy, "sponsor")).toBe(true);
  });

  test("a cat that is not sponsorship-eligible is in neither sponsor list", () => {
    const plainCat = animal({ type: "cat", sponsorship_eligible: false });

    expect(isPublicAnimalMember(plainCat, "sponsor")).toBe(false);
    expect(isAdminSectionMember(plainCat, "sponsor")).toBe(false);
  });

  test("an animal can be in both programmes at once", () => {
    const both = animal({ type: "dog", adoption_eligible: true, sponsorship_eligible: true });

    expect(isPublicAnimalMember(both, "dog")).toBe(true);
    expect(isPublicAnimalMember(both, "sponsor")).toBe(true);
    expect(isAdminSectionMember(both, "dog")).toBe(true);
    expect(isAdminSectionMember(both, "sponsor")).toBe(true);
  });
});

describe("species sections are not narrowed by adoption eligibility", () => {
  test("staff still see a cat that is currently not offered for adoption", () => {
    // Staff maintain every animal of a species, including ones withdrawn from
    // the public catalogue -- otherwise a record cannot be corrected back into
    // it. The public side does apply the eligibility filter.
    const withdrawn = animal({ type: "cat", adoption_eligible: false });

    expect(isAdminSectionMember(withdrawn, "cat")).toBe(true);
    expect(isPublicAnimalMember(withdrawn, "cat")).toBe(false);
  });
});
