import { createServerFn } from "@tanstack/react-start";

export const getPublicCheckoutState = createServerFn({ method: "GET" }).handler(async () => {
  const { createSupabaseServiceClient } = await import("../supabase.server");
  const { loadPublicCheckoutState } = await import("./checkoutPolicy.server");
  return loadPublicCheckoutState(createSupabaseServiceClient());
});
