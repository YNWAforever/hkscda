import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "../-handlers";

export const Route = createFileRoute("/api/admin/adoptions/intake/identity-search")({
  server: {
    handlers: {
      GET: ({ request }) => createHandlers().searchManualCaseIdentity({ request }),
    },
  },
});
