import { createAdminAccessHandlers } from "../../../../lib/admin/accessManagement.http.server";
import {
  createSupabaseAdminAccessRepository,
  createSupabaseInviteAuthProvider,
} from "../../../../lib/admin/accessManagement.repository.server";
import { createAdminAccessService } from "../../../../lib/admin/accessManagement.server";
import {
  createSupabaseServiceClient,
  requireAdmin,
} from "../../../../lib/donations/supabase.server";

export function createHandlers() {
  const client = createSupabaseServiceClient();
  const service = createAdminAccessService({
    repo: createSupabaseAdminAccessRepository(client),
    auth: createSupabaseInviteAuthProvider(client),
  });

  return createAdminAccessHandlers({
    requireAccessAdmin: (request) => requireAdmin(request, ["admin"], client),
    service,
  });
}
