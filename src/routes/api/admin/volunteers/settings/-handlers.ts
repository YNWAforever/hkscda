import {
  createSupabaseServiceClient,
  requireAdmin,
} from "../../../../../lib/donations/supabase.server";
import { createPolicyHandlers } from "../../../../../lib/volunteers/policy/http.server";
import { createPolicyRepository } from "../../../../../lib/volunteers/policy/repository.server";

export function createHandlers() {
  const client = createSupabaseServiceClient();
  const repository = createPolicyRepository(client);
  return createPolicyHandlers({
    requireActor: (request) => requireAdmin(request, ["admin"], client),
    execute: repository.execute,
  });
}
