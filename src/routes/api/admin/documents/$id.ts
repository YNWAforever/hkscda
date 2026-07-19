import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "./-handlers";

export const Route = createFileRoute("/api/admin/documents/$id")({
  server: {
    handlers: {
      PATCH: ({ request, params }) => createHandlers().updateAsset({ request, params }),
      DELETE: ({ request, params }) => createHandlers().deleteAsset({ request, params }),
    },
  },
});
