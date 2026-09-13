import { expect, test } from "bun:test";
import { canRoleAccessAdminArea, getAdminAreaForLocation } from "./access";

test("settings routes use the specific administrator policy permission", () => {
  expect(getAdminAreaForLocation({ pathname: "/admin/volunteers/settings/cat" })).toBe(
    "volunteerPolicyManagement",
  );
  expect(getAdminAreaForLocation({ pathname: "/admin/volunteers/calendar" })).toBe(
    "volunteerManagement",
  );
});

test("staff and treasurer cannot publish policy while staff retain roster access", () => {
  const area = getAdminAreaForLocation({ pathname: "/admin/volunteers/settings" });
  expect(canRoleAccessAdminArea("staff", area)).toBe(false);
  expect(canRoleAccessAdminArea("treasurer", area)).toBe(false);
  expect(canRoleAccessAdminArea("admin", area)).toBe(true);
  expect(canRoleAccessAdminArea("staff", "volunteerManagement")).toBe(true);
});
