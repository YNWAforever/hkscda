import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { AdminLanguageProvider } from "../../../components/admin/adminI18n";
import { VolunteerOverview } from "../../../components/admin/volunteers/VolunteerOverview";

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const root = createRootRoute({
  component: () => (
    <QueryClientProvider client={client}>
      <AdminLanguageProvider initialLanguage="zh">
        <VolunteerOverview />
      </AdminLanguageProvider>
    </QueryClientProvider>
  ),
});
const router = createRouter({ routeTree: root });
createRoot(document.querySelector("#root")!).render(<RouterProvider router={router} />);
