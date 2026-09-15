import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "./-handlers";

export const Route = createFileRoute("/api/admin/content/link-search")({
  server: {
    handlers: {
      GET: ({ request }) => createHandlers().searchLinks({ request }),
    },
  },
});
