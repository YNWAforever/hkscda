import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "../-handlers";

export const Route = createFileRoute("/api/admin/content/$id/media-upload-target")({
  server: {
    handlers: {
      POST: ({ request, params }) => createHandlers().createUploadTarget({ request, params }),
    },
  },
});
