import { createFileRoute } from "@tanstack/react-router";

import { releaseRouteHandlers } from "../-handlers";

export const Route = createFileRoute("/api/admin/adoption-guide-releases/$id/publish")({
  server: {
    handlers: {
      POST: ({ request, params }) => releaseRouteHandlers.publish(request, params),
    },
  },
});
