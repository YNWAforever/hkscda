import { createFileRoute } from "@tanstack/react-router";

import { releaseRouteHandlers } from "../-handlers";

export const Route = createFileRoute("/api/admin/adoption-guide-releases/$id/withdraw")({
  server: {
    handlers: {
      POST: ({ request, params }) => releaseRouteHandlers.withdraw(request, params),
    },
  },
});
