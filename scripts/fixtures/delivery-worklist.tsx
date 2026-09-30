import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DonationDeliveryWorklist } from "../../src/components/admin/donations/DonationDeliveryWorklist";
import "../../src/styles.css";
const client = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={client}>
    <main className="p-4">
      <h1>合成財務驗收</h1>
      <h2>既有送達工作</h2>
      <DonationDeliveryWorklist />
    </main>
  </QueryClientProvider>,
);
