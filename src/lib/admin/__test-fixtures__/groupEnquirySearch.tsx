import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { AdminLanguageProvider } from "../../../components/admin/adminI18n";
import { GroupEnquiryManagement } from "../../../components/admin/volunteers/GroupEnquiryManagement";

const client = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AdminLanguageProvider initialLanguage="zh">
      <QueryClientProvider client={client}>
        <GroupEnquiryManagement />
      </QueryClientProvider>
    </AdminLanguageProvider>
  </StrictMode>,
);
