import { createFileRoute } from "@tanstack/react-router";
import { createSupabaseServiceClient } from "../../../lib/donations/supabase.server";
import { createCrmExportWorker } from "../../../lib/crm/exportJobs.server";
import { authorizedCron } from "../../../lib/volunteers/jobs/auth.server";

export const Route = createFileRoute("/api/jobs/crm-exports")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!authorizedCron(request, process.env.CRON_SECRET))
          return Response.json({ error: "unauthorized" }, { status: 401 });
        const result = await createCrmExportWorker(createSupabaseServiceClient()).run();
        return Response.json(result, { headers: { "cache-control": "no-store" } });
      },
    },
  },
});
