import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "../-handlers";

export const Route = createFileRoute("/api/admin/adoptions/tasks/$id")({
  server: {
    handlers: {
      GET: ({ request, params }) => createHandlers().getTask({ request, params }),
      PATCH: ({ request, params }) => createHandlers().updateTask({ request, params }),
    },
  },
});
