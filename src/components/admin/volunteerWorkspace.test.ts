import { describe, expect, test } from "bun:test";
import { getVolunteerNavigation, getVolunteerWorkspacePage } from "./volunteerWorkspace";

describe("volunteer workspace navigation", () => {
  test("groups the pages into daily work, people and policy, in that order", () => {
    const byGroup = (role: "admin" | "staff") => {
      const groups = new Map<string, string[]>();
      for (const item of getVolunteerNavigation(role)) {
        groups.set(item.group, [...(groups.get(item.group) ?? []), item.id]);
      }
      return [...groups.entries()];
    };
    expect(byGroup("admin")).toEqual([
      ["daily", ["overview", "tasks", "calendar", "activities", "operations", "group-enquiries"]],
      ["people", ["people", "qualifications"]],
      ["policy", ["settings", "daily-settings", "assessments", "sources", "simulation"]],
    ]);
    expect(byGroup("staff").map(([group]) => group)).toEqual(["daily", "people"]);
  });

  test("staff can find all operations but no policy management", () => {
    const items = getVolunteerNavigation("staff");
    expect(items.some((item) => item.id === "people")).toBe(true);
    expect(items.some((item) => item.id === "qualifications")).toBe(true);
    expect(items.filter((item) => item.group === "policy")).toHaveLength(0);
  });
  test("admin sees all five policy destinations", () => {
    expect(
      getVolunteerNavigation("admin")
        .filter((item) => item.group === "policy")
        .map((item) => item.id),
    ).toEqual(["settings", "daily-settings", "assessments", "sources", "simulation"]);
  });
  test("treasurer and an unavailable identity have no navigation", () => {
    expect(getVolunteerNavigation("treasurer")).toEqual([]);
    expect(getVolunteerNavigation(null)).toEqual([]);
  });
  test("overview only activates on the exact root", () => {
    expect(getVolunteerWorkspacePage("/admin/volunteers/")?.id).toBe("overview");
    expect(getVolunteerWorkspacePage("/admin/volunteers/people/abc")?.id).toBe("people");
    expect(getVolunteerWorkspacePage("/admin/volunteers/people-extra")).toBeUndefined();
  });
  test("registration details retain their activities navigation parent", () => {
    expect(getVolunteerWorkspacePage("/admin/volunteers/registrations/abc")?.id).toBe("activities");
    expect(getVolunteerWorkspacePage("/admin/volunteers/settings/")?.id).toBe("settings");
  });
});
