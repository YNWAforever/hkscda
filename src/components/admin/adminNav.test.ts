import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import { canRoleAccessAdminArea, getAdminAreaForLocation } from "../../lib/admin/access";
import type { AdminRole } from "../../lib/admin/access";
import { adminCopy } from "./adminI18n";
import {
  ADMIN_NAV_GROUPS,
  ADMIN_NAV_ITEMS,
  getActiveAdminNavItemIds,
  getAdminNavigation,
} from "./adminNav";

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

  test("uses the content item on content routes", () => {
    expect(getActiveAdminNavItemIds(ADMIN_NAV_ITEMS, "/admin/content", "content")).toEqual([
      "content",
    ]);
    expect(
      getActiveAdminNavItemIds(
        ADMIN_NAV_ITEMS,
        "/admin/content/99999999-aaaa-4333-8444-555555555555",
        "content",
      ),
    ).toEqual(["content"]);
  });

  test("uses the adoption information item on its route", () => {
    const item = ADMIN_NAV_ITEMS.find((candidate) => candidate.id === "adoption-information");
    expect(item?.to).toBe("/admin/content/adoption");
    expect(getActiveAdminNavItemIds(ADMIN_NAV_ITEMS, "/admin/content/adoption", "content")).toEqual(
      ["adoption-information"],
    );
  });

  test("keeps the content nav target backed by a route file", () => {
    const contentItem = ADMIN_NAV_ITEMS.find((item) => item.id === "content");

    expect(contentItem?.to).toBe("/admin/content");
    expect(existsSync(join(process.cwd(), "src/routes/admin/content.tsx"))).toBe(true);
  });

  test("keeps the content nav target registered in the route tree", () => {
    const routeTree = readFileSync(join(process.cwd(), "src/routeTree.gen.ts"), "utf8");

    expect(routeTree).toContain("/admin/content");
  });

  test("keeps content placeholder language copy under the admin language provider", () => {
    const routeSource = readFileSync(join(process.cwd(), "src/routes/admin/content.tsx"), "utf8");
    const pageStart = routeSource.indexOf("function AdminContentPage()");
    const childStart = routeSource.indexOf("function AdminContentPlaceholder()");

    expect(pageStart).toBeGreaterThanOrEqual(0);
    expect(childStart).toBeGreaterThan(pageStart);
    expect(routeSource.slice(pageStart, childStart)).not.toContain("useAdminLanguage");
    expect(routeSource.slice(pageStart, childStart)).toContain("<AdminContentPlaceholder />");
  });

  test("uses the approved Traditional Chinese adoption information label", () => {
    expect(adminCopy.zh.navItems["adoption-information"]).toBe("領養資訊");
    expect(adminCopy.zh.navItems["adoption-information"]).not.toContain("?");
  });

  test("has bilingual labels for every nav item", () => {
    for (const item of ADMIN_NAV_ITEMS) {
      expect(adminCopy.zh.navItems[item.id], `zh nav label for ${item.id}`).toBeString();
      expect(adminCopy.en.navItems[item.id], `en nav label for ${item.id}`).toBeString();
    }
  });

  test("has a nav item for every label in the copy, and the same labels in both languages", () => {
    // tsc keys the copy by AdminNavItemId, so a missing label already fails to compile; this
    // catches the other direction, a label for an item that no longer exists.
    const ids = ADMIN_NAV_ITEMS.map((item) => item.id).sort();
    expect(Object.keys(adminCopy.zh.navItems).sort()).toEqual(ids);
    expect(Object.keys(adminCopy.en.navItems).sort()).toEqual(ids);
    const groups = ADMIN_NAV_GROUPS.map((group) => group.id).sort();
    for (const language of ["zh", "en"] as const) {
      expect(Object.keys(adminCopy[language].navGroups).sort()).toEqual(groups);
      expect(Object.keys(adminCopy[language].navDescriptions).sort()).toEqual(groups);
    }
  });

  test("every group's entry item is one of its own items", () => {
    for (const group of ADMIN_NAV_GROUPS) {
      const entry = ADMIN_NAV_ITEMS.find((item) => item.id === group.defaultItemId);
      expect(entry?.group, `entry item of ${group.id}`).toBe(group.id);
    }
  });
});

test("nested volunteer destinations select only the longest match", () => {
  expect(
    getActiveAdminNavItemIds(ADMIN_NAV_ITEMS, "/admin/volunteers/settings", "volunteers"),
  ).toEqual(["volunteer-settings"]);
});

describe("grouped admin navigation", () => {
  test("preserves every destination in one of six groups", () => {
    const nav = getAdminNavigation("admin", "/admin", "cat");
    expect(nav.groups.map((group) => group.id)).toEqual([
      "animals",
      "adoptions",
      "volunteers",
      "donations",
      "promotion",
      "system",
    ]);
    expect(
      nav.groups
        .flatMap((group) => group.items)
        .map((item) => item.id)
        .sort(),
    ).toEqual(ADMIN_NAV_ITEMS.map((item) => item.id).sort());
    for (const item of ADMIN_NAV_ITEMS) {
      expect(getAdminNavigation("admin", item.to.split("?")[0], item.section).activeGroupId).toBe(
        item.group,
      );
    }
  });
  test("keeps existing settings access and falls back to the first permitted destination", () => {
    for (const role of ["staff", "treasurer"] as const) {
      const nav = getAdminNavigation(role, "/admin/payment-methods", "payments");
      expect(nav.groups.find((group) => group.id === "system")?.to).toBe("/admin/payment-methods");
      expect(nav.activeGroupId).toBe("system");
      expect(
        nav.groups.flatMap((group) => group.items).some((item) => item.id === "access-management"),
      ).toBe(false);
    }
    expect(
      getAdminNavigation("admin", "/admin/access", "access").groups.find(
        (group) => group.id === "system",
      )?.to,
    ).toBe("/admin/access");
  });
  test("hides empty groups and uses intended domain entrypoints", () => {
    expect(
      getAdminNavigation("treasurer", "/admin", "payments").groups.map((group) => group.id),
    ).toEqual(["donations", "system"]);
    expect(getAdminNavigation(null, "/admin", "cat")).toEqual({ groups: [], activeGroupId: null });
    const groups = getAdminNavigation("admin", "/admin", "cat").groups;
    expect(groups.find((group) => group.id === "volunteers")?.to).toBe("/admin/volunteers");
    expect(groups.find((group) => group.id === "donations")?.to).toBe("/admin?section=payments");
    for (const group of ADMIN_NAV_GROUPS) {
      expect(adminCopy.zh.navGroups[group.id]).toBeTruthy();
      expect(adminCopy.en.navGroups[group.id]).toBeTruthy();
    }
  });
  test("matches nested paths without confusing prefixes and preserves section fallback", () => {
    expect(getAdminNavigation("admin", "/admin/animals/example/edit", "dog").activeGroupId).toBe(
      "animals",
    );
    expect(
      getAdminNavigation("admin", "/admin/coordinator/statuses", "applications").activeGroupId,
    ).toBe("system");
    expect(
      getActiveAdminNavItemIds(ADMIN_NAV_ITEMS, "/admin/content/adoption-extra", "content"),
    ).toEqual(["content"]);
    expect(
      getActiveAdminNavItemIds(
        ADMIN_NAV_ITEMS,
        "/admin/volunteers/group-enquiries/one",
        "volunteers",
      ),
    ).toEqual(["volunteer-group-enquiries"]);
  });
});

describe("the volunteer workspace pages in the navigation model", () => {
  const volunteers = ADMIN_NAV_ITEMS.find((item) => item.id === "volunteers");
  const children = volunteers?.children ?? [];
  const ROLES: readonly AdminRole[] = ["staff", "treasurer", "admin"];

  test("registers all thirteen pages as children of the volunteers item", () => {
    expect(children.map((child) => child.id)).toEqual([
      "overview",
      "tasks",
      "calendar",
      "activities",
      "operations",
      "group-enquiries",
      "people",
      "qualifications",
      "settings",
      "daily-settings",
      "assessments",
      "sources",
      "simulation",
    ]);
    expect(new Set(children.map((child) => child.to)).size).toBe(children.length);
  });

  test("keeps the top level at one entry per destination", () => {
    expect(ADMIN_NAV_ITEMS.filter((item) => item.children)).toHaveLength(1);
    expect(ADMIN_NAV_ITEMS).toHaveLength(25);
  });

  test("gives every child the roles that access.ts grants for its path", () => {
    for (const child of children) {
      const area = getAdminAreaForLocation({ pathname: child.to });
      const granted = ROLES.filter((role) => canRoleAccessAdminArea(role, area));
      expect([...child.roles].sort(), child.id).toEqual([...granted].sort());
    }
  });

  test("a child that is also a top-level item has that item's roles", () => {
    for (const child of children) {
      const twin = ADMIN_NAV_ITEMS.find((item) => item.to === child.to);
      if (!twin) continue;
      const allowed = ROLES.filter((role) =>
        getAdminNavigation(role, "/admin", "cat").groups.some((group) =>
          group.items.some((item) => item.id === twin.id),
        ),
      );
      expect([...child.roles].sort(), child.id).toEqual([...allowed].sort());
    }
  });
});
