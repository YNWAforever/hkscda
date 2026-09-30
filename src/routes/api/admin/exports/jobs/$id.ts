import { createFileRoute } from "@tanstack/react-router";
import { createCrmExportJobHandlers } from "../../../../../lib/crm/exportJobs.http.server";
import { createSupabaseServiceClient } from "../../../../../lib/donations/supabase.server";
import { requireAdmin } from "../../../../../lib/admin/session.server";

export const Route = createFileRoute("/api/admin/exports/jobs/$id")({
  server: {
    handlers: {
      GET: ({ request, params }) => {
        const client = createSupabaseServiceClient();
        return createCrmExportJobHandlers({
          client,
          requireTreasurer: (input) => requireAdmin(input, ["treasurer", "admin"], client),
        }).status(request, params.id);
      },
      DELETE: ({ request, params }) => {
        const client = createSupabaseServiceClient();
        return createCrmExportJobHandlers({
          client,
          requireTreasurer: (input) => requireAdmin(input, ["treasurer", "admin"], client),
        }).cancel(request, params.id);
      },
    },
  },
});
