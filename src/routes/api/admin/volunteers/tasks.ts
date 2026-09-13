import { createFileRoute } from "@tanstack/react-router";
import { handleVolunteerTask } from "../../../../lib/volunteers/jobs/tasks.server";
export const Route = createFileRoute("/api/admin/volunteers/tasks")({
  server: { handlers: { POST: ({ request }) => handleVolunteerTask(request) } },
});
