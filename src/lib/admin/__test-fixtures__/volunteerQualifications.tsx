import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { AdminLanguageProvider } from "../../../components/admin/adminI18n";
import { VolunteerQualifications } from "../../../components/admin/volunteers/VolunteerQualifications";
import { volunteerQueryKeys } from "../../volunteers/queryKeys";

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
export function QualificationsFixture() {
  return (
    <QueryClientProvider client={client}>
      <AdminLanguageProvider initialLanguage="en">
        <button
          onClick={async () => {
            await fetch("/__fixture/advance", { method: "POST" });
            await client.invalidateQueries({ queryKey: volunteerQueryKeys.key("qualifications") });
          }}
        >
          Simulate another staff member updating the profile
        </button>
        <VolunteerQualifications initial={{ profileId: "00000000-0000-4000-8000-000000000001" }} />
      </AdminLanguageProvider>
    </QueryClientProvider>
  );
}
const router = createRouter({ routeTree: createRootRoute({ component: QualificationsFixture }) });
createRoot(document.querySelector("#root")!).render(<RouterProvider router={router} />);
