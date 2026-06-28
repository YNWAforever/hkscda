import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "../-handlers";

export const Route = createFileRoute("/api/admin/adoptions/reports/summary")({
  server: {
    handlers: {
      GET: ({ request }) => createHandlers().getCoordinatorMonthlySummary({ request }),
    },
  },
});
