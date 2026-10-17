import { expect, test } from "bun:test";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterContextProvider,
} from "@tanstack/react-router";
import { renderToStaticMarkup } from "react-dom/server";
import { VolunteerLink } from "./VolunteerLink";
import { readRegistrationReturnState, registrationRouterSearch } from "./registrationReturnState";

test("query-only pagination stays on the current volunteer route through Router Link", async () => {
  const root = createRootRoute();
  const route = createRoute({ getParentRoute: () => root, path: "/admin/volunteers/people" });
  const router = createRouter({
    routeTree: root.addChildren([route]),
    history: createMemoryHistory({ initialEntries: ["/admin/volunteers/people"] }),
  });
  await router.load();
  const html = renderToStaticMarkup(
    <RouterContextProvider router={router}>
      <VolunteerLink href="?page=2">Next</VolunteerLink>
    </RouterContextProvider>,
  );
  expect(html).toContain('href="/admin/volunteers/people?page=2"');
});
test("standalone preview and external links keep native anchors", () => {
  expect(
    renderToStaticMarkup(<VolunteerLink href="mailto:ops@example.invalid">Email</VolunteerLink>),
  ).toContain('href="mailto:ops@example.invalid"');
});
test("pending application navigation carries safe return scope and page through destination validation", async () => {
  const root = createRootRoute();
  const tasks = createRoute({ getParentRoute: () => root, path: "/admin/volunteers/tasks" });
  const detail = createRoute({
    getParentRoute: () => root,
    path: "/admin/volunteers/registrations/$id",
    validateSearch: (search: Record<string, unknown>) => {
      const state = readRegistrationReturnState(
        new URLSearchParams(Object.entries(search).map(([key, value]) => [key, String(value)])),
      );
      return { ...registrationRouterSearch(state), return_from: state.from };
    },
  });
  const router = createRouter({
    routeTree: root.addChildren([tasks, detail]),
    history: createMemoryHistory({
      initialEntries: ["/admin/volunteers/tasks?pending_scope=upcoming&page=2"],
    }),
  });
  await router.load();
  const html = renderToStaticMarkup(
    <RouterContextProvider router={router}>
      <VolunteerLink href="/admin/volunteers/registrations/fixture?pending_scope=upcoming&page=2&return_from=tasks">
        Process
      </VolunteerLink>
    </RouterContextProvider>,
  );
  const href = /href="([^"]+)"/.exec(html)![1].replaceAll("&amp;", "&");
  const params = new URL(href, "http://fixture.invalid").searchParams;
  expect(params.get("return_from")).toBe("tasks");
  expect(params.get("pending_scope")).toBe("upcoming");
  expect(params.get("page")).toBe("2");
});
