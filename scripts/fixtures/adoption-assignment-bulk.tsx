import { createRoot } from "react-dom/client";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdoptionAssignmentBulkPanel } from "../../src/components/admin/adoptions/AdoptionAssignmentBulkPanel";
import "../../src/styles.css";
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
function Fixture() {
  const [count, setCount] = useState(25);
  return (
    <QueryClientProvider client={client}>
      <main className="mx-auto max-w-5xl space-y-4 p-4">
        <h1 className="text-2xl font-bold">合成領養批量驗收</h1>
        <button onClick={() => setCount(1000)}>選取 1000 筆</button>
        <AdoptionAssignmentBulkPanel
          selectedIds={Array.from(
            { length: count },
            (_, i) => `11111111-1111-4111-8111-${String(i + 1).padStart(12, "0")}`,
          )}
          filterKey="synthetic"
          statusId="55555555-5555-4555-8555-555555555555"
          statusEligible={true}
          minAgeDays={7}
          onMinAgeDaysChange={() => {}}
          selectionDisabled={false}
        />
      </main>
    </QueryClientProvider>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
