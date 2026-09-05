import { createFileRoute } from "@tanstack/react-router";
import { createHandlers } from "../../../-handlers";
export const Route = createFileRoute("/api/admin/content/$id/revisions/$revisionId/restore")({
  server: {
    handlers: {
      POST: ({ request, params }) => createHandlers().restoreRevision({ request, params }),
    },
  },
});
