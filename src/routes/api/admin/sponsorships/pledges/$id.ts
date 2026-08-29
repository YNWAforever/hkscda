import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "./-handlers";

export const Route = createFileRoute("/api/admin/sponsorships/pledges/$id")({
  server: {
    handlers: {
      GET: ({ request, params }) => createHandlers().getPledge({ request, params }),
    },
  },
});
