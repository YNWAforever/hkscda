import {
  createSupabaseServiceClient,
  requireAdmin,
} from "../../../../../lib/donations/supabase.server";
import { createDailyPolicyHandlers } from "../../../../../lib/volunteers/policy/dailyHttp.server";
import { createDailyPolicyRepository } from "../../../../../lib/volunteers/policy/dailyRepository.server";
export function createHandlers() {
  const client = createSupabaseServiceClient();
  const repository = createDailyPolicyRepository(client);
  return createDailyPolicyHandlers({
    requireActor: (request) => requireAdmin(request, ["admin"], client),
    execute: repository.execute,
  });
}
