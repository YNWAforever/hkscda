import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { AdminLanguageProvider } from "../../../components/admin/adminI18n";
import { VolunteerRegistrationDetail } from "../../../components/admin/volunteers/VolunteerRegistrationDetail";

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
export function FixtureRegistration() {
  return (
    <QueryClientProvider client={client}>
      <AdminLanguageProvider initialLanguage="zh">
        <VolunteerRegistrationDetail registrationId="00000000-0000-4000-8000-000000000001" />
      </AdminLanguageProvider>
    </QueryClientProvider>
  );
}
const router = createRouter({ routeTree: createRootRoute({ component: FixtureRegistration }) });
createRoot(document.querySelector("#root")!).render(<RouterProvider router={router} />);
