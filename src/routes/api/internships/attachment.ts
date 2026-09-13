import { createFileRoute } from "@tanstack/react-router";
import { internshipAttachment } from "../../../lib/internships/attachments.server";
export const Route = createFileRoute("/api/internships/attachment")({
  server: {
    handlers: {
      GET: ({ request }) => internshipAttachment(request),
      POST: ({ request }) => internshipAttachment(request),
    },
  },
});
