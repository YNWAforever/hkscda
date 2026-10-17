import { createRoot } from "react-dom/client";
import {
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  Outlet,
} from "@tanstack/react-router";
import { VolunteerLink } from "../../../components/admin/volunteers/VolunteerLink";
import {
  readRegistrationReturnState,
  registrationRouterSearch,
} from "../../../components/admin/volunteers/registrationReturnState";
const root = createRootRoute({ component: Outlet });
const tasks = createRoute({
  getParentRoute: () => root,
  path: "/admin/volunteers/tasks",
  component: () => (
    <VolunteerLink href="/admin/volunteers/registrations/fixture?pending_scope=upcoming&page=2&return_from=tasks">
      Process
    </VolunteerLink>
  ),
});
const detail = createRoute({
  getParentRoute: () => root,
  path: "/admin/volunteers/registrations/$id",
  validateSearch: (search: Record<string, unknown>) => {
    const state = readRegistrationReturnState(
      new URLSearchParams(Object.entries(search).map(([key, value]) => [key, String(value)])),
    );
    return { ...registrationRouterSearch(state), return_from: state.from };
  },
  component: () => <h1>Application</h1>,
});
const router = createRouter({ routeTree: root.addChildren([tasks, detail]) });
createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
