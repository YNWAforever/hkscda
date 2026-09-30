import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReviewInput, ReviewQueueRow, ReviewSearch } from "./service";
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
    async list(actor: string, input: ReviewSearch) {
      const { data, error } =
        input.quality === "all"
          ? await client.rpc("editorial_review_queue", {
              p_actor: actor,
              p_page: input.page,
              p_kind: input.kind,
            })
          : await client.rpc("editorial_quality_queue", {
              p_actor: actor,
              p_page: input.page,
              p_quality: input.quality,
            });
      if (error) throw error;
      return data as { items: ReviewQueueRow[]; total: number };
    },
  };
}
