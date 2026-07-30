import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "./adoption-guide-releases/-handlers";

export const Route = createFileRoute("/api/admin/adoption-guide-releases")({
  server: {
    handlers: {
      GET: ({ request }) => createHandlers().list(request),
      POST: ({ request }) => createHandlers().create(request),
    },
  },
});
