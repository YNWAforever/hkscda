import { createFileRoute } from "@tanstack/react-router";
import { readVolunteerCalendar } from "../../../../lib/volunteers/policy/calendar.server";
export const Route = createFileRoute("/api/admin/volunteers/calendar")({
  server: { handlers: { GET: ({ request }) => readVolunteerCalendar(request) } },
});
