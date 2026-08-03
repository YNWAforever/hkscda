import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "../-handlers";

export const Route = createFileRoute("/api/admin/content/$id/publish")({
  server: {
    handlers: {
      POST: ({ request, params }) => createHandlers().publishContent({ request, params }),
    },
  },
});
