import { createAdoptionCoordinatorHandlers } from "../../../../lib/adoptions/http.server";
import { createSupabaseAdoptionCoordinatorRepository } from "../../../../lib/adoptions/repository.server";
import { createAdoptionCoordinatorService } from "../../../../lib/adoptions/service";
import {
  createSupabaseServiceClient,
  requireAdmin,
} from "../../../../lib/donations/supabase.server";

export function createHandlers() {
  const client = createSupabaseServiceClient();
  const service = createAdoptionCoordinatorService({
    repo: createSupabaseAdoptionCoordinatorRepository(client),
  });

  return createAdoptionCoordinatorHandlers({
    requireCoordinator: (request) => requireAdmin(request, ["staff", "admin"], client),
    requireStatusAdmin: (request) => requireAdmin(request, ["admin"], client),
    service,
  });
}
