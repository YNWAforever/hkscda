import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRoute,
  createRouter,
  createMemoryHistory,
  RouterProvider,
} from "@tanstack/react-router";
import { ContentReviewQueue } from "../../src/components/admin/content/ContentReview";
import "../../src/styles.css";
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
client.setQueryData(["admin-me"], { admin: { role: "admin" } });
const routeTree = createRootRoute({
  component: () => (
    <main>
      <h1>合成審核佇列競態驗收</h1>
      <ContentReviewQueue />
    </main>
  ),
});
const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ["/"] }) });
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={client}>
    <RouterProvider router={router} />
  </QueryClientProvider>,
);
