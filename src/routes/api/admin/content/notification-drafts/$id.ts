import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "../-handlers";

export const Route = createFileRoute("/api/admin/content/notification-drafts/$id")({
  server: {
    handlers: {
      PATCH: ({ request, params }) =>
        createHandlers().updateNotificationDraftStatus({ request, params }),
    },
  },
});
