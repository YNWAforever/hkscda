import { afterEach, expect, mock, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRouter,
  redirect,
} from "@tanstack/react-router";
import type { AdminAccessArea } from "./access";

const realAccess = await import("./pageAccess");
const checks: AdminAccessArea[] = [];
let allowed = true;
mock.module("./pageAccess", () => ({
  ...realAccess,
  requireAdminPageAccess: async (area: AdminAccessArea) => {
    checks.push(area);
    if (!allowed) throw redirect({ to: "/admin/login" });
    return { role: "staff", authUserId: "local-staff" };
  },
}));
const { Route: parent } = await import("../../routes/admin/volunteers");
const { Route: activities } = await import("../../routes/admin/volunteers/activities");
const { Route: calendar } = await import("../../routes/admin/volunteers/calendar");
const cache = new QueryClient();
function routerAt(path: string) {
  const root = createRootRouteWithContext<{ queryClient: QueryClient }>()({});
  // Attach the real file routes as routeTree.gen.ts does, without its generated
  // `as any` casts. The beforeLoad implementations remain the imported ones.
  const parentOptions = {
    id: "/admin/volunteers",
    path: "/admin/volunteers",
    getParentRoute: () => root,
    component: parent.options.component,
  };
  const activityOptions = {
    id: "/activities",
    path: "/activities",
    getParentRoute: () => parent,
    component: activities.options.component,
  };
  const calendarOptions = {
    id: "/calendar",
    path: "/calendar",
    getParentRoute: () => parent,
    component: calendar.options.component,
  };
  parent.update(parentOptions);
  activities.update(activityOptions);
  calendar.update(calendarOptions);
  return createRouter({
    routeTree: root.addChildren([parent.addChildren([activities, calendar])]),
    history: createMemoryHistory({ initialEntries: [path] }),
    context: { queryClient: cache },
    origin: "http://local.invalid",
    isServer: false,
  });
}
afterEach(() => {
  checks.length = 0;
  allowed = true;
  cache.clear();
});
for (const page of ["activities", "calendar"])
  test(`direct ${page} navigation checks the inherited workspace permission once`, async () => {
    const router = routerAt("/admin/volunteers/" + page);
    await router.load();
    expect(router.state.matches.at(-1)?.status).toBe("success");
    expect(checks).toEqual(["volunteerManagement"]);
  });
test("a later child navigation rechecks access through its parent", async () => {
  const router = routerAt("/admin/volunteers/calendar");
  await router.load();
  expect(checks).toEqual(["volunteerManagement"]);
  router.history.push("/admin/volunteers/activities");
  await router.load();
  expect(checks).toEqual(["volunteerManagement", "volunteerManagement"]);
  expect(router.state.matches.at(-1)?.status).toBe("success");
});
for (const page of ["activities", "calendar"])
  test(`a denied parent cannot load the ${page} child`, async () => {
    allowed = false;
    const router = routerAt("/admin/volunteers/" + page);
    await router.load();
    expect(checks).toEqual(["volunteerManagement"]);
    expect(router.state.location.pathname).toBe("/admin/login");
    expect(
      router.state.matches.some(
        (match) => match.fullPath === "/admin/volunteers/" + page && match.status === "success",
      ),
    ).toBe(false);
  });
test("the inherited guard runs before redirecting an old pending bookmark", async () => {
  allowed = false;
  const router = routerAt("/admin/volunteers/activities?registration_status=pending");
  await router.load();
  expect(checks).toEqual(["volunteerManagement"]);
  expect(router.state.location.pathname).toBe("/admin/login");
});
test("an allowed old pending bookmark preserves its safe return context", async () => {
  const selected = "11111111-1111-4111-8111-111111111111";
  const router = routerAt(
    "/admin/volunteers/activities?registration_status=pending&date_scope=all&page=2" +
      "&return_from=calendar&selected=" +
      selected +
      "&q=private-query",
  );
  await router.load();
  expect(router.state.location.pathname).toBe("/admin/volunteers/tasks");
  const params = new URLSearchParams(router.state.location.searchStr);
  expect(params.get("pending_scope")).toBe("all");
  expect(params.get("activity_return_return_from")).toBe("calendar");
  expect(params.get("activity_return_date_scope")).toBe("all");
  expect(params.get("activity_return_page")).toBe("2");
  expect(params.get("activity_return_selected")).toBe(selected);
  expect(params.has("q")).toBe(false);
  expect(params.has("activity_return_q")).toBe(false);
});
