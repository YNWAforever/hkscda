import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ManualDonationDialog } from "../../src/components/admin/crm/ManualDonationDialog";
import { DonationDeliveryAction } from "../../src/components/admin/crm/DonationDeliveryAction";
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={new QueryClient()}>
    <ManualDonationDialog supporterId="11111111-2222-4333-8444-555555555555" />
    <section aria-label="Saved donation history"><DonationDeliveryAction supporterId="11111111-2222-4333-8444-555555555555" language="zh" job={{id:"22222222-2222-4333-8444-555555555555",status:"retryable"}} /></section>
  </QueryClientProvider>,
);

