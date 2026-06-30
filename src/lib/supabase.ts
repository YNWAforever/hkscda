import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserSupabase: SupabaseClient | undefined;

function requiredPublicEnv(name: "VITE_SUPABASE_URL" | "VITE_SUPABASE_ANON_KEY") {
  const value = import.meta.env[name] as string | undefined;
  if (!value) throw new Error(`Missing required public environment variable: ${name}`);
  return value;
}

export function getSupabaseClient() {
  browserSupabase ??= createClient(
    requiredPublicEnv("VITE_SUPABASE_URL"),
    requiredPublicEnv("VITE_SUPABASE_ANON_KEY"),
  );
  return browserSupabase;
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, property, receiver) {
    const client = getSupabaseClient();
    const value = Reflect.get(client, property, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
