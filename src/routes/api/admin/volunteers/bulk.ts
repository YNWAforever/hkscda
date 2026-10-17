import { createFileRoute } from "@tanstack/react-router";

import { handleVolunteerBulk } from "../../../../lib/volunteers/bulk/route.server";

export const Route = createFileRoute("/api/admin/volunteers/bulk")({
  server: {
    handlers: {
      POST: ({ request }) => handleVolunteerBulk(request),
    },
  },
});
