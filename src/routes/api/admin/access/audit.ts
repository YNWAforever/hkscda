import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "./-handlers";

export const Route = createFileRoute("/api/admin/access/audit")({
  server: {
    handlers: {
      GET: ({ request }) => createHandlers().listAudit({ request }),
    },
  },
});
