import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "../../documents/-handlers";

export const Route = createFileRoute("/api/admin/annual-reports/$id/publish")({
  server: {
    handlers: {
      POST: ({ request, params }) => createHandlers().publishAnnualReport({ request, params }),
      DELETE: ({ request, params }) => createHandlers().unpublishAnnualReport({ request, params }),
    },
  },
});
