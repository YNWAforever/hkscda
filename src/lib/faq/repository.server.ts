import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { faqCategorySchema, resolveFaqCta } from "./schemas";
import type { FaqEntry, FaqEntryInput, FaqRepository, HelpFaq } from "./types";

const ROW_COLUMNS =
  "id,category,question_zh,question_en,answer_zh,answer_en,keywords_zh,keywords_en,cta_key,sensitive,sort_order,is_active,created_at,updated_at";

const rowSchema = z.object({
  id: z.string(),
  category: faqCategorySchema,
  question_zh: z.string(),
  question_en: z.string(),
  answer_zh: z.string(),
  answer_en: z.string(),
  keywords_zh: z.array(z.string()),
  keywords_en: z.array(z.string()),
  cta_key: z.string().nullable(),
  sensitive: z.boolean(),
  sort_order: z.number().int(),
  is_active: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

function mapRow(raw: unknown): FaqEntry | null {
  const parsed = rowSchema.safeParse(raw);
  if (!parsed.success) return null;
  return {
    id: parsed.data.id,
    category: parsed.data.category,
    question: { "zh-HK": parsed.data.question_zh, en: parsed.data.question_en },
    answer: { "zh-HK": parsed.data.answer_zh, en: parsed.data.answer_en },
    keywords: { "zh-HK": parsed.data.keywords_zh, en: parsed.data.keywords_en },
    ctaKey: parsed.data.cta_key,
    sensitive: parsed.data.sensitive,
    sortOrder: parsed.data.sort_order,
    isActive: parsed.data.is_active,
    createdAt: parsed.data.created_at,
    updatedAt: parsed.data.updated_at,
  };
}

function toHelpFaq(entry: FaqEntry): HelpFaq {
  return {
    id: entry.id,
    category: entry.category,
    question: entry.question,
    answer: entry.answer,
    keywords: entry.keywords,
    cta: resolveFaqCta(entry.ctaKey),
    sensitive: entry.sensitive,
  };
}

export function createSupabaseFaqRepository(client: SupabaseClient): FaqRepository {
  return {
    async listPublic(): Promise<HelpFaq[]> {
      const { data, error } = await client
        .from("faq_entry")
        .select(ROW_COLUMNS)
        .eq("is_active", true)
        .order("category", { ascending: true })
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as unknown[])
        .map(mapRow)
        .filter((row): row is FaqEntry => row !== null)
        .map(toHelpFaq);
    },

    async listAdmin(): Promise<FaqEntry[]> {
      const { data, error } = await client
        .from("faq_entry")
        .select(ROW_COLUMNS)
        .order("category", { ascending: true })
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as unknown[]).map(mapRow).filter((row): row is FaqEntry => row !== null);
    },

    async upsert(input: FaqEntryInput, actorUserId: string): Promise<FaqEntry> {
      const { data, error } = await client.rpc("upsert_faq_entry_with_audit", {
        p_actor_user_id: actorUserId,
        p_id: input.id ?? null,
        p_category: input.category,
        p_question_zh: input.questionZh,
        p_question_en: input.questionEn,
        p_answer_zh: input.answerZh,
        p_answer_en: input.answerEn,
        p_keywords_zh: input.keywordsZh,
        p_keywords_en: input.keywordsEn,
        p_cta_key: input.ctaKey,
        p_sensitive: input.sensitive,
        p_sort_order: input.sortOrder,
        p_is_active: input.isActive,
      });
      if (error) throw error;
      const mapped = mapRow(data);
      if (!mapped) throw new Error("FAQ entry mutation returned an invalid row");
      return mapped;
    },

    async deactivate(id: string, actorUserId: string): Promise<void> {
      const { error } = await client.rpc("deactivate_faq_entry_with_audit", {
        p_actor_user_id: actorUserId,
        p_id: id,
      });
      if (error) throw error;
    },
  };
}
