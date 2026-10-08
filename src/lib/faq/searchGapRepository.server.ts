import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { SearchGap, SearchGapRecord, SearchGapRepository } from "./searchGaps";

// list_faq_search_gaps sums search_count into a bigint, which PostgREST may
// serialise as a string -- hence the coercion.
const rowSchema = z.object({
  topic: z.string(),
  language: z.enum(["zh-HK", "en"]),
  confidence: z.enum(["none", "low"]),
  search_count: z.coerce.number().int().positive(),
  last_seen_day: z.string(),
});

const purgeCountSchema = z.number().int().nonnegative();

function mapRow(raw: unknown): SearchGap | null {
  const parsed = rowSchema.safeParse(raw);
  if (!parsed.success) return null;
  return {
    topic: parsed.data.topic,
    language: parsed.data.language,
    confidence: parsed.data.confidence,
    searchCount: parsed.data.search_count,
    lastSeenDay: parsed.data.last_seen_day,
  };
}

export function createSupabaseSearchGapRepository(client: SupabaseClient): SearchGapRepository {
  return {
    async record(input: SearchGapRecord): Promise<void> {
      const { error } = await client.rpc("record_faq_search_gap", {
        p_topic: input.topic,
        p_language: input.language,
        p_confidence: input.confidence,
      });
      if (error) throw error;
    },

    async list(days: number, limit: number): Promise<SearchGap[]> {
      const { data, error } = await client.rpc("list_faq_search_gaps", {
        p_days: days,
        p_limit: limit,
      });
      if (error) throw error;
      const rows: unknown[] = Array.isArray(data) ? data : [];
      return rows.map(mapRow).filter((gap): gap is SearchGap => gap !== null);
    },

    async purge(): Promise<number> {
      const { data, error } = await client.rpc("purge_faq_search_gaps");
      if (error) throw error;
      const count = purgeCountSchema.safeParse(data);
      if (!count.success) throw new Error("purge_faq_search_gaps returned an invalid count");
      return count.data;
    },
  };
}
