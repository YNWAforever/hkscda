import type { SupabaseClient } from "@supabase/supabase-js";
import type { BulkCommand } from "./service";
export function createBulkRepository(client: SupabaseClient) {
  return {
    async execute(actor: string, command: BulkCommand): Promise<unknown> {
      const timing = requestTimingContext.getStore();
      if (timing) timing.action = `bulk_${command.action}`;
      const { data, error } = await measureRequestStage("rpc", async () =>
        client.rpc("volunteer_bulk_command", {
          p_actor: actor,
          p_command: command,
        }),
      );
      if (error) throw error;
      return data;
    },
  };
}
import { measureRequestStage, requestTimingContext } from "../../operations/requestTiming.server";
