import { createRoot } from "react-dom/client";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { VolunteerSessionBrowser } from "../../src/components/site/volunteer/VolunteerSessionBrowser";
import { VolunteerOverview } from "../../src/components/admin/volunteers/VolunteerOverview";
import { getSupabaseClient } from "../../src/lib/supabase";
import "../../src/styles.css";
getSupabaseClient().auth.getSession = async () =>
  ({ data: { session: { access_token: "synthetic-local-token" } }, error: null }) as never;
function Fixture() {
  const [filter, setFilter] = useState({ query: "", shelter: "all", date: "", page: 1 });
  const [retries, setRetries] = useState(0);
  const admin = new URLSearchParams(location.search).get("mode") === "admin";
  return (
    <main className="public-container py-8">
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        {admin ? (
          <VolunteerOverview />
        ) : (
          <>
            <VolunteerSessionBrowser
              sessions={[]}
              filter={filter}
              onFilter={setFilter}
              selected=""
              onSelect={() => {}}
              loading={false}
              onRetry={() => setRetries((n) => n + 1)}
            />
            <output aria-label="Synthetic retries">{retries}</output>
          </>
        )}
      </QueryClientProvider>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
