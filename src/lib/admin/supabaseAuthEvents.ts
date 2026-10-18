import { supabase } from "../supabase";
import { createSharedAdminAuthEvents, type AdminAuthListener } from "./authEvents";

let subscribe: ReturnType<typeof createSharedAdminAuthEvents> | undefined;

export function subscribeToAdminAuth(listener: AdminAuthListener) {
  subscribe ??= createSharedAdminAuthEvents(supabase.auth);
  return subscribe(listener);
}
