import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "../-handlers";

export const Route = createFileRoute("/api/admin/access/users/$id")({
  server: {
    handlers: {
      PATCH: ({ request, params }) => createHandlers().updateUser({ request, params }),
    },
  },
});
