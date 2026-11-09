import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * A Supabase client for the admin *credential* flows only (password recovery / invite
 * set-password). It never persists a session: the recovery session exists in this module's
 * SDK memory just long enough to call `updateUser`, then `completeAdminPasswordReset` signs
 * it out locally. Sign-in/refresh/logout go through the session BFF endpoints instead
 * (`sessionMemory.ts`), so no admin token is written to web storage anywhere.
 */
const memoryOnlyStorage: Storage = {
  length: 0,
  clear() {},
  getItem() {
    return null;
  },
  key() {
    return null;
  },
  removeItem() {},
  setItem() {},
};

let client: SupabaseClient | undefined;

export function getAdminAuthClient() {
  if (!client) {
    const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
    if (!url || !anonKey) throw new Error("Missing public Supabase configuration");
    client = createClient(url, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: true,
        storage: memoryOnlyStorage,
      },
    });
  }
  return client;
}
