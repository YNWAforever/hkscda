import { createAdoptionCoordinatorHandlers } from "../../../../lib/adoptions/http.server";
import { createSupabaseAdoptionCoordinatorRepository } from "../../../../lib/adoptions/repository.server";
import { createAdoptionCoordinatorService } from "../../../../lib/adoptions/service";
import {
  createSupabaseServiceClient,
  requireAdmin,
} from "../../../../lib/donations/supabase.server";

export function createHandlers() {
  const client = createSupabaseServiceClient();
  const repo = createSupabaseAdoptionCoordinatorRepository(client);
  const service = createAdoptionCoordinatorService({ repo });

  return createAdoptionCoordinatorHandlers({
    requireCoordinator: (request) => requireAdmin(request, ["staff", "admin"], client),
    requireStatusAdmin: (request) => requireAdmin(request, ["admin"], client),
    service,
    // OPS-04: the manual-intake error mapper needs the email's supporter even when deleted.
    lookupSupporterByEmail: (email) => repo.findSupporterByEmailIncludingDeleted(email),
  });
}
