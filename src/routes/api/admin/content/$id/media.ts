import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "../-handlers";

export const Route = createFileRoute("/api/admin/content/$id/media")({
  server: {
    handlers: {
      POST: ({ request, params }) => createHandlers().createContentMedia({ request, params }),
    },
  },
});
