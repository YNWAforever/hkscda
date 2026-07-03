import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "../-handlers";

export const Route = createFileRoute("/api/admin/sponsorships/pledges/$id/cancel")({
  server: {
    handlers: {
      POST: ({ request, params }) => createHandlers().cancelPledge({ request, params }),
    },
  },
});
