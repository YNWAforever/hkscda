import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { paymentPublicConfigMethodSchema } from "./schemas";
import type { PublicPaymentMethod } from "./types";

const publicRowSchema = z.object({
  method: paymentPublicConfigMethodSchema,
  display_label_zh: z.string(),
  display_label_en: z.string(),
  details: z.record(z.string(), z.string()),
});

export async function loadPublicPaymentMethods(
  client: SupabaseClient,
): Promise<PublicPaymentMethod[]> {
  const { data, error } = await client
    .from("payment_public_config")
    .select("method,display_label_zh,display_label_en,details")
    .eq("state", "published")
    .eq("is_publicly_visible", true)
    .order("sort_order", { ascending: true });

  if (error) return [];

  const rows: PublicPaymentMethod[] = [];
  for (const raw of data ?? []) {
    const parsed = publicRowSchema.safeParse(raw);
    if (!parsed.success) continue;
    rows.push({
      method: parsed.data.method,
      displayLabelZh: parsed.data.display_label_zh,
      displayLabelEn: parsed.data.display_label_en,
      details: parsed.data.details,
    });
  }
  return rows;
}
