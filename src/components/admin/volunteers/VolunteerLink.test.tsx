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
