import { createRoot } from "react-dom/client";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReconcileDialog } from "../../src/components/admin/donations/ReconcileDialog";
import "../../src/styles.css";
const client = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});
function Fixture() {
  const [refreshes, setRefreshes] = useState(0);
  return (
    <QueryClientProvider client={client}>
      <main className="max-w-3xl mx-auto p-4 space-y-4">
        <h1>合成收款驗收</h1>
        <p role="status">已更新 {refreshes} 次</p>
        <ReconcileDialog
          paymentId="11111111-1111-4111-8111-111111111111"
          supporterName="合成支持者"
          amountLabel="HK$100.00"
          onReconciled={() => setRefreshes((n) => n + 1)}
        />
      </main>
    </QueryClientProvider>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
