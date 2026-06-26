import { describe, expect, test } from "bun:test";

import { ADMIN_NAV_ITEMS, getActiveAdminNavItemIds } from "./adminNav";

describe("admin nav active state", () => {
  test("routes the applications item to the coordinator case list", () => {
    const applicationsItem = ADMIN_NAV_ITEMS.find((item) => item.id === "applications");

    expect(applicationsItem?.to).toBe("/admin/applications");
    expect(
      getActiveAdminNavItemIds(ADMIN_NAV_ITEMS, "/admin/applications", "applications"),
    ).toEqual(["applications"]);
  });

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
