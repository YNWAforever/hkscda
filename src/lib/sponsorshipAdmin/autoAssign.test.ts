import { describe, expect, test } from "bun:test";

import { isAssignable, selectAutoAssignAnimal } from "./autoAssign";
import type { PreferenceCandidate } from "./autoAssign";

function candidate(overrides: Partial<PreferenceCandidate> = {}): PreferenceCandidate {
  return {
    rank: 1,
    animalId: "11111111-2222-4333-8444-555555555555",
    animalNameSnapshot: "小白",
    animal: {
      sponsorshipEligible: true,
      status: "available",
      retiredAt: null,
      publicationState: "published",
      deceasedAt: null,
    },
    ...overrides,
  };
}

const baseAnimal = candidate().animal!;

describe("isAssignable", () => {
  test("accepts an eligible, published, living animal", () => {
    expect(isAssignable(candidate())).toBe(true);
  });

  test("accepts a FOSTERED animal", () => {
    // A fostered animal is in temporary care and still needs a sponsor.
    // Naming the excluded state beats requiring a single permitted one.
    expect(isAssignable(candidate({ animal: { ...baseAnimal, status: "fostered" } }))).toBe(true);
  });

  test("rejects an adopted animal", () => {
    expect(isAssignable(candidate({ animal: { ...baseAnimal, status: "adopted" } }))).toBe(false);
  });

  test("rejects a deceased animal", () => {
    // Death is recorded on animal_profile_internal, not on animals.status,
    // which has no 'deceased' value at all.
    expect(isAssignable(candidate({ animal: { ...baseAnimal, deceasedAt: "2026-08-01" } }))).toBe(
      false,
    );
  });

  test("rejects a retired record", () => {
    expect(
      isAssignable(candidate({ animal: { ...baseAnimal, retiredAt: "2026-08-01T00:00:00.000Z" } })),
    ).toBe(false);
  });

  test("rejects an animal withdrawn from the sponsorship programme", () => {
    expect(isAssignable(candidate({ animal: { ...baseAnimal, sponsorshipEligible: false } }))).toBe(
      false,
    );
  });

  test("rejects an unpublished animal", () => {
    // Opening a new public-facing commitment against a withheld profile is
    // wrong, even though withholding never ENDS an existing assignment.
    expect(isAssignable(candidate({ animal: { ...baseAnimal, publicationState: "draft" } }))).toBe(
      false,
    );
  });

  test("rejects a name-only wish with no animal", () => {
    expect(isAssignable(candidate({ animalId: null, animal: null }))).toBe(false);
  });

  test("rejects a preference whose animal row could not be read", () => {
    expect(isAssignable(candidate({ animal: null }))).toBe(false);
  });
});

describe("selectAutoAssignAnimal", () => {
  test("returns null when there are no preferences", () => {
    expect(selectAutoAssignAnimal([])).toBeNull();
  });

  test("takes the lowest rank, which is the supporter's first choice", () => {
    const second = candidate({ rank: 2, animalId: "a-2", animalNameSnapshot: "阿花" });
    const first = candidate({ rank: 1, animalId: "a-1", animalNameSnapshot: "小白" });
    expect(selectAutoAssignAnimal([second, first])?.animalId).toBe("a-1");
  });

  test("skips ineligible choices and takes the next the supporter wanted", () => {
    const first = candidate({
      rank: 1,
      animalId: "a-1",
      animal: { ...baseAnimal, status: "adopted" },
    });
    const second = candidate({ rank: 2, animalId: "a-2" });
    expect(selectAutoAssignAnimal([first, second])?.animalId).toBe("a-2");
  });

  test("returns null when nothing on the shortlist is assignable", () => {
    // The pledge then shows as active with no animal, which the attention
    // query surfaces for staff. It must NOT fall back to an arbitrary animal.
    const all = [
      candidate({ rank: 1, animal: { ...baseAnimal, status: "adopted" } }),
      candidate({ rank: 2, animal: { ...baseAnimal, deceasedAt: "2026-08-01" } }),
    ];
    expect(selectAutoAssignAnimal(all)).toBeNull();
  });

  test("does not mutate or reorder the caller's list", () => {
    const list = [candidate({ rank: 3, animalId: "c" }), candidate({ rank: 1, animalId: "a" })];
    selectAutoAssignAnimal(list);
    expect(list.map((c) => c.animalId)).toEqual(["c", "a"]);
  });
});
