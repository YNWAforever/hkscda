import { describe, expect, test } from "bun:test";

import {
  animalCandidateLabel,
  animalCandidatesPath,
  animalCandidatesFrom,
} from "./animalCandidates";

describe("animal candidate search", () => {
  test("BUG-44: the picker searches the candidates route with a trimmed, encoded query", () => {
    expect(animalCandidatesPath("")).toBe("/api/admin/sponsorships/animals?q=");
    expect(animalCandidatesPath("  小白 & co  ")).toBe(
      "/api/admin/sponsorships/animals?q=%E5%B0%8F%E7%99%BD%20%26%20co",
    );
    // The route refuses a query over 100 characters, so the picker never sends one.
    expect(animalCandidatesPath("a".repeat(150))).toBe(
      `/api/admin/sponsorships/animals?q=${"a".repeat(100)}`,
    );
  });

  test("BUG-44: the route's RPC rows become candidates, and anything else none", () => {
    const row = {
      id: "11111111-2222-4333-8444-555555555555",
      name: "小白",
      name_en: "Snowy",
      code: "D-012",
      image_url: null,
    };
    expect(animalCandidatesFrom({ animals: [row] })).toEqual([row]);
    expect(animalCandidatesFrom({ animals: null })).toEqual([]);
    expect(animalCandidatesFrom(undefined)).toEqual([]);
  });

  test("BUG-44: a candidate is named in the admin's language, with the other name and its code", () => {
    const animal = { id: "a", name: "小白", name_en: "Snowy", code: "D-012", image_url: null };
    expect(animalCandidateLabel(animal, "zh")).toBe("小白 / Snowy · D-012");
    expect(animalCandidateLabel(animal, "en")).toBe("Snowy / 小白 · D-012");
    expect(animalCandidateLabel({ ...animal, name_en: null, code: null }, "en")).toBe("小白");
  });
});
