import { withVolunteerTiming } from "../../../../lib/volunteers/telemetry.server";
import { createFileRoute } from "@tanstack/react-router";
import {
  createSupabaseServiceClient,
  requireAdmin,
} from "../../../../lib/donations/supabase.server";
import { createBulkRepository } from "../../../../lib/volunteers/bulk/repository.server";
import { createBulkHandlers } from "../../../../lib/volunteers/bulk/http.server";
function handlers() {
  const client = createSupabaseServiceClient();
  return createBulkHandlers({
    requireActor: (request) => requireAdmin(request, ["staff", "admin"], client),
    execute: createBulkRepository(client).execute,
  });
}
export const Route = createFileRoute("/api/admin/volunteers/bulk")({
  server: {
    handlers: {
      POST: ({ request }) =>
        withVolunteerTiming("bulk_command", (value) => handlers().POST(value))(request),
    },
  },
});
