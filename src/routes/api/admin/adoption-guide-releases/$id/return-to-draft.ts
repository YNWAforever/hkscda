import { createFileRoute } from "@tanstack/react-router";

import { releaseRouteHandlers } from "../-handlers";

export const Route = createFileRoute("/api/admin/adoption-guide-releases/$id/return-to-draft")({
  server: {
    handlers: {
      POST: ({ request, params }) => releaseRouteHandlers.returnToDraft(request, params),
    },
  },
});
