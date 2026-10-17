import { createClient } from "@supabase/supabase-js";

import { getSupabaseServerConfig } from "./donations/config.server";
import { createSupabaseAuthFetch } from "./supabaseAuthTransport.server";

export function createSupabaseServiceClient() {
  const config = getSupabaseServerConfig();
  const authFetch = createSupabaseAuthFetch(config.url);
  const serverFetch = Object.assign((...args: Parameters<typeof authFetch>) => authFetch(...args), {
    preconnect: fetch.preconnect,
  });
  return createClient(config.url, config.serviceRoleKey, {
    global: { fetch: serverFetch },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
