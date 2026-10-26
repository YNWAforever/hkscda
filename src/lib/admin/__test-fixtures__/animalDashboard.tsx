import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { AdminLanguageProvider } from "../../../components/admin/adminI18n";
import { AdminDashboardContent } from "../../../routes/admin/index";
import { adminListSearchSchema } from "../../animals/adminListState";

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
client.setQueryData(["admin-me"], {
  admin: { id: "synthetic-admin", authUserId: "synthetic-user", role: "admin" },
});
function Fixture() {
  const search = adminListSearchSchema.parse(root.useSearch());
  const navigate = root.useNavigate();
  return (
    <QueryClientProvider client={client}>
      <AdminLanguageProvider initialLanguage="en">
        <button onClick={() => void navigate({ search: { ...search, q: "restored" } })}>
          Restore bookmarked search
        </button>
        <AdminDashboardContent
          section={search.section}
          search={search}
          onSearchChange={(next) => void navigate({ search: next })}
        />
      </AdminLanguageProvider>
    </QueryClientProvider>
  );
}
const root = createRootRoute({ validateSearch: adminListSearchSchema, component: Fixture });
const router = createRouter({ routeTree: root });
createRoot(document.querySelector("#root")!).render(<RouterProvider router={router} />);
