import { expect, test } from "bun:test";
import { buildPublicAnimalListing } from "./publicListing";
import type { Animal } from "../../types/animal";

test("canonical species can share adoption and sponsorship membership without retired records", () => {
  const animals = [
    {
      id: "both",
      type: "cat",
      status: "available",
      adoption_eligible: true,
      sponsorship_eligible: true,
    },
    {
      id: "sponsor-only",
      type: "cat",
      status: "available",
      adoption_eligible: false,
      sponsorship_eligible: true,
    },
    {
      id: "retired",
      type: "cat",
      status: "available",
      adoption_eligible: true,
      sponsorship_eligible: true,
      retired_at: "2026-09-07",
    },
  ].map((a) => ({ ...a, created_at: "2026-09-07", age: "2" })) as Animal[];
  const input = {
    animals,
    ageFilter: "all" as const,
    genderFilter: "all" as const,
    page: 1,
    pageSize: 16,
  };
  expect(buildPublicAnimalListing({ ...input, type: "cat" }).animals.map((a) => a.id)).toEqual([
    "both",
  ]);
  const sponsors = buildPublicAnimalListing({ ...input, type: "sponsor" }).animals;
  expect(sponsors.map((a) => a.id)).toEqual(["both", "sponsor-only"]);
  expect(sponsors.every((a) => a.type === "cat")).toBe(true);
});
