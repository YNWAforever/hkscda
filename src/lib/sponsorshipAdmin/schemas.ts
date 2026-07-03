import { z } from "zod";

import {
  isoDate,
  MAX_PROOF_BYTES,
  optionalTrimmed,
  paymentMethodSchema,
  PROOF_MIME_TYPES,
  trimmed,
} from "../sponsorship/schemas";

export const pledgeStatusSchema = z.enum([
  "pending_payment",
  "provisional",
  "active",
  "needs_followup",
  "cancelled",
]);

export const pledgeListSearchSchema = z.object({
  status: pledgeStatusSchema.optional(),
  q: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const recordPledgePaymentSchema = z.object({
  paymentMethod: paymentMethodSchema,
  reference: optionalTrimmed,
  amountCents: z.number().int().positive(),
  paymentDate: isoDate,
  note: optionalTrimmed,
  file: z
    .object({
      storagePath: trimmed.min(1),
      fileName: trimmed.min(1).max(180),
      fileType: z.enum(PROOF_MIME_TYPES),
      fileSize: z.number().int().positive().max(MAX_PROOF_BYTES),
    })
    .nullable()
    .optional(),
});

export const reviewPledgeProofSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  note: optionalTrimmed,
});

export const cancelPledgeSchema = z.object({
  note: optionalTrimmed,
});
