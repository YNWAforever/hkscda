import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "../-handlers";

export const Route = createFileRoute("/api/admin/adoptions/adopters/$id")({
  server: {
    handlers: {
      GET: ({ request, params }) => createHandlers().getAdopter({ request, params }),
    },
  },
});
