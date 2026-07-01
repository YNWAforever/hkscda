import { describe, expect, test } from "bun:test";

import {
  canRoleAccessAdminArea,
  filterAdminNavItemIdsByRole,
  getAdminAreaForLocation,
  getFirstAllowedAdminRoute,
} from "./access";

describe("admin role access mapping", () => {
  test("keeps route access aligned with the broad staff/treasurer/admin roles", () => {
    expect(canRoleAccessAdminArea("staff", "animals")).toBe(true);
    expect(canRoleAccessAdminArea("staff", "adoptionCases")).toBe(true);
    expect(canRoleAccessAdminArea("staff", "payments")).toBe(true);
    expect(canRoleAccessAdminArea("staff", "supporters")).toBe(false);
    expect(canRoleAccessAdminArea("staff", "coordinatorStatuses")).toBe(false);
    expect(canRoleAccessAdminArea("staff", "accessManagement")).toBe(false);

    expect(canRoleAccessAdminArea("treasurer", "animals")).toBe(false);
    expect(canRoleAccessAdminArea("treasurer", "payments")).toBe(true);
    expect(canRoleAccessAdminArea("treasurer", "supporters")).toBe(true);
    expect(canRoleAccessAdminArea("treasurer", "accessManagement")).toBe(false);

    expect(canRoleAccessAdminArea("admin", "animals")).toBe(true);
    expect(canRoleAccessAdminArea("admin", "coordinatorStatuses")).toBe(true);
    expect(canRoleAccessAdminArea("admin", "accessManagement")).toBe(true);
  });

  test("selects the first useful landing route for each role", () => {
    expect(getFirstAllowedAdminRoute("staff")).toBe("/admin?section=cat");
    expect(getFirstAllowedAdminRoute("treasurer")).toBe("/admin?section=payments");
    expect(getFirstAllowedAdminRoute("admin")).toBe("/admin?section=cat");
  });

  test("maps admin locations to the same access areas used by nav filtering", () => {
    expect(getAdminAreaForLocation({ pathname: "/admin", section: "dog" })).toBe("animals");
    expect(getAdminAreaForLocation({ pathname: "/admin", section: "payments" })).toBe("payments");
    expect(getAdminAreaForLocation({ pathname: "/admin/applications" })).toBe("adoptionCases");
    expect(getAdminAreaForLocation({ pathname: "/admin/coordinator/intake" })).toBe("manualIntake");
    expect(getAdminAreaForLocation({ pathname: "/admin/coordinator/statuses" })).toBe(
      "coordinatorStatuses",
    );
    expect(getAdminAreaForLocation({ pathname: "/admin/access" })).toBe("accessManagement");
  });

  test("filters sidebar item ids without drifting from page access", () => {
    const itemIds = [
      "cat",
      "dog",
      "sponsor",
      "applications",
      "coordinator-intake",
      "coordinator-statuses",
      "payments",
      "supporters",
      "access-management",
    ];

    expect(filterAdminNavItemIdsByRole(itemIds, "staff")).toEqual([
      "cat",
      "dog",
      "sponsor",
      "applications",
      "coordinator-intake",
      "payments",
    ]);
    expect(filterAdminNavItemIdsByRole(itemIds, "treasurer")).toEqual(["payments", "supporters"]);
    expect(filterAdminNavItemIdsByRole(itemIds, "admin")).toEqual(itemIds);
  });
});
