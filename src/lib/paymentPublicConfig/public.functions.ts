import { createServerFn } from "@tanstack/react-start";

export const getPublicPaymentMethods = createServerFn({ method: "GET" }).handler(async () => {
  const { createSupabaseServiceClient } = await import("../supabase.server");
  const { loadPublicPaymentMethods } = await import("./public.server");
  return loadPublicPaymentMethods(createSupabaseServiceClient());
});
