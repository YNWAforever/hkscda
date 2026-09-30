import { createFileRoute } from "@tanstack/react-router";
import {
  createSupabaseServiceClient,
  requireAdmin,
} from "../../../../../../lib/donations/supabase.server";
import {
  createFollowupAssignmentHandler,
  createSupabaseFollowupAssignmentPort,
} from "../../../../../../lib/sponsorshipAdmin/followupAssignment.server";

export const Route = createFileRoute("/api/admin/sponsorships/pledges/$id/followup-assignment")({
  server: {
    handlers: {
      POST: ({ request, params }) => {
        const client = createSupabaseServiceClient();
        const handler = createFollowupAssignmentHandler({
          authorize: async (incoming) =>
            (await requireAdmin(incoming, ["staff", "admin"], client)).authUserId,
          assign: createSupabaseFollowupAssignmentPort(client),
        });
        return handler(request, params.id);
      },
    },
  },
});
