import { useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SupporterFormDialog } from "../../src/components/admin/crm/SupporterFormDialog";
import type { SupporterSummary } from "../../src/lib/crm/types";

function Fixture() {
  const [id, setId] = useState("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  const supporter: SupporterSummary = {
    id,
    name: "List row",
    email: "fixture@example.invalid",
    phone: null,
    language: "en",
    tags: [],
    roles: ["donor"],
    deletedAt: null,
    lastGiftAt: null,
    lastGiftAmountCents: null,
    lifetimeAmountCents: 0,
    donationCount: 0,
    receiptNeeded: false,
    emailConsent: null,
    whatsappConsent: null,
  };
  return (
    <QueryClientProvider client={new QueryClient()}>
      <button type="button" onClick={() => setId("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")}>
        Switch supporter
      </button>
      <SupporterFormDialog mode="edit" supporter={supporter} />
    </QueryClientProvider>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
