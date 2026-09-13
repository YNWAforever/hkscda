import { createFileRoute } from "@tanstack/react-router";
import { createSupabaseServiceClient } from "../../../lib/donations/supabase.server";
import { authorizedCron } from "../../../lib/volunteers/jobs/auth.server";
import { createVolunteerJobRepository } from "../../../lib/volunteers/jobs/repository.server";
import { createVolunteerRuntimeJobs } from "../../../lib/volunteers/jobs/service";
export const Route = createFileRoute("/api/jobs/volunteers")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!authorizedCron(request, process.env.CRON_SECRET))
          return Response.json({ error: "unauthorized" }, { status: 401 });
        const result = await createVolunteerRuntimeJobs(
          createVolunteerJobRepository(
            createSupabaseServiceClient(),
            process.env.VOLUNTEER_JOB_ACTOR_ID ?? "",
          ),
        ).run();
        return Response.json(result, { headers: { "cache-control": "no-store" } });
      },
    },
  },
});
