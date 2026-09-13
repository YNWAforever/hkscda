import { createFileRoute } from "@tanstack/react-router";
import {
  createSupabaseServiceClient,
  requireAdmin,
} from "../../../../../../lib/donations/supabase.server";
export const Route = createFileRoute("/api/admin/volunteers/jobs/$id/retry")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const c = createSupabaseServiceClient(),
          actor = await requireAdmin(request, ["admin"], c);
        const { data, error } = await c.rpc("retry_volunteer_operation_outbox", {
          p_actor: actor.authUserId,
          p_id: params.id,
        });
        if (error) throw error;
        return Response.json(
          { kind: data ? "queued" : "conflict" },
          { status: data ? 200 : 409, headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});
