import { describe, expect, test } from "bun:test";

import {
  adminAnimalFilter,
  isAdminSectionMember,
  needsSpeciesVerification,
} from "./adminCatalogue";
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

describe("retiring the legacy 'sponsor' species", () => {
  test("flags exactly the rows a human still has to assign a species to", () => {
    expect(needsSpeciesVerification({ type: "sponsor" })).toBe(true);
    expect(needsSpeciesVerification({ type: "cat" })).toBe(false);
    expect(needsSpeciesVerification({ type: "dog" })).toBe(false);
  });

  test("a corrected animal keeps its sponsorship membership", () => {
    // Species and programme are different questions. Correcting a record's
    // species says nothing about which catalogues it belongs to, so the
    // corrected animal must remain exactly as sponsorship-eligible as before.
    //
    // Until migration 20260911150000 the membership trigger rewrote both flags
    // on a species change, so this correction silently set
    // sponsorship_eligible=false and removed the animal from the sponsorship
    // catalogue -- possibly one people were already paying for. Verified
    // against real Postgres in
    // docs/evidence/hkscda-revision/05-phase2-species-retirement-2026-09-11.md.
    const before = animal({
      type: "sponsor",
      adoption_eligible: false,
      sponsorship_eligible: true,
    });
    const afterCorrection = { ...before, type: "cat" as const };

    expect(needsSpeciesVerification(before)).toBe(true);
    expect(needsSpeciesVerification(afterCorrection)).toBe(false);

    // Still in the sponsorship catalogue, on both sides.
    expect(isAdminSectionMember(afterCorrection, "sponsor")).toBe(true);
    expect(isPublicAnimalMember(afterCorrection, "sponsor")).toBe(true);
    // And now reachable under its real species too.
    expect(isAdminSectionMember(afterCorrection, "cat")).toBe(true);
  });

  test("species is never guessed from a name", () => {
    // Nothing in the record says whether a sponsor-typed animal is a cat or a
    // dog. The predicate reports that a decision is needed; it does not make one.
    const unknown = animal({ type: "sponsor", name: "小白" });
    expect(needsSpeciesVerification(unknown)).toBe(true);
    expect(isAdminSectionMember(unknown, "cat")).toBe(false);
    expect(isAdminSectionMember(unknown, "dog")).toBe(false);
  });
});
