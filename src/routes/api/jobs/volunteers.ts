import { createFileRoute } from "@tanstack/react-router";
import { createSupabaseServiceClient } from "../../../lib/donations/supabase.server";
import { authorizedCron } from "../../../lib/volunteers/jobs/auth.server";
import { createVolunteerJobRepository } from "../../../lib/volunteers/jobs/repository.server";
import {
  createVolunteerJobCronHandler,
  createVolunteerRuntimeJobs,
} from "../../../lib/volunteers/jobs/service";
export const Route = createFileRoute("/api/jobs/volunteers")({
  server: {
    handlers: {
      GET: ({ request }) =>
        createVolunteerJobCronHandler(
          (candidate) => authorizedCron(candidate, process.env.CRON_SECRET),
          () =>
            createVolunteerRuntimeJobs(
              createVolunteerJobRepository(
                createSupabaseServiceClient(),
                process.env.VOLUNTEER_JOB_ACTOR_ID ?? "",
              ),
            ).run(),
        )(request),
    },
  },
});
