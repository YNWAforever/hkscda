import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "./pledges/-handlers";

export const Route = createFileRoute("/api/admin/sponsorships/pledges")({
  server: {
    handlers: {
      GET: ({ request }) => createHandlers().listPledges({ request }),
    },
  },
});
