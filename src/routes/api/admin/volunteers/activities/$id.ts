import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "../-handlers";

export const Route = createFileRoute("/api/admin/volunteers/activities/$id")({
  server: {
    handlers: {
      GET: ({ request, params }) => createHandlers().getActivity({ request, params }),
      PATCH: ({ request, params }) => createHandlers().updateActivity({ request, params }),
    },
  },
});
