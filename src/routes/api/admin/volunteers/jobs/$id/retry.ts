import { createFileRoute } from "@tanstack/react-router";
import { handleNotificationJobRetry } from "../../../../../../lib/volunteers/jobs/notificationRetry.server";
export const Route = createFileRoute("/api/admin/volunteers/jobs/$id/retry")({
  server: {
    handlers: {
      POST: ({ request, params }) => handleNotificationJobRetry(request, params.id),
    },
  },
});
