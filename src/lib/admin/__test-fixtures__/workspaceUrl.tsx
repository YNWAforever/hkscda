import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { AdminLanguageProvider } from "../../../components/admin/adminI18n";
import { VolunteerActivityWorkspace } from "../../../components/admin/volunteers/VolunteerActivityWorkspace";

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
export function FixtureWorkspace() {
  return (
    <QueryClientProvider client={client}>
      <AdminLanguageProvider initialLanguage="en">
        <VolunteerActivityWorkspace
          initialView={
            new URLSearchParams(window.location.search).has("calendar_route")
              ? "calendar"
              : undefined
          }
        />
      </AdminLanguageProvider>
    </QueryClientProvider>
  );
}
const route = createRootRoute({ component: FixtureWorkspace });
const router = createRouter({ routeTree: route });
createRoot(document.querySelector("#root")!).render(<RouterProvider router={router} />);
