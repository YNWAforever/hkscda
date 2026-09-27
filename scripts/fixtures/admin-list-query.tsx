import { createRoot } from "react-dom/client";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SupporterList } from "../../src/components/admin/crm/SupporterList";
import { useListQueryState } from "../../src/lib/admin/useListQueryState";

function SelectionHarness() {
  const [selected, setSelected] = useState(false);
  const state = useListQueryState({
    key: "selection-harness",
    initialFilters: { status: "all" },
    onScopeChange: () => setSelected(false),
  });
  return (
    <div aria-label="Synthetic selection contract">
      <button onClick={() => setSelected(true)}>Select synthetic</button>
      <button onClick={() => state.changeFilter({ status: "active" })}>Filter synthetic</button>
      <output>{selected ? "selection-active" : "selection-cleared"}</output>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <SupporterList />
    <SelectionHarness />
  </QueryClientProvider>,
);
