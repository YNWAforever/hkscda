import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { PAGE_CONTENT_SCHEMAS } from "./schemas";
import type { AboutPageSlug, AnyAboutPageContent } from "./types";

const rowSchema = z.object({
  page_slug: z.enum(["about", "tnr", "cccp"]),
  content: z.unknown(),
  revision: z.number().int().nonnegative().optional().default(0),
});

/** One seeded page as the admin editor reads it: its content and the revision it saves against. */
export type AboutPageRecord = {
  content: AnyAboutPageContent;
  revision: number;
};

export interface AboutPagesRepository {
  getContent(slug: AboutPageSlug): Promise<AnyAboutPageContent | null>;
  getPage(slug: AboutPageSlug): Promise<AboutPageRecord | null>;
  upsertContent(
    slug: AboutPageSlug,
    content: AnyAboutPageContent,
    actorAuthUserId: string,
    expectedRevision?: number,
  ): Promise<{ content: AnyAboutPageContent; revision: number }>;
}

export function createSupabaseAboutPagesRepository(client: SupabaseClient): AboutPagesRepository {
  async function getRow(slug: AboutPageSlug) {
    const { data, error } = await client
      .from("about_page_content")
      .select("page_slug,content,revision")
      .eq("page_slug", slug)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;

    const row = rowSchema.safeParse(data);
    if (!row.success) return null;

    const schema = PAGE_CONTENT_SCHEMAS[slug];
    const parsed = schema.safeParse(row.data.content);
    return parsed.success ? { content: parsed.data, revision: row.data.revision } : null;
  }

  return {
    async getContent(slug) {
      return (await getRow(slug))?.content ?? null;
    },

    getPage(slug) {
      return getRow(slug);
    },

    async upsertContent(slug, content, actorAuthUserId, expectedRevision) {
      const { data, error } = await client.rpc("upsert_about_page_content_with_audit", {
        p_actor_user_id: actorAuthUserId,
        p_page_slug: slug,
        p_content: content,
        ...(expectedRevision === undefined ? {} : { p_expected_revision: expectedRevision }),
      });
      if (error) throw error;

      const row = rowSchema.parse(data);
      const schema = PAGE_CONTENT_SCHEMAS[slug];
      return { content: schema.parse(row.content), revision: row.revision };
    },
  };
}
