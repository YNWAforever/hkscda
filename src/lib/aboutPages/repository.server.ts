import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { PAGE_CONTENT_SCHEMAS } from "./schemas";
import type { AboutPageSlug, AnyAboutPageContent } from "./types";

const rowSchema = z.object({
  page_slug: z.enum(["about", "tnr", "cccp"]),
  content: z.unknown(),
});

export interface AboutPagesRepository {
  getContent(slug: AboutPageSlug): Promise<AnyAboutPageContent | null>;
  upsertContent(
    slug: AboutPageSlug,
    content: AnyAboutPageContent,
    actorAuthUserId: string,
  ): Promise<AnyAboutPageContent>;
}

export function createSupabaseAboutPagesRepository(client: SupabaseClient): AboutPagesRepository {
  return {
    async getContent(slug) {
      const { data, error } = await client
        .from("about_page_content")
        .select("page_slug,content")
        .eq("page_slug", slug)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;

      const row = rowSchema.safeParse(data);
      if (!row.success) return null;

      const schema = PAGE_CONTENT_SCHEMAS[slug];
      const parsed = schema.safeParse(row.data.content);
      return parsed.success ? parsed.data : null;
    },

    async upsertContent(slug, content, actorAuthUserId) {
      const { data, error } = await client.rpc("upsert_about_page_content_with_audit", {
        p_actor_user_id: actorAuthUserId,
        p_page_slug: slug,
        p_content: content,
      });
      if (error) throw error;

      const row = rowSchema.parse(data);
      const schema = PAGE_CONTENT_SCHEMAS[slug];
      return schema.parse(row.content);
    },
  };
}
