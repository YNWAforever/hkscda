import { createFileRoute } from "@tanstack/react-router";

import {
  createSupabaseServiceClient,
  listFinanceActivity,
  requireAdmin,
} from "../../../../lib/donations/supabase.server";

export const Route = createFileRoute("/api/admin/finance/activity")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const client = createSupabaseServiceClient();
          await requireAdmin(request, ["staff", "treasurer", "admin"], client);
          return Response.json(
            { activity: await listFinanceActivity(client) },
            { headers: { "cache-control": "no-store" } },
          );
        } catch (error) {
          if (error instanceof Response) return error;
          console.error(error);
          return Response.json({ error: "Could not load finance activity" }, { status: 500 });
        }
      },
    },
  },
});
