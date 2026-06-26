import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "../-handlers";

export const Route = createFileRoute("/api/admin/adoptions/cases/$id")({
  server: {
    handlers: {
      GET: ({ request, params }) => createHandlers().getCase({ request, params }),
    },
  },
});
