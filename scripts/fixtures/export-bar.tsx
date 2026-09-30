import { createRoot } from "react-dom/client";
import { useState } from "react";
import { AdminLanguageProvider } from "../../src/components/admin/adminI18n";
import { ExportBar } from "../../src/components/admin/crm/ExportBar";
import { getSupabaseClient } from "../../src/lib/supabase";

getSupabaseClient().auth.getSession = async () =>
  ({ data: { session: { access_token: "synthetic-local-token" } }, error: null }) as never;

function Fixture() {
  const [query, setQuery] = useState("Ada");
  return (
    <AdminLanguageProvider>
      <main>
        <label>
          搜尋
          <input
            aria-label="搜尋"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <ExportBar search={new URLSearchParams({ q: query, role: "donor", page: "1" })} />
      </main>
    </AdminLanguageProvider>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
