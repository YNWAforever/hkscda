import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "./-handlers";

export const Route = createFileRoute("/api/admin/access/users")({
  server: {
    handlers: {
      GET: ({ request }) => createHandlers().listUsers({ request }),
    },
  },
});
