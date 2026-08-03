import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "../-handlers";

export const Route = createFileRoute("/api/admin/content/$id/updates")({
  server: {
    handlers: {
      POST: ({ request, params }) => createHandlers().createStoryUpdate({ request, params }),
    },
  },
});
