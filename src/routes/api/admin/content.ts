import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "./content/-handlers";

export const Route = createFileRoute("/api/admin/content")({
  server: {
    handlers: {
      GET: ({ request }) => createHandlers().listAdminContent({ request }),
      POST: ({ request }) => createHandlers().createContent({ request }),
    },
  },
});
