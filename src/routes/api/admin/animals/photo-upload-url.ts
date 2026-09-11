import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "./-handlers";

export const Route = createFileRoute("/api/admin/animals/photo-upload-url")({
  server: {
    handlers: {
      POST: ({ request }) => createHandlers().createUploadUrl({ request }),
    },
  },
});
