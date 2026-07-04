import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "../../-handlers";

export const Route = createFileRoute("/api/admin/volunteers/registrations/$id/attendance")({
  server: {
    handlers: {
      PATCH: ({ request, params }) => createHandlers().updateAttendance({ request, params }),
    },
  },
});
