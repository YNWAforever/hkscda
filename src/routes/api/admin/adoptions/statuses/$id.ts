import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "../-handlers";

export const Route = createFileRoute("/api/admin/adoptions/statuses/$id")({
  server: {
    handlers: {
      GET: ({ request, params }) => createHandlers().getStatus({ request, params }),
      PATCH: ({ request, params }) => createHandlers().updateStatus({ request, params }),
      DELETE: ({ request, params }) => createHandlers().deleteStatus({ request, params }),
    },
  },
});
