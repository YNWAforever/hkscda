import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "../-handlers";

export const Route = createFileRoute("/api/admin/content/$id/social-copy")({
  server: {
    handlers: {
      POST: ({ request, params }) => createHandlers().generateSocialCopy({ request, params }),
    },
  },
});
