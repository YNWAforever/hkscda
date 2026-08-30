import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseServiceClient } from "../donations/supabase.server";
import { createSupabaseFaqRepository } from "./repository.server";
import type { HelpFaq } from "./types";

export type { HelpFaq } from "./types";

export async function loadPublicFaqs(
  createClient: () => SupabaseClient = createSupabaseServiceClient,
): Promise<HelpFaq[]> {
  return createSupabaseFaqRepository(createClient()).listPublic();
}
