import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "./-handlers";

export const Route = createFileRoute("/api/admin/documents/upload-target")({
  server: {
    handlers: {
      POST: ({ request }) => createHandlers().createUploadTarget({ request }),
    },
  },
});
