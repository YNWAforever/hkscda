import { createFileRoute } from "@tanstack/react-router";
import {
  createSupabaseServiceClient,
  requireAdmin,
} from "../../../../../lib/donations/supabase.server";
export const Route = createFileRoute("/api/admin/volunteers/jobs/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const c = createSupabaseServiceClient();
        await requireAdmin(request, ["admin"], c);
        const { data, error } = await c
          .from("volunteer_operation_outbox")
          .select("id,kind,status,attempts,available_at,last_error,created_at")
          .in("kind", ["volunteer_monthly_assessment_notification", "volunteer_policy_reminder"])
          .order("created_at", { ascending: false })
          .limit(100);
        if (error) throw error;
        return Response.json({ jobs: data ?? [] }, { headers: { "cache-control": "no-store" } });
      },
    },
  },
});
