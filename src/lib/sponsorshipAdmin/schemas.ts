import { z } from "zod";

import { paymentMethodSchema } from "../sponsorship/schemas";

const trimmed = z.string().trim();
const optionalTrimmedNullable = z
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
  reference: optionalTrimmedNullable,
  amountCents: z.number().int().positive(),
  paymentDate: isoDate,
  note: optionalTrimmedNullable,
  file: z
    .object({
      storagePath: trimmed.min(1),
      fileName: trimmed.min(1).max(180),
      fileType: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]),
      fileSize: z
        .number()
        .int()
        .positive()
        .max(8 * 1024 * 1024),
    })
    .optional(),
});

export const reviewPledgeProofSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  note: optionalTrimmedNullable,
});

export const cancelPledgeSchema = z.object({
  note: optionalTrimmedNullable,
});
