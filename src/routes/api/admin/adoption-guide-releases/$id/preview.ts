import { createFileRoute } from "@tanstack/react-router";

import { releaseRouteHandlers } from "../-handlers";

export const Route = createFileRoute("/api/admin/adoption-guide-releases/$id/preview")({
  server: {
    handlers: {
      GET: ({ request, params }) => releaseRouteHandlers.preview(request, params),
    },
  },
});
