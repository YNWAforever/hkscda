import { describe, expect, test } from "bun:test";

import { isPubliclyVisibleStatus, PUBLIC_VISIBLE_ANIMAL_STATUSES } from "./animal";

describe("isPubliclyVisibleStatus", () => {
  test("admits available and fostered", () => {
    expect(isPubliclyVisibleStatus("available")).toBe(true);
    expect(isPubliclyVisibleStatus("fostered")).toBe(true);
  });

  test("excludes adopted", () => {
    expect(isPubliclyVisibleStatus("adopted")).toBe(false);
  });

  test("PUBLIC_VISIBLE_ANIMAL_STATUSES names exactly the two admitted states", () => {
    expect(PUBLIC_VISIBLE_ANIMAL_STATUSES).toEqual(["available", "fostered"]);
  });
});
