import { createFileRoute } from "@tanstack/react-router";
import { handleVolunteerOverview } from "../../../../lib/volunteers/overview.server";
export const Route = createFileRoute("/api/admin/volunteers/overview")({
  server: { handlers: { GET: ({ request }) => handleVolunteerOverview(request) } },
});
