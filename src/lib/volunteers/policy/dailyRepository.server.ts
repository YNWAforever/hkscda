import type { SupabaseClient } from "@supabase/supabase-js";
import type { DailyPolicyCommand, DailyPolicyResult } from "./dailyService";
export function createDailyPolicyRepository(client: SupabaseClient) {
  return {
    async execute(actor: string, command: DailyPolicyCommand): Promise<DailyPolicyResult> {
      const { data, error } = await client.rpc("volunteer_daily_policy_command", {
        p_actor: actor,
        p_command: command,
      });
      if (error) throw error;
      return data as DailyPolicyResult;
    },
  };
}
