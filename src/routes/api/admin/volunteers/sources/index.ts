import { createFileRoute } from "@tanstack/react-router";
import { createHandlers } from "./-handlers";
export const Route = createFileRoute("/api/admin/volunteers/sources/")({
  server: { handlers: { POST: ({ request }) => createHandlers().POST(request) } },
});
