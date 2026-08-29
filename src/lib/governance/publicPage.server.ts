import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseServiceClient } from "../donations/supabase.server";
import { createSupabaseGovernanceRepository } from "./repository.server";
import type { PublicBoardRoster } from "./types";

export type { PublicBoardRoster } from "./types";

export async function loadPublicBoardRoster(
  createClient: () => SupabaseClient = createSupabaseServiceClient,
): Promise<PublicBoardRoster> {
  return createSupabaseGovernanceRepository(createClient()).listPublicRoster();
}
