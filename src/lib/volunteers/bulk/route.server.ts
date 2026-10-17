import { createSupabaseServiceClient, requireAdmin } from "../../donations/supabase.server";
import { withVolunteerTiming } from "../telemetry.server";
import { createBulkHandlers } from "./http.server";
import { createBulkRepository } from "./repository.server";

function handlers() {
  const client = createSupabaseServiceClient();
  return createBulkHandlers({
    requireActor: (request) => requireAdmin(request, ["staff", "admin"], client),
    execute: createBulkRepository(client).execute,
  });
}

export function handleVolunteerBulk(request: Request) {
  return withVolunteerTiming("bulk_command", (value) => handlers().POST(value))(request);
}
