import { describe, expect, test } from "bun:test";

import { adminCopy } from "./adminI18n";
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

  test("uses only the coordinator tasks item on the task center route", () => {
    expect(
      getActiveAdminNavItemIds(ADMIN_NAV_ITEMS, "/admin/coordinator/tasks", "applications"),
    ).toEqual(["coordinator-tasks"]);
  });

  test("uses coordinator intake item on intake routes", () => {
    expect(
      getActiveAdminNavItemIds(ADMIN_NAV_ITEMS, "/admin/coordinator/intake", "applications"),
    ).toEqual(["coordinator-intake"]);
  });

  test("uses coordinator reports item on report routes", () => {
    expect(
      getActiveAdminNavItemIds(ADMIN_NAV_ITEMS, "/admin/coordinator/reports", "applications"),
    ).toEqual(["coordinator-reports"]);
  });

  test("uses only the coordinator adopters item on adopter routes", () => {
    expect(
      getActiveAdminNavItemIds(ADMIN_NAV_ITEMS, "/admin/coordinator/adopters", "applications"),
    ).toEqual(["coordinator-adopters"]);
  });

  test("uses the coordinator adopters item on nested adopter detail routes", () => {
    expect(
      getActiveAdminNavItemIds(
        ADMIN_NAV_ITEMS,
        "/admin/coordinator/adopters/99999999-aaaa-4333-8444-555555555555",
        "applications",
      ),
    ).toEqual(["coordinator-adopters"]);
  });

  test("uses the volunteers item on activity and registration routes", () => {
    expect(getActiveAdminNavItemIds(ADMIN_NAV_ITEMS, "/admin/volunteers", "volunteers")).toEqual([
      "volunteers",
    ]);
    expect(
      getActiveAdminNavItemIds(
        ADMIN_NAV_ITEMS,
        "/admin/volunteers/registrations/99999999-aaaa-4333-8444-555555555555",
        "volunteers",
      ),
    ).toEqual(["volunteers"]);
  });

  test("has bilingual labels for every nav item", () => {
    for (const item of ADMIN_NAV_ITEMS) {
      expect(adminCopy.zh.navItems[item.id], `zh nav label for ${item.id}`).toBeString();
      expect(adminCopy.en.navItems[item.id], `en nav label for ${item.id}`).toBeString();
    }
  });
});
