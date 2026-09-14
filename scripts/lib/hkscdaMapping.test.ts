import { describe, expect, test } from "bun:test";

import {
  animalKey,
  collectDbNotListed,
  matchSourceToAnimals,
  normalizeName,
  STATUS,
} from "./hkscdaMapping.mjs";

const source = (over: Partial<Record<string, unknown>> = {}) => ({
  sourceId: "5309",
  type: "cat",
  name: "芝麻  Sesame",
  photoPath: "/HKSCDA/storage/app/public/animals/a.jpeg",
  ...over,
});

const animal = (over: Partial<Record<string, unknown>> = {}) => ({
  id: "id-1",
  type: "cat",
  name: "芝麻 Sesame",
  retired_at: null,
  image_url: null,
  ...over,
});

describe("normalizeName", () => {
  test("trims, collapses whitespace, applies NFKC and casefolds Latin", () => {
    expect(normalizeName("  Sesame   芝麻 ")).toBe("sesame 芝麻");
    expect(normalizeName("COICOI")).toBe("coicoi");
    expect(normalizeName("ＣＯＩＣＯＩ")).toBe("coicoi");
  });

  test("returns an empty string for non-strings", () => {
    expect(normalizeName(null)).toBe("");
    expect(normalizeName(undefined)).toBe("");
    expect(normalizeName(42)).toBe("");
  });
});

describe("matchSourceToAnimals", () => {
  test("matches a live animal to the unique active record with the same type and name", () => {
    const results = matchSourceToAnimals([source()], [animal()]);
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe(STATUS.MATCHED);
    expect(results[0].animalId).toBe("id-1");
  });

  test("ignores retired records", () => {
    const results = matchSourceToAnimals([source()], [animal({ retired_at: "2026-01-01" })]);
    expect(results[0].status).toBe(STATUS.UNMATCHED);
  });

  test("does not match across species", () => {
    const results = matchSourceToAnimals([source()], [animal({ type: "dog" })]);
    expect(results[0].status).toBe(STATUS.UNMATCHED);
  });

  test("flags a duplicate name as ambiguous and lists the candidate ids", () => {
    const animals = [animal({ id: "id-1" }), animal({ id: "id-2" })];
    const results = matchSourceToAnimals([source()], animals);
    expect(results[0].status).toBe(STATUS.AMBIGUOUS);
    expect(results[0].candidates).toEqual(["id-1", "id-2"]);
  });

  test("skips a unique match that already has a photo", () => {
    const results = matchSourceToAnimals([source()], [animal({ image_url: "https://x/y.jpg" })]);
    expect(results[0].status).toBe(STATUS.SKIPPED_ALREADY_IMAGED);
  });

  test("an override wins over name matching", () => {
    const animals = [animal({ id: "id-1", name: "different" }), animal({ id: "id-2" })];
    const results = matchSourceToAnimals([source()], animals, new Map([["5309", "id-1"]]));
    expect(results[0].status).toBe(STATUS.OVERRIDE);
    expect(results[0].animalId).toBe("id-1");
  });

  test("an override to an already-imaged target is still skipped, not overwritten", () => {
    const animals = [animal({ id: "id-1", image_url: "https://x/y.jpg" })];
    const results = matchSourceToAnimals([source()], animals, new Map([["5309", "id-1"]]));
    expect(results[0].status).toBe(STATUS.SKIPPED_ALREADY_IMAGED);
  });

  test("an override to an unknown id is unmatched", () => {
    const results = matchSourceToAnimals([source()], [animal()], new Map([["5309", "nope"]]));
    expect(results[0].status).toBe(STATUS.UNMATCHED);
    expect(results[0].reason).toBe("override-missing");
  });

  test("includeAlreadyImaged matches an already-imaged unique record instead of skipping", () => {
    const results = matchSourceToAnimals(
      [source()],
      [animal({ image_url: "https://x/y.jpg" })],
      new Map(),
      { includeAlreadyImaged: true },
    );
    expect(results[0].status).toBe(STATUS.MATCHED);
    expect(results[0].animalId).toBe("id-1");
  });

  test("includeAlreadyImaged matches an already-imaged override", () => {
    const results = matchSourceToAnimals(
      [source()],
      [animal({ id: "id-1", image_url: "https://x/y.jpg" })],
      new Map([["5309", "id-1"]]),
      { includeAlreadyImaged: true },
    );
    expect(results[0].status).toBe(STATUS.OVERRIDE);
  });
});

describe("collectDbNotListed", () => {
  test("returns active animals not referenced by any match or candidate", () => {
    const animals = [animal({ id: "id-1" }), animal({ id: "id-2", name: "other" })];
    const results = matchSourceToAnimals([source()], animals);
    const missing = collectDbNotListed(animals, results);
    expect(missing.map((m) => m.animalId)).toEqual(["id-2"]);
  });

  test("excludes candidates of an ambiguous match", () => {
    const animals = [animal({ id: "id-1" }), animal({ id: "id-2" })];
    const results = matchSourceToAnimals([source()], animals);
    expect(collectDbNotListed(animals, results)).toEqual([]);
  });
});
