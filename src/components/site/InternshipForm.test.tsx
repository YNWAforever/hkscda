import { describe, expect, test } from "bun:test";
import { resolveAvailableShelter } from "./resolveInternshipShelter";

describe("internship shelter selection", () => {
  test("submits the only published shelter when the default is unavailable", () => {
    expect(resolveAvailableShelter("cat", ["dog"])).toBe("dog");
  });

  test("keeps a valid user choice and follows later published options", () => {
    expect(resolveAvailableShelter("dog", ["cat", "dog"])).toBe("dog");
    expect(resolveAvailableShelter("dog", ["cat"])).toBe("cat");
    expect(resolveAvailableShelter("dog", [])).toBe("");
  });
});
