import { createFileRoute } from "@tanstack/react-router";
import { createHandlers } from "./-handlers";
export const Route = createFileRoute("/api/admin/volunteers/assessments/")({
  server: { handlers: { POST: ({ request }) => createHandlers().POST(request) } },
});
