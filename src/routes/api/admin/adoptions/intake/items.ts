import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "../-handlers";

export const Route = createFileRoute("/api/admin/adoptions/intake/items")({
  server: {
    handlers: {
      GET: ({ request }) => createHandlers().listIntakeItems({ request }),
    },
  },
});
