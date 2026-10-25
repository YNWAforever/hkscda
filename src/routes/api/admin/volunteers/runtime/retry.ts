import { createFileRoute } from "@tanstack/react-router";
import { handleHourlyRetry } from "../../../../../lib/volunteers/jobs/hourlyRetry.server";

export const Route = createFileRoute("/api/admin/volunteers/runtime/retry")({
  server: {
    handlers: { POST: ({ request }) => handleHourlyRetry(request) },
  },
});
