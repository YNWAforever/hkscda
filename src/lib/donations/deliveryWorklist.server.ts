import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { DeliveryWorklistResult } from "./deliveryWorklist";

const jobSchema = z
  .object({
    id: z.string().uuid(),
    paymentId: z.string().uuid(),
    status: z.enum(["retryable", "attention_required"]),
    attempts: z.number().int().nonnegative(),
    errorCode: z.string().nullable(),
    createdAt: z.string(),
    nextAttemptAt: z.string().nullable(),
    paymentStatus: z.string(),
    donationStatus: z.string(),
  })
  .strict();
const resultSchema = z
  .object({
    jobs: z.array(jobSchema).max(25),
    total: z.number().int().nonnegative(),
    page: z.number().int().min(1).max(1000),
    pageSize: z.literal(25),
  })
  .strict();

export async function listDonationDeliveryWorklist(
  client: SupabaseClient,
  actor: string,
  page: number,
): Promise<DeliveryWorklistResult> {
  const { data, error } = await client.rpc("list_failed_donation_delivery_jobs", {
    p_actor: actor,
    p_page: page,
  });
  if (error) throw error;
  const result = resultSchema.parse(data);
  if (result.page !== page) throw new Error("Delivery worklist page mismatch");
  return result;
}
