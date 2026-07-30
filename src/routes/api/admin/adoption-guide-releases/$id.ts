import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "./-handlers";

export const Route = createFileRoute("/api/admin/adoption-guide-releases/$id")({
  server: {
    handlers: {
      GET: ({ request, params }) => createHandlers().get(request, params),
      PATCH: ({ request, params }) => createHandlers().update(request, params),
    },
  },
});
