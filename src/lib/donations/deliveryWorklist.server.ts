import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { DeliveryWorklistResult } from "./deliveryWorklist";

const rowSchema = z.object({
  id: z.string().uuid(),
  payment_id: z.string().uuid(),
  status: z.enum(["retryable", "attention_required"]),
  attempts: z.number().int().nonnegative(),
  error_code: z.string().nullable(),
  created_at: z.string(),
  next_attempt_at: z.string().nullable(),
  payment: z.object({ status: z.string() }),
  donation: z.object({ status: z.string() }),
});

export async function listDonationDeliveryWorklist(
  client: SupabaseClient,
  page: number,
): Promise<DeliveryWorklistResult> {
  const from = (page - 1) * 25;
  const { data, count, error } = await client
    .from("donation_delivery_job")
    .select(
      "id,payment_id,status,attempts,error_code,created_at,next_attempt_at,payment:payment_id(status),donation:donation_id(status)",
      { count: "exact" },
    )
    .in("status", ["retryable", "attention_required"])
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .range(from, from + 24);
  if (error || count === null) throw new Error("Delivery worklist unavailable");
  const rows = z.array(rowSchema).max(25).parse(data);
  return {
    jobs: rows.map((row) => ({
      id: row.id,
      paymentId: row.payment_id,
      status: row.status,
      attempts: row.attempts,
      errorCode: row.error_code,
      createdAt: row.created_at,
      nextAttemptAt: row.next_attempt_at,
      paymentStatus: row.payment.status,
      donationStatus: row.donation.status,
    })),
    total: count,
    page,
    pageSize: 25,
  };
}
