import { createRoot } from "react-dom/client";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PaymentsReconcile } from "../../src/components/admin/donations/PaymentsReconcile";
import { PledgeDetailDrawer } from "../../src/components/admin/sponsorship/PledgeDetailDrawer";
import { AdminLanguageProvider } from "../../src/components/admin/adminI18n";
import { uploadProofDirectly } from "../../src/components/site/sponsorship/pledgeProofUpload";
import "../../src/styles.css";

const client = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});
function Fixture() {
  const [pledgeOpen, setPledgeOpen] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("Awaiting synthetic file");
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4">
      <h1>D1 local DI fixture — no database or UAT account</h1>
      <label>
        Public sponsorship proof helper
        <input
          aria-label="Public proof file"
          type="file"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            try {
              const result = await uploadProofDirectly(file, null);
              setUploadStatus(`Uploaded: ${result.storagePath}`);
            } catch (error) {
              setUploadStatus(String(error));
            }
          }}
        />
      </label>
      <p role="status">{uploadStatus}</p>
      <button type="button" onClick={() => setPledgeOpen(true)}>
        Open synthetic pledge
      </button>
      <PaymentsReconcile />
      {pledgeOpen && (
        <PledgeDetailDrawer
          pledgeId="33333333-3333-4333-8333-333333333333"
          onClose={() => setPledgeOpen(false)}
          onChanged={() => {}}
        />
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={client}>
    <AdminLanguageProvider initialLanguage="en">
      <Fixture />
    </AdminLanguageProvider>
  </QueryClientProvider>,
);
