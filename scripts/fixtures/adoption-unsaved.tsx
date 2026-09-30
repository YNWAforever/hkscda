import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  Link,
  Outlet,
} from "@tanstack/react-router";
import { getSupabaseClient } from "../../src/lib/supabase";
import { AdoptionInformationManagement } from "../../src/components/admin/content/AdoptionInformationManagement";

getSupabaseClient().auth.getSession = async () =>
  ({ data: { session: { access_token: "synthetic-local-token" } }, error: null }) as never;
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
(window as Window & { __cmsQueryClient?: QueryClient }).__cmsQueryClient = queryClient;
const root = createRootRoute({
  component: () => (
    <>
      <Link to="/other">離開領養管理</Link>
      <div id="route">
        <Outlet />
      </div>
    </>
  ),
});
const adoption = createRoute({
  getParentRoute: () => root,
  path: "/scripts/fixtures/adoption-unsaved.html",
  component: AdoptionInformationManagement,
});
const other = createRoute({
  getParentRoute: () => root,
  path: "/other",
  component: () => <p>已離開領養管理</p>,
});
const router = createRouter({
  routeTree: root.addChildren([adoption, other]),
  history: createBrowserHistory(),
});
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <RouterProvider router={router} />
  </QueryClientProvider>,
);
