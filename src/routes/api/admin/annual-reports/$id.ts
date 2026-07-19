import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "../documents/-handlers";

export const Route = createFileRoute("/api/admin/annual-reports/$id")({
  server: {
    handlers: {
      PATCH: ({ request, params }) => createHandlers().updateAnnualReport({ request, params }),
      DELETE: ({ request, params }) => createHandlers().deleteAnnualReport({ request, params }),
    },
  },
});
