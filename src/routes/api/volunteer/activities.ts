import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "./-handlers";

export const Route = createFileRoute("/api/volunteer/activities")({
  server: {
    handlers: {
      GET: ({ request }) => createHandlers().listPublishedActivities({ request }),
    },
  },
});
