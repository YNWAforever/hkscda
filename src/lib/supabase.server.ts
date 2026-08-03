import { createClient } from "@supabase/supabase-js";

import { getSupabaseServerConfig } from "./donations/config.server";

export function createSupabaseServiceClient() {
  const config = getSupabaseServerConfig();
  return createClient(config.url, config.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
