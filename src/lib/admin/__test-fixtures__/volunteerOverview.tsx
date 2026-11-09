import { createRoot } from "react-dom/client";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { AdminLanguageProvider } from "../../../components/admin/adminI18n";
import { VolunteerOverview } from "../../../components/admin/volunteers/VolunteerOverview";
import { clearVolunteerIdentityQueries, volunteerQueryKeys } from "../../volunteers/queryKeys";
import { seedAdminSessionForTests } from "../sessionMemory";

// The admin session BFF keeps the access token in memory; seed the account the old
// `supabase.auth.getSession` fixture named so the page boots without a /refresh request.
// (volunteerHourlyRetry shares this entry; its direct API call sets its own bearer token.)
seedAdminSessionForTests({ accessToken: "synthetic-overview-only", authUserId: "synthetic-admin" });

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
export function OverviewFixture() {
  const [cleared, setCleared] = useState(false);
  return (
    <QueryClientProvider client={client}>
      <AdminLanguageProvider initialLanguage="zh">
        <button
          onClick={() =>
            void client.invalidateQueries({ queryKey: volunteerQueryKeys.prefixes.overview })
          }
        >
          Simulate a newer overview refresh
        </button>
        <button
          onClick={async () => {
            await clearVolunteerIdentityQueries(client);
            setCleared(true);
          }}
        >
          Clear synthetic identity cache
        </button>
        {cleared && <p>Synthetic identity cache cleared</p>}
        <VolunteerOverview />
      </AdminLanguageProvider>
    </QueryClientProvider>
  );
}
const root = createRootRoute({ component: OverviewFixture });
const router = createRouter({ routeTree: root });
createRoot(document.querySelector("#root")!).render(<RouterProvider router={router} />);
