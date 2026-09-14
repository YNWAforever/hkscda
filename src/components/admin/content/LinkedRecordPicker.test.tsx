import { describe, expect, test } from "bun:test";
import { toLinkOption } from "./LinkedRecordPicker";

describe("toLinkOption", () => {
  test("maps a search result to a pickable option", () => {
    expect(toLinkOption({ id: "a1", label: "Milo", sublabel: "cat" })).toEqual({
      id: "a1",
      label: "Milo",
      sublabel: "cat",
    });
  });
  test("falls back to an empty sublabel", () => {
    expect(toLinkOption({ id: "a1", label: "Milo", sublabel: null }).sublabel).toBe("");
  });
});
