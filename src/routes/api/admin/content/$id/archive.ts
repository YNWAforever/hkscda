import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "../-handlers";

export const Route = createFileRoute("/api/admin/content/$id/archive")({
  server: {
    handlers: {
      POST: ({ request, params }) => createHandlers().archiveContent({ request, params }),
    },
  },
});
