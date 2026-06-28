import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "../-handlers";

export const Route = createFileRoute("/api/admin/adoptions/reports/exports")({
  server: {
    handlers: {
      GET: ({ request }) => createHandlers().listCoordinatorExportHistory({ request }),
    },
  },
});
