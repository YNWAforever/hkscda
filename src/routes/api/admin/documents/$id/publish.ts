import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "../-handlers";

export const Route = createFileRoute("/api/admin/documents/$id/publish")({
  server: {
    handlers: {
      POST: ({ request, params }) => createHandlers().publishAsset({ request, params }),
      DELETE: ({ request, params }) => createHandlers().unpublishAsset({ request, params }),
    },
  },
});
