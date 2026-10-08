import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "./-handlers";

export const Route = createFileRoute("/api/admin/adoptions/arrival-sources")({
  server: {
    handlers: {
      GET: ({ request }) => createHandlers().listArrivalSources({ request }),
    },
  },
});
