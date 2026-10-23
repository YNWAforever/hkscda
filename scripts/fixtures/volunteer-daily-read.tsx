import { createRoot } from "react-dom/client";
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminLanguageProvider, AdminLanguageToggle } from "../../src/components/admin/adminI18n";
import { VolunteerActivityWorkspace } from "../../src/components/admin/volunteers/VolunteerActivityWorkspace";
import { VolunteerRegistrationDetail } from "../../src/components/admin/volunteers/VolunteerRegistrationDetail";
import { readRegistrationReturnState } from "../../src/components/admin/volunteers/registrationReturnState";
import { Route as registrationDefinition } from "../../src/routes/admin/volunteers/registrations/$id";
import { requireAdminPageAccess } from "../../src/lib/admin/pageAccess";
import "../../src/styles.css";

// The production components/router helpers are real. Auth and every API response are offline doubles.
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});
Object.assign(globalThis, {
  __OFFLINE_DAILY_READ_DIAGNOSTICS__: () =>
    queryClient
      .getQueryCache()
      .getAll()
      .map((query) => {
        const error = query.state.error;
        return {
          key: query.queryKey[0],
          status: error && typeof error === "object" && "status" in error ? error.status : null,
          message: error instanceof Error ? error.message : null,
        };
      }),
});
const root = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: () => (
    <QueryClientProvider client={queryClient}>
      <AdminLanguageProvider>
        <main className="mx-auto max-w-6xl space-y-4 p-4" data-offline-daily-read="1">
          <p role="note" className="rounded border p-2">
            OFFLINE MOCK UI · no real Auth / DB / RLS / staff UAT
          </p>
          <AdminLanguageToggle />
          <Outlet />
        </main>
      </AdminLanguageProvider>
    </QueryClientProvider>
  ),
});
const guard = () => requireAdminPageAccess("volunteerManagement", queryClient);
const activities = createRoute({
  getParentRoute: () => root,
  path: "/admin/volunteers/activities",
  beforeLoad: guard,
  component: () => <VolunteerActivityWorkspace />,
});
const calendar = createRoute({
  getParentRoute: () => root,
  path: "/admin/volunteers/calendar",
  beforeLoad: guard,
  component: () => <VolunteerActivityWorkspace initialView="calendar" />,
});
const registration = createRoute({
  getParentRoute: () => root,
  path: "/admin/volunteers/registrations/$id",
  beforeLoad: guard,
  validateSearch: registrationDefinition.options.validateSearch,
  component: () => {
    const { id } = registration.useParams();
    const search = registration.useSearch();
    const returnState = readRegistrationReturnState(
      new URLSearchParams(
        Object.entries(search)
          .filter(([, value]) => value !== undefined)
          .map(([key, value]) => [key, String(value)]),
      ),
    );
    return <VolunteerRegistrationDetail registrationId={id} returnState={returnState} />;
  },
});
const denied = createRoute({
  getParentRoute: () => root,
  path: "/admin/access-denied",
  component: () => <p role="alert">Offline role boundary: access denied</p>,
});
const login = createRoute({
  getParentRoute: () => root,
  path: "/admin/login",
  component: () => <p role="alert">Offline session boundary: sign in required</p>,
});
const router = createRouter({
  routeTree: root.addChildren([activities, calendar, registration, denied, login]),
  context: { queryClient },
  defaultPreload: false,
});
createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
