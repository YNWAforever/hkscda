import { z } from "zod";

export const SPONSORSHIP_TERMS_VERSION = "sponsorship-terms-2026-07";
export const MAX_SPONSORSHIP_PREFERENCES = 10;
export const MAX_PROOF_BYTES = 8 * 1024 * 1024;
export const PROOF_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

export const SPONSORSHIP_TIER_AMOUNTS_CENTS: Record<"100" | "300" | "500", number> = {
  "100": 10_000,
  "300": 30_000,
  "500": 50_000,
};

const trimmed = z.string().trim();
const optionalTrimmed = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || null);

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
const isoDate = trimmed.refine(isIsoDate, "Invalid date");

export const sponsorshipLanguageSchema = z.enum(["zh-HK", "en"]);
export const monthlyTierSchema = z.enum(["100", "300", "500", "custom"]);
export const paymentMethodSchema = z.enum(["fps", "bank_transfer", "payme", "paypal", "give_asia"]);

export const sponsorshipAnimalPreferenceSchema = z.object({
  rank: z.number().int().min(1).max(MAX_SPONSORSHIP_PREFERENCES),
  animalId: z.string().uuid(),
  animalName: trimmed.min(1),
  animalType: z.literal("sponsor"),
});

export const sponsorshipPaymentProofMetadataSchema = z.object({
  paymentMethod: paymentMethodSchema,
  reference: optionalTrimmed,
  amountCents: z.number().int().positive(),
  paymentDate: isoDate,
});

export type SponsorshipPaymentProofMetadata = z.infer<typeof sponsorshipPaymentProofMetadataSchema>;

export const sponsorshipPledgeSubmissionSchema = z
  .object({
    language: sponsorshipLanguageSchema,
    monthlyTier: monthlyTierSchema,
    customAmountCents: z.number().int().min(1000).optional(),
    animalPreferences: z
      .array(sponsorshipAnimalPreferenceSchema)
      .min(1)
      .max(MAX_SPONSORSHIP_PREFERENCES),
    contact: z.object({
      supporterName: trimmed.min(1),
      email: trimmed.email().transform((email) => email.toLowerCase()),
      phone: optionalTrimmed,
    }),
    consents: z.object({
      email: z.boolean(),
      whatsapp: z.boolean(),
    }),
    notes: optionalTrimmed,
    proofMetadata: sponsorshipPaymentProofMetadataSchema.optional(),
    terms: z.object({
      agreed: z.literal(true),
      version: z.string().min(1).default(SPONSORSHIP_TERMS_VERSION),
    }),
  })
  .superRefine((value, context) => {
    const ranks = new Set(value.animalPreferences.map((animal) => animal.rank));
    if (ranks.size !== value.animalPreferences.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["animalPreferences"],
        message: "Animal preference ranks must be unique",
      });
    }

    const animalIds = new Set(value.animalPreferences.map((animal) => animal.animalId));
    if (animalIds.size !== value.animalPreferences.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["animalPreferences"],
        message: "Each animal can only appear once",
      });
    }

    if (value.monthlyTier === "custom") {
      if (!value.customAmountCents || value.customAmountCents <= 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["customAmountCents"],
          message: "Custom amount must be a positive number of cents",
        });
      }
    } else if (value.customAmountCents !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["customAmountCents"],
        message: "Custom amount must not be set for a preset tier",
      });
    }
  })
  .transform((value) => ({
    ...value,
    animalPreferences: [...value.animalPreferences].sort((left, right) => left.rank - right.rank),
  }));

export type SponsorshipPledgeSubmission = z.infer<typeof sponsorshipPledgeSubmissionSchema>;
export type SponsorshipPledgeStatus =
  | "pending_payment"
  | "provisional"
  | "active"
  | "needs_followup"
  | "cancelled";

export type SponsorshipProofDescriptor = {
  fileName: string;
  mimeType: (typeof PROOF_MIME_TYPES)[number];
  sizeBytes: number;
};

export function validateProofDescriptor(input: {
  fileName: unknown;
  mimeType: unknown;
  sizeBytes: unknown;
}): SponsorshipProofDescriptor {
  return z
    .object({
      fileName: trimmed.min(1).max(180),
      mimeType: z.enum(PROOF_MIME_TYPES),
      sizeBytes: z.number().int().positive().max(MAX_PROOF_BYTES),
    })
    .parse(input);
}

export function resolveTierAmountCents(
  input: Pick<SponsorshipPledgeSubmission, "monthlyTier" | "customAmountCents">,
): number {
  if (input.monthlyTier === "custom") return input.customAmountCents!;
  return SPONSORSHIP_TIER_AMOUNTS_CENTS[input.monthlyTier];
}

export function toPledgeInsert(
  supporterId: string,
  status: SponsorshipPledgeStatus,
  input: SponsorshipPledgeSubmission,
) {
  return {
    supporter_id: supporterId,
    monthly_tier: input.monthlyTier,
    amount_cents: resolveTierAmountCents(input),
    currency: "HKD",
    language: input.language,
    notes: input.notes,
    status,
  };
}

export function toPreferenceInserts(pledgeId: string, input: SponsorshipPledgeSubmission) {
  return input.animalPreferences.map((animal) => ({
    pledge_id: pledgeId,
    sponsor_animal_id: animal.animalId,
    rank: animal.rank,
    animal_name_snapshot: animal.animalName,
    animal_type_snapshot: animal.animalType,
  }));
}

export function toPaymentProofInsert(
  pledgeId: string,
  storagePath: string,
  descriptor: SponsorshipProofDescriptor,
  metadata: SponsorshipPaymentProofMetadata,
) {
  return {
    pledge_id: pledgeId,
    storage_path: storagePath,
    file_name: descriptor.fileName,
    file_type: descriptor.mimeType,
    file_size: descriptor.sizeBytes,
    payment_method: metadata.paymentMethod,
    reference: metadata.reference,
    amount_cents: metadata.amountCents,
    payment_date: metadata.paymentDate,
    review_status: "pending",
  };
}
