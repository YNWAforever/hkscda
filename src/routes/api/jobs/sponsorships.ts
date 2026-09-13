import { createFileRoute } from "@tanstack/react-router";
import { createSupabaseServiceClient } from "../../../lib/donations/supabase.server";
import { dispatchSponsorshipOutbox } from "../../../lib/sponsorshipAdmin/outbox.server";
import { createSponsorshipCron } from "../../../lib/sponsorshipAdmin/cron.server";
export const Route = createFileRoute("/api/jobs/sponsorships")({
  server: {
    handlers: {
      GET: ({ request }) =>
        createSponsorshipCron({
          secret: () => process.env.CRON_SECRET,
          actor: () => process.env.SPONSORSHIP_JOB_ACTOR_ID,
          run: (actor) => dispatchSponsorshipOutbox(createSupabaseServiceClient(), actor),
        })(request),
    },
  },
});
