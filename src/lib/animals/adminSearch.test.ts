import { describe, expect, test } from "bun:test";

import { filterAdminAnimals, isArchivedAnimal, matchesAnimalSearch } from "./adminSearch";
import type { Animal, AnimalPublicProfile } from "../../types/animal";

function profile(overrides: Partial<AnimalPublicProfile> = {}): AnimalPublicProfile {
  return {
    code: null,
    birthday: null,
    neutered: null,
    suitability: null,
    personality: null,
    health: null,
    story: null,
    recordDate: null,
    ...overrides,
  };
}

function animal(overrides: Partial<Animal> = {}): Animal {
  return {
    id: "11111111-2222-4333-8444-555555555555",
    type: "cat",
    name: "荃海棠",
    name_en: "Tsuen Hoi Tong",
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

const withCode = animal({ public_profile: profile({ code: "C3761" }) });

describe("acceptance T06 — one record, two identifiers", () => {
  test("C3761 and 荃海棠 find the same animal", () => {
    // The reference number is printed on the animal's own public page and is
    // what staff and the original site actually use, but the list matched only
    // names -- so the identifier people typed found nothing.
    expect(matchesAnimalSearch(withCode, "荃海棠")).toBe(true);
    expect(matchesAnimalSearch(withCode, "C3761")).toBe(true);

    const byName = filterAdminAnimals([withCode], "荃海棠");
    const byCode = filterAdminAnimals([withCode], "C3761");
    expect(byName).toHaveLength(1);
    expect(byCode).toHaveLength(1);
    expect(byCode[0]?.id).toBe(byName[0]?.id);
  });

  test("the English name and a partial, differently-cased code also match", () => {
    expect(matchesAnimalSearch(withCode, "Tsuen")).toBe(true);
    expect(matchesAnimalSearch(withCode, "c376")).toBe(true);
    expect(matchesAnimalSearch(withCode, "  C3761  ")).toBe(true);
  });

  test("an unrelated term matches nothing", () => {
    expect(matchesAnimalSearch(withCode, "C9999")).toBe(false);
    expect(matchesAnimalSearch(withCode, "小白")).toBe(false);
  });

  test("an empty term keeps every animal", () => {
    expect(matchesAnimalSearch(withCode, "")).toBe(true);
    expect(matchesAnimalSearch(withCode, "   ")).toBe(true);
  });

  test("a malformed stored code is not searchable, matching what the public page shows", () => {
    // Read through the public parser, so a code the public page rejects is not
    // quietly findable here either -- otherwise staff would search for
    // something no visitor can see.
    const broken = animal({ public_profile: profile({ code: "壹貳參" }) });
    expect(matchesAnimalSearch(broken, "壹貳參")).toBe(false);
    expect(matchesAnimalSearch(broken, "荃海棠")).toBe(true);
  });
});

describe("archived animals stay retrievable but out of the way", () => {
  const archived = animal({
    id: "99999999-2222-4333-8444-555555555555",
    retired_at: "2026-05-01T00:00:00.000Z",
  });

  test("are excluded by default", () => {
    expect(isArchivedAnimal(archived)).toBe(true);
    expect(filterAdminAnimals([withCode, archived], "")).toHaveLength(1);
  });

  test("are reachable when explicitly requested", () => {
    // Retiring preserves every historical foreign key, so an archived record
    // still needs correcting and its applications still point at it. Hidden by
    // default is not the same as gone.
    const all = filterAdminAnimals([withCode, archived], "", { includeArchived: true });
    expect(all).toHaveLength(2);
  });

  test("search still applies when archived records are shown", () => {
    const result = filterAdminAnimals([withCode, archived], "C3761", { includeArchived: true });
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe(withCode.id);
  });
});
