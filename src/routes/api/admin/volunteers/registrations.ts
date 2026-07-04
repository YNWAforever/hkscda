import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "./-handlers";

export const Route = createFileRoute("/api/admin/volunteers/registrations")({
  server: {
    handlers: {
      GET: ({ request }) => createHandlers().listRegistrations({ request }),
    },
  },
});
