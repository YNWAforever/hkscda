import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "../-handlers";

export const Route = createFileRoute("/api/admin/adoption-guide-releases/$id/preview")({
  server: {
    handlers: {
      GET: ({ request, params }) => createHandlers().preview(request, params),
    },
  },
});
