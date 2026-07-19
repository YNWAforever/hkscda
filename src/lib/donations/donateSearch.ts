import { z } from "zod";

import { donationAttributionSchema } from "./attribution";
import { donationPurposes } from "./contracts";

export const donateSearchSchema = donationAttributionSchema.partial().extend({
  purpose: z.enum(donationPurposes).optional().catch(undefined),
  status: z.enum(["success", "cancelled", "paypal-approved"]).optional(),
  donation: z.string().optional(),
});

export type DonateSearch = z.infer<typeof donateSearchSchema>;

export function extractDonationAttribution(search: DonateSearch) {
  const parsed = donationAttributionSchema.safeParse(search);
  return parsed.success ? parsed.data : undefined;
}
