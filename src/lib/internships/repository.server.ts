import type { SupabaseClient } from "@supabase/supabase-js";
import type { InternshipRepository } from "./service";
export function createInternshipRepository(client: SupabaseClient): InternshipRepository {
  return {
    async command(actor, command) {
      const { data, error } = await client.rpc("internship_command", {
        p_actor: actor,
        p_command: command,
      });
      if (error) throw error;
      return data;
    },
  };
}
