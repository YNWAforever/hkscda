import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "../../-handlers";

export const Route = createFileRoute("/api/admin/adoptions/cases/$id/matches")({
  server: {
    handlers: {
      POST: ({ request, params }) => createHandlers().createMatch({ request, params }),
    },
  },
});
