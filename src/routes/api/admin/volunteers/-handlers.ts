import { createVolunteerHandlers } from "../../../../lib/volunteers/http.server";
import { createSupabaseVolunteerRepository } from "../../../../lib/volunteers/repository.server";
import { createVolunteerService } from "../../../../lib/volunteers/service";
import {
  createSupabaseServiceClient,
  requireAdmin,
} from "../../../../lib/donations/supabase.server";

export function createHandlers() {
  const client = createSupabaseServiceClient();
  const service = createVolunteerService({
    repo: createSupabaseVolunteerRepository(client),
  });

  return createVolunteerHandlers({
    requireVolunteerAdmin: (request) => requireAdmin(request, ["staff", "admin"], client),
    service,
  });
}
