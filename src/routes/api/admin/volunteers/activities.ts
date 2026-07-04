import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "./-handlers";

export const Route = createFileRoute("/api/admin/volunteers/activities")({
  server: {
    handlers: {
      GET: ({ request }) => createHandlers().listActivities({ request }),
      POST: ({ request }) => createHandlers().createActivity({ request }),
    },
  },
});
