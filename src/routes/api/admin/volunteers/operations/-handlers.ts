import {
  createSupabaseServiceClient,
  requireAdmin,
} from "../../../../../lib/donations/supabase.server";
import { createOperationRepository } from "../../../../../lib/volunteers/policy/operations.repository.server";
import { createOperationHandlers } from "../../../../../lib/volunteers/policy/operations.http.server";
export function createHandlers() {
  const client = createSupabaseServiceClient();
  return createOperationHandlers({
    authenticate: async (request) =>
      (await requireAdmin(request, ["admin", "staff"], client)).authUserId,
    execute: createOperationRepository(client).execute,
  });
}
