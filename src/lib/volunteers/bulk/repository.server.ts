import type { SupabaseClient } from "@supabase/supabase-js";
import type { BulkCommand } from "./service";
export function createBulkRepository(client: SupabaseClient) {
  return {
    async execute(actor: string, command: BulkCommand): Promise<unknown> {
      const { data, error } = await client.rpc("volunteer_bulk_command", {
        p_actor: actor,
        p_command: command,
      });
      if (error) throw error;
      return data;
    },
  };
}
