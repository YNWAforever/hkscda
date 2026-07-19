import { z } from "zod";

import { donationAttributionSchema } from "./attribution";
import { donationLanguages, donationMethods, donationPurposes } from "./contracts";

export { donationLanguages, donationMethods, donationPurposes } from "./contracts";
export type { DonationLanguage, DonationMethod, DonationPurpose } from "./contracts";
export type ConsentChannel = "email" | "whatsapp";
export type ConsentStatus = "opt_in" | "opt_out";

const optionalTrimmed = z
  .string()
  .optional()
  .transform((value) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  });

export const donationRequestSchema = z.object({
  amountCents: z.number().int().min(1000).max(1_000_000),
  currency: z.literal("HKD"),
  purpose: z.enum(donationPurposes),
  customPurpose: z
    .string()
    .max(200)
    .refine((value) => !/\p{Cc}/u.test(value), "Custom purpose contains control characters")
    .transform((value) => value.trim())
    .optional()
    .transform((value) => value || undefined),
  method: z.enum(donationMethods),
  receiptRequested: z.boolean(),
  donor: z.object({
    name: z.string().trim().min(1).max(120),
    email: z
      .string()
      .trim()
      .email()
      .max(254)
      .transform((email) => email.toLowerCase()),
    phone: optionalTrimmed,
    language: z.enum(donationLanguages),
  }),
  consents: z.object({
    email: z.boolean(),
    whatsapp: z.boolean(),
  }),
  attribution: donationAttributionSchema.optional(),
});

export type DonationRequest = z.infer<typeof donationRequestSchema>;

export function createManualPaymentReference(donationId: string) {
  const compact = donationId
    .replace(/[^a-z0-9]/gi, "")
    .slice(0, 8)
    .toUpperCase();
  return `HKSCDA-${compact}`;
}

export function isReceiptEligible(input: { amountCents: number; receiptRequested: boolean }) {
  return input.receiptRequested && input.amountCents >= 10000;
}

export function formatReceiptNumber(year: number, sequence: number) {
  return `HKSCDA-${year}-${String(sequence).padStart(6, "0")}`;
}

export function buildConsentRows(input: {
  supporterId: string;
  source: string;
  timestamp: string;
  consents: DonationRequest["consents"];
}) {
  return (["email", "whatsapp"] as const).map((channel) => ({
    supporter_id: input.supporterId,
    channel,
    status: input.consents[channel] ? "opt_in" : "opt_out",
    source: input.source,
    timestamp: input.timestamp,
  }));
}

export function centsToHkd(amountCents: number) {
  // Render the exact charged amount. Whole-dollar gifts show no decimals
  // (HK$100); fractional gifts show cents (HK$100.50) so the figure on a tax
  // receipt always matches what the donor was actually charged.
  const hasCents = amountCents % 100 !== 0;
  return new Intl.NumberFormat("zh-HK", {
    style: "currency",
    currency: "HKD",
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(amountCents / 100);
}
