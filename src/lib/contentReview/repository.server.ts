import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReviewInput, ReviewQueueRow } from "./service";
export function createContentReviewRepository(client: SupabaseClient) {
  return {
    async review(actor: string, input: ReviewInput) {
      const { data, error } = await client.rpc("editorial_review_command", {
        p_actor: actor,
        p_command: input,
      });
      if (error) throw error;
      return data as { kind: string };
    },
    async list(actor: string, input: { page: number; kind: string }) {
      const { data, error } = await client.rpc("editorial_review_queue", {
        p_actor: actor,
        p_page: input.page,
        p_kind: input.kind,
      });
      if (error) throw error;
      return data as { items: ReviewQueueRow[]; total: number };
    },
  };
}
