import { createFileRoute } from "@tanstack/react-router";

import { releaseRouteHandlers } from "./-handlers";

export const Route = createFileRoute("/api/admin/adoption-guide-releases/$id")({
  server: {
    handlers: {
      GET: ({ request, params }) => releaseRouteHandlers.get(request, params),
      PATCH: ({ request, params }) => releaseRouteHandlers.update(request, params),
    },
  },
});
