import type { SupabaseClient } from "@supabase/supabase-js";
import type { OperationCommand, OperationResult } from "./operations";
export function createOperationRepository(client: SupabaseClient) {
  return {
    async execute(actor: string, command: OperationCommand): Promise<OperationResult> {
      const { data, error } = await client.rpc("volunteer_operation_command", {
        p_actor: actor,
        p_command: command,
      });
      if (error) throw error;
      return data as OperationResult;
    },
  };
}
