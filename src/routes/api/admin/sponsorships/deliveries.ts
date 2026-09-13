import { createFileRoute } from "@tanstack/react-router";
import {
  createSupabaseServiceClient,
  requireAdmin,
} from "../../../../lib/donations/supabase.server";
import { withErrors, jsonResponse } from "../../../../lib/sponsorshipAdmin/http.server";
import { dispatchSponsorshipOutbox } from "../../../../lib/sponsorshipAdmin/outbox.server";
export const Route = createFileRoute("/api/admin/sponsorships/deliveries")({
  server: {
    handlers: {
      GET: ({ request }) =>
        withErrors(async () => {
          const client = createSupabaseServiceClient();
          await requireAdmin(request, ["staff", "treasurer", "admin"], client);
          const { data, error } = await client
            .from("sponsorship_delivery_outbox")
            .select("id,pledge_id,proof_id,event,status,attempts,last_error,sent_at,created_at")
            .order("created_at", { ascending: false })
            .limit(100);
          if (error) throw error;
          return jsonResponse({ deliveries: data });
        }),
      POST: ({ request }) =>
        withErrors(async () => {
          const client = createSupabaseServiceClient();
          const actor = await requireAdmin(request, ["staff", "treasurer", "admin"], client);
          return jsonResponse(await dispatchSponsorshipOutbox(client, actor.authUserId));
        }),
    },
  },
});
