import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "../../-handlers";

export const Route = createFileRoute("/api/admin/volunteers/registrations/$id/status")({
  server: {
    handlers: {
      PATCH: ({ request, params }) =>
        createHandlers().updateRegistrationStatus({ request, params }),
    },
  },
});
