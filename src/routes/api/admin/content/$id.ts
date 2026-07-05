import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "./-handlers";

export const Route = createFileRoute("/api/admin/content/$id")({
  server: {
    handlers: {
      GET: ({ request, params }) => createHandlers().getContent({ request, params }),
      PATCH: ({ request, params }) => createHandlers().updateContent({ request, params }),
    },
  },
});
