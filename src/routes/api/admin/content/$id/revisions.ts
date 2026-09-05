import { createFileRoute } from "@tanstack/react-router";
import { createHandlers } from "../-handlers";
export const Route = createFileRoute("/api/admin/content/$id/revisions")({
  server: {
    handlers: { GET: ({ request, params }) => createHandlers().listRevisions({ request, params }) },
  },
});
