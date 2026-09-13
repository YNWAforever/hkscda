import { createFileRoute } from "@tanstack/react-router";
import { handleQualificationCommand } from "../../../../lib/volunteers/policy/qualifications.server";
export const Route = createFileRoute("/api/admin/volunteers/qualifications")({
  server: { handlers: { POST: ({ request }) => handleQualificationCommand(request) } },
});
