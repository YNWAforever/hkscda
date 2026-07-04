import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "../-handlers";

export const Route = createFileRoute("/api/volunteer/status/$token")({
  server: {
    handlers: {
      GET: ({ params, request }) =>
        createHandlers().getPublicRegistrationStatus({ request, params }),
    },
  },
});
