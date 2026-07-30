import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "../-handlers";

export const Route = createFileRoute("/api/admin/adoption-guide-releases/$id/withdraw")({
  server: {
    handlers: {
      POST: ({ request, params }) => createHandlers().withdraw(request, params),
    },
  },
});
