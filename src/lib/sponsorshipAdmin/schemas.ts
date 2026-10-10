import { z } from "zod";

import type { AdminRole } from "../admin/access";
import { requiredReasonSchema } from "../admin/requiredReason";
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
  proof: z.enum(["pending"]).optional(),
  q: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const recordPledgePaymentSchema = z.object({
  idempotencyKey: z.string().uuid(),
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

export const reviewPledgeProofSchema = z
  .object({
    proofId: z.string().uuid(),
    expectedRevision: z.number().int().positive(),
    idempotencyKey: z.string().uuid(),
    decision: z.enum(["approve", "reject"]),
    note: optionalTrimmed,
  })
  .strict()
  .superRefine((value, ctx) => {
    // Approving keeps its optional note; rejecting needs a reason, which the RPC stores in the audit row.
    if (value.decision !== "reject") return;
    if (!requiredReasonSchema.safeParse(value.note ?? "").success)
      ctx.addIssue({ code: "custom", path: ["note"], message: "A reason is required" });
  });

export const cancelPledgeSchema = z.object({
  note: requiredReasonSchema,
});

export const assignAnimalSchema = z.object({
  animalId: z.string().uuid(),
  note: optionalTrimmed,
});

export const endAssignmentSchema = z.object({
  reason: z.enum([
    "adopted",
    "deceased",
    "ineligible",
    "retired",
    "supporter_request",
    "transferred",
    "other",
  ]),
  note: optionalTrimmed,
});

/**
 * The roles allowed to review pledges. Must stay in lockstep with the
 * `sponsorshipReview` access area in src/lib/admin/access.ts — a later
 * task adds an assertion in src/lib/admin/access.test.ts that the two agree.
 */
export const SPONSORSHIP_REVIEW_ROLES = ["staff", "admin"] as const satisfies readonly AdminRole[];
