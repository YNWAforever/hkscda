import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { donationMethods } from "../donations/contracts";
import type { CheckoutInstructionAdmission, PaymentInstructionSnapshot } from "./types";

const snapshotSchema = z.object({
  configId: z.string().uuid(),
  configVersion: z.number().int().positive(),
  purpose: z.enum(["donation", "sponsorship"]),
  method: z.enum(donationMethods),
  displayLabelZh: z.string().min(1),
  displayLabelEn: z.string().min(1),
  details: z.record(z.string(), z.string()),
  capturedAt: z.string(),
});

export function parsePaymentInstructionSnapshot(value: unknown): PaymentInstructionSnapshot | null {
  const parsed = snapshotSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export async function loadSponsorshipPaymentInstructions(
  client: SupabaseClient,
  pledgeId: string,
): Promise<CheckoutInstructionAdmission[]> {
  const { data, error } = await client.rpc("capture_sponsorship_payment_instructions", {
    p_pledge_id: pledgeId,
  });
  if (error) throw error;
  const parsed = z.array(snapshotSchema).safeParse(data);
  if (!parsed.success) throw new Error("Invalid sponsorship payment instruction snapshot");
  return parsed.data.map((snapshot) => ({ snapshot, instructionsActive: true }));
}
