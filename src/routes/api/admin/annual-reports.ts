import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "./documents/-handlers";

export const Route = createFileRoute("/api/admin/annual-reports")({
  server: {
    handlers: {
      GET: ({ request }) => createHandlers().listAnnualReports({ request }),
      POST: ({ request }) => createHandlers().createAnnualReport({ request }),
    },
  },
});
