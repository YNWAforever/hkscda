import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "../../-handlers";

export const Route = createFileRoute("/api/admin/content/updates/$updateId/notification-drafts")({
  server: {
    handlers: {
      POST: ({ request, params }) =>
        createHandlers().generateNotificationDrafts({ request, params }),
    },
  },
});
