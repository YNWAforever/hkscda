import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "../-handlers";

export const Route = createFileRoute("/api/admin/adoption-guide-releases/$id/return-to-draft")({
  server: {
    handlers: {
      POST: ({ request, params }) => createHandlers().returnToDraft(request, params),
    },
  },
});
