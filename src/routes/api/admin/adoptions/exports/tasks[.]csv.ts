import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "../-handlers";

export const Route = createFileRoute("/api/admin/adoptions/exports/tasks.csv")({
  server: {
    handlers: {
      GET: ({ request }) =>
        createHandlers().exportCoordinatorCsv({ request, params: { kind: "tasks" } }),
    },
  },
});
