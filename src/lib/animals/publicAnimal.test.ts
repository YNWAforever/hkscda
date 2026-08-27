import { describe, expect, test } from "bun:test";

import { isPublicAnimalId } from "./publicAnimal";

describe("isPublicAnimalId", () => {
  test("accepts a well-formed uuid in either case", () => {
    expect(isPublicAnimalId("3f2504e0-4f89-11d3-9a0c-0305e82c3301")).toBe(true);
    expect(isPublicAnimalId("3F2504E0-4F89-11D3-9A0C-0305E82C3301")).toBe(true);
  });

  test("rejects ids Postgres would reject with 22P02", () => {
    // The brand verifier probes this literal when a listing has no rows to
    // discover, and it previously produced a 500 rather than the missing state.
    expect(isPublicAnimalId("__brand-verification__")).toBe(false);
    expect(isPublicAnimalId("")).toBe(false);
    expect(isPublicAnimalId("not-a-uuid")).toBe(false);
    expect(isPublicAnimalId("3f2504e04f8911d39a0c0305e82c3301")).toBe(false);
    expect(isPublicAnimalId("3f2504e0-4f89-11d3-9a0c-0305e82c330")).toBe(false);
    expect(isPublicAnimalId("3f2504e0-4f89-11d3-9a0c-0305e82c3301x")).toBe(false);
    expect(isPublicAnimalId("' or 1=1--")).toBe(false);
  });
});
