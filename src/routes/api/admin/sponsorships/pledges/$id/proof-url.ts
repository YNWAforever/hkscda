import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "../-handlers";

export const Route = createFileRoute("/api/admin/sponsorships/pledges/$id/proof-url")({
  server: {
    handlers: {
      GET: ({ request, params }) => createHandlers().getProofUrl({ request, params }),
    },
  },
});
