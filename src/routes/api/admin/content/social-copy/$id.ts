import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "../-handlers";

export const Route = createFileRoute("/api/admin/content/social-copy/$id")({
  server: {
    handlers: {
      PATCH: ({ request, params }) => createHandlers().updateSocialCopyStatus({ request, params }),
    },
  },
});
