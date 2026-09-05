import { createFileRoute } from "@tanstack/react-router";
import { createHandlers } from "../-handlers";
export const Route = createFileRoute("/api/admin/content/$id/media-preview")({
  server: {
    handlers: { POST: ({ request, params }) => createHandlers().previewMedia({ request, params }) },
  },
});
