import { createSupabaseServiceClient } from "../donations/supabase.server";
import { createSupabaseAboutPagesRepository } from "./repository.server";
import type { AboutPageSlug, AnyAboutPageContent } from "./types";

export async function loadAboutPageContent(
  slug: AboutPageSlug,
): Promise<AnyAboutPageContent | null> {
  try {
    const client = createSupabaseServiceClient();
    return await createSupabaseAboutPagesRepository(client).getContent(slug);
  } catch {
    return null;
  }
}
