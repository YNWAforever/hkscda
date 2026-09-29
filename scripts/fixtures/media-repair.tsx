import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MediaRepairQueue } from "../../src/components/admin/MediaRepairQueue";
import { getSupabaseClient } from "../../src/lib/supabase";
import "../../src/styles.css";
getSupabaseClient().auth.getSession = async () =>
  ({ data: { session: { access_token: "synthetic-local-token" } }, error: null }) as never;
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById("root")!).render(
  <main className="public-container py-8">
    <QueryClientProvider client={client}>
      <MediaRepairQueue />
    </QueryClientProvider>
  </main>,
);
