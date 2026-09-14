import type { SupabaseClient } from "@supabase/supabase-js";
import type { PolicyCommand, PolicyResult } from "./service";

export function createPolicyRepository(client: SupabaseClient) {
  return {
    async execute(actorUserId: string, command: PolicyCommand): Promise<PolicyResult> {
      const { data, error } =
        command.action === "list"
          ? await client.rpc("volunteer_policy_settings_read", { p_actor: actorUserId })
          : await client.rpc("volunteer_policy_command", {
              p_actor: actorUserId,
              p_command: command,
            });
      if (error) throw error;
      return data as PolicyResult;
    },
  };
}
