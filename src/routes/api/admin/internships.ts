import { createFileRoute } from "@tanstack/react-router";
import { internshipHandlers } from "../../../lib/internships/handlers.server";
export const Route = createFileRoute("/api/admin/internships")({
  server: { handlers: { POST: ({ request }) => internshipHandlers().post(request, true) } },
});
