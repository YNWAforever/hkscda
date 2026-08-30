import { createSupabaseServiceClient } from "../donations/supabase.server";
import { createSupabaseAboutPagesRepository } from "./repository.server";
import type {
  AboutPageContent,
  AboutPageSlug,
  AnyAboutPageContent,
  CccpPageContent,
  TnrPageContent,
} from "./types";

export async function loadAboutPageContent(slug: "about"): Promise<AboutPageContent | null>;
export async function loadAboutPageContent(slug: "tnr"): Promise<TnrPageContent | null>;
export async function loadAboutPageContent(slug: "cccp"): Promise<CccpPageContent | null>;
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
