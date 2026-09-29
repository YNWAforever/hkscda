import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PledgeReviewLane } from "../../src/components/admin/sponsorship/PledgeReviewLane";
import { AdminLanguageProvider } from "../../src/components/admin/adminI18n";
import "../../src/styles.css";
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={client}><AdminLanguageProvider><main className="p-4"><h1>合成助養憑證佇列驗收</h1><PledgeReviewLane /></main></AdminLanguageProvider></QueryClientProvider>,
);
