import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "../../-handlers";

export const Route = createFileRoute("/api/admin/adoptions/cases/$id/followups")({
  server: {
    handlers: {
      POST: ({ request, params }) => createHandlers().createFollowup({ request, params }),
    },
  },
});
