import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "../-handlers";

export const Route = createFileRoute("/api/admin/adoption-guide-releases/$id/submit")({
  server: {
    handlers: {
      POST: ({ request, params }) => createHandlers().submit(request, params),
    },
  },
});
