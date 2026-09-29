import { createFileRoute } from "@tanstack/react-router";
import { createCrmExportJobHandlers } from "../../../../lib/crm/exportJobs.http.server";
import { createSupabaseServiceClient } from "../../../../lib/donations/supabase.server";
import { requireAdmin } from "../../../../lib/admin/session.server";

export const Route = createFileRoute("/api/admin/exports/jobs")({
  server: {
    handlers: {
      POST: ({ request }) => {
        const client = createSupabaseServiceClient();
        return createCrmExportJobHandlers({
          client,
          isEnabled: () => Boolean(process.env.CRON_SECRET?.trim()),
          requireTreasurer: (input) => requireAdmin(input, ["treasurer", "admin"], client),
        }).create(request);
      },
    },
  },
});
