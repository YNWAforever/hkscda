import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "./-handlers";

export const Route = createFileRoute("/api/admin/adoptions/statuses")({
  server: {
    handlers: {
      GET: ({ request }) => createHandlers().listStatuses({ request }),
      POST: ({ request }) => createHandlers().createStatus({ request }),
    },
  },
});
