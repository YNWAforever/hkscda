import { describe, expect, test } from "bun:test";

import { ADMIN_NAV_ITEMS, getActiveAdminNavItemIds } from "./adminNav";

describe("admin nav active state", () => {
  test("keeps path-specific items from activating by section fallback", () => {
    expect(getActiveAdminNavItemIds(ADMIN_NAV_ITEMS, "/admin", "applications")).toEqual([
      "applications",
    ]);
  });

  test("uses only the path-specific item on its matching route", () => {
    expect(
      getActiveAdminNavItemIds(ADMIN_NAV_ITEMS, "/admin/coordinator/statuses", "applications"),
    ).toEqual(["coordinator-statuses"]);
  });
});
