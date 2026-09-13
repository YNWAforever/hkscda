import {
  createSupabaseServiceClient,
  requireAdmin,
} from "../../../../../lib/donations/supabase.server";
import { createSimulationHandlers } from "../../../../../lib/volunteers/policy/simulation.http.server";
export function createHandlers() {
  const client = createSupabaseServiceClient();
  return createSimulationHandlers({
    authenticate: async (request) => (await requireAdmin(request, ["admin"], client)).authUserId,
    execute: async (actor, command) => {
      const { data, error } = await client.rpc("volunteer_policy_simulation", {
        p_actor: actor,
        p_command: command,
      });
      if (error) throw error;
      return data as Record<string, unknown>;
    },
  });
}
