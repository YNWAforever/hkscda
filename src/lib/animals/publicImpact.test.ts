import { describe, expect, test } from "bun:test";
import { buildPublicImpact } from "./publicImpact";

describe("buildPublicImpact", () => {
  test("returns only positive database-backed counts with a Hong Kong data date", () => {
    const items = buildPublicImpact({
      availableCats: 12,
      availableDogs: 5,
      adoptedCats: 0,
      adoptedDogs: null,
      asOf: "2026-07-13T00:00:00.000Z",
    });

    expect(items.map((item) => item.label)).toEqual(["待領養貓貓", "待領養狗狗"]);
    expect(items[0].asOf).toBe("2026年7月13日");
  });
});
