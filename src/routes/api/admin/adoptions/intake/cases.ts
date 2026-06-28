import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "../-handlers";

export const Route = createFileRoute("/api/admin/adoptions/intake/cases")({
  server: {
    handlers: {
      POST: ({ request }) => createHandlers().createManualCase({ request }),
    },
  },
});
