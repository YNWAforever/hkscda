import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "../../../-handlers";

export const Route = createFileRoute("/api/admin/adoptions/reports/exports/$id/download")({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        createHandlers().regenerateCoordinatorExport({
          request,
          params: { id: params.id },
        }),
    },
  },
});
