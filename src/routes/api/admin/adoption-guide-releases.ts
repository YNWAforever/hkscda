import { createFileRoute } from "@tanstack/react-router";

import { releaseRouteHandlers } from "./adoption-guide-releases/-handlers";

export const Route = createFileRoute("/api/admin/adoption-guide-releases")({
  server: {
    handlers: {
      GET: ({ request }) => releaseRouteHandlers.list(request),
      POST: ({ request }) => releaseRouteHandlers.create(request),
    },
  },
});
