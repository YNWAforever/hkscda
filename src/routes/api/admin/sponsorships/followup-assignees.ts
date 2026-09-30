import { createFileRoute } from "@tanstack/react-router";
import {
  createSupabaseServiceClient,
  requireAdmin,
} from "../../../../lib/donations/supabase.server";
import {
  createFollowupAssigneesHandler,
  createSupabaseFollowupAssigneesPort,
} from "../../../../lib/sponsorshipAdmin/followupAssignment.server";

export const Route = createFileRoute("/api/admin/sponsorships/followup-assignees")({
  server: {
    handlers: {
      GET: ({ request }) => {
        const client = createSupabaseServiceClient();
        const handler = createFollowupAssigneesHandler({
          authorize: async (incoming) =>
            (await requireAdmin(incoming, ["staff", "admin"], client)).authUserId,
          list: createSupabaseFollowupAssigneesPort(client),
        });
        return handler(request);
      },
    },
  },
});
