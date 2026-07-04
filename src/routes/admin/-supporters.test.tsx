import { describe, expect, test } from "bun:test";

import { isSupportersListPath } from "./-supportersRouteLogic";

describe("admin supporters route", () => {
  test("treats supporter detail URLs as nested routes instead of the list route", () => {
    expect(isSupportersListPath("/admin/supporters")).toBe(true);
    expect(isSupportersListPath("/admin/supporters/")).toBe(true);
    expect(isSupportersListPath("/admin/supporters/f43d0f00-aa4f-4bb9-856d-6fe2f9f13bd0")).toBe(
      false,
    );
  });
});
