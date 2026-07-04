import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "../-handlers";

export const Route = createFileRoute("/api/admin/volunteers/registrations/$id")({
  server: {
    handlers: {
      GET: ({ request, params }) => createHandlers().getRegistration({ request, params }),
    },
  },
});
