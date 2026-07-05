import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "../-handlers";

export const Route = createFileRoute("/api/admin/content/$id/links")({
  server: {
    handlers: {
      POST: ({ request, params }) => createHandlers().createContentLink({ request, params }),
    },
  },
});
