import { z } from "zod";

import {
  consentChannels,
  consentStatuses,
  crmLanguages,
  donationPurposes,
  manualDonationMethods,
  paymentStatuses,
  supporterRoles,
} from "./types";

const optionalTrimmed = z
  .string()
  .optional()
  .transform((value) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  });

const booleanSearch = z
  .preprocess(
    (value) => {
      if (value === "") return undefined;
      if (value === true) return "true";
      if (value === false) return "false";
      return value;
    },
    z.enum(["true", "false"]).optional(),
  )
  .transform((value) => (value === undefined ? undefined : value === "true"));

// Junk falls back to page 1 as before, but a huge page is refused: page × pageSize is an
// int4 offset in crm_read_supporters, and 50,000,000 overflowed it into a 500 (BUG-18).
const CRM_MAX_PAGE = 100_000;
const pageNumber = z.coerce.number().int().min(1).catch(1).pipe(z.number().max(CRM_MAX_PAGE));
const pageSize = z.coerce.number().int().min(1).max(100).catch(25);

// Same limits as tag-bulk and public_supporter_identity_claims. Without them a single
// PATCH could store a 100k-character phone or 20,000 tags, then copy them into
// audit_log.detail and every export (BUG-12).
const SUPPORTER_PHONE_MAX = 40;
const SUPPORTER_TAG_MAX = 40;
const SUPPORTER_TAGS_MAX = 50;

const normalizedTags = z
  .array(z.string().trim().max(SUPPORTER_TAG_MAX))
  .max(SUPPORTER_TAGS_MAX)
  .optional()
  .default([])
  .transform((tags) => [...new Set(tags.map((tag) => tag.trim()).filter((tag) => tag.length > 0))]);

function normalizeRoles(roles: string[], ctx: z.RefinementCtx) {
  const roleSet = new Set<string>(supporterRoles);
  const normalized = [...new Set(roles.map((role) => role.trim()).filter(Boolean))];
  if (normalized.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "At least one supporter role must be provided",
    });
    return z.NEVER;
  }
  const invalidRole = normalized.find((role) => !roleSet.has(role));
  if (invalidRole) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Unsupported supporter role: ${invalidRole}`,
    });
    return z.NEVER;
  }
  return normalized as Array<(typeof supporterRoles)[number]>;
}

const normalizedRoles = z
  .array(z.string())
  .optional()
  .default(["donor"])
  .transform((roles, ctx) => normalizeRoles(roles, ctx));

const optionalNormalizedRoles = z
  .array(z.string())
  .optional()
  .transform((roles, ctx) => (roles === undefined ? undefined : normalizeRoles(roles, ctx)));

const nullableTrimmed = z
  .string()
  .nullable()
  .optional()
  .transform((value) => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  });

const supporterSearchObject = z.object({
  q: optionalTrimmed,
  page: pageNumber,
  pageSize,
  role: z.enum(supporterRoles).optional(),
  tag: optionalTrimmed,
  consentChannel: z.enum(consentChannels).optional(),
  consentStatus: z.enum(consentStatuses).optional(),
  receiptNeeded: booleanSearch,
  purpose: z.enum(donationPurposes).optional(),
  includeDeleted: booleanSearch,
});

export const supporterSearchSchema = supporterSearchObject.transform((value) => ({
  ...value,
  includeDeleted: value.includeDeleted ?? false,
}));

export const exportSearchSchema = supporterSearchObject
  .omit({ page: true, pageSize: true })
  .transform((value) => ({
    ...value,
    includeDeleted: value.includeDeleted ?? false,
  }));

export const supporterInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z
    .string()
    .trim()
    .email()
    .max(254)
    .transform((email) => email.toLowerCase()),
  phone: optionalTrimmed.refine(
    (value) => value === undefined || value.length <= SUPPORTER_PHONE_MAX,
    { message: `Phone must be at most ${SUPPORTER_PHONE_MAX} characters` },
  ),
  language: z.enum(crmLanguages),
  tags: normalizedTags,
  roles: normalizedRoles,
  source: z.string().trim().min(1).max(80).default("admin_manual"),
});

export const supporterUpdateSchema = z.object({
  expectedVersion: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  name: z.string().trim().min(1).max(120).optional(),
  phone: nullableTrimmed.refine((value) => value == null || value.length <= SUPPORTER_PHONE_MAX, {
    message: `Phone must be at most ${SUPPORTER_PHONE_MAX} characters`,
  }),
  language: z.enum(crmLanguages).optional(),
  tags: normalizedTags.optional(),
  roles: optionalNormalizedRoles,
  deleted: z.boolean().optional(),
});

export const consentUpdateSchema = z
  .object({
    source: z.string().trim().min(1).max(80),
    email: z.boolean().optional(),
    whatsapp: z.boolean().optional(),
    timestamp: z.string().datetime().optional(),
  })
  .refine((value) => value.email !== undefined || value.whatsapp !== undefined, {
    message: "At least one channel consent must be provided",
  })
  // A future-dated consent would permanently win the latest-consent comparison
  // that decides marketing permission, letting a stale opt-in override a later
  // genuine opt-out. Reject future timestamps (allowing a little clock skew).
  .refine(
    (value) =>
      value.timestamp === undefined ||
      new Date(value.timestamp).getTime() <= Date.now() + 5 * 60 * 1000,
    {
      message: "consent timestamp cannot be in the future",
      path: ["timestamp"],
    },
  );

export const manualDonationSchema = z
  .object({
    requestId: z.string().uuid(),
    supporterId: z.string().uuid().optional(),
    supporter: supporterInputSchema.optional(),
    amountCents: z.number().int().min(1000).max(1_000_000),
    currency: z.literal("HKD"),
    purpose: z.enum(donationPurposes),
    method: z.enum(manualDonationMethods),
    paymentStatus: z.enum(paymentStatuses),
    // Same 1–120 bound as reconcile and the bank-statement matcher (BUG-51).
    bankReference: z
      .string()
      .trim()
      .max(120)
      .optional()
      .transform((value) => value || undefined),
    receiptRequested: z.boolean(),
    consents: z
      .object({
        email: z.boolean().optional(),
        whatsapp: z.boolean().optional(),
      })
      .optional(),
  })
  .refine((value) => Boolean(value.supporterId) !== Boolean(value.supporter), {
    message: "Exactly one of supporterId or supporter is required",
  })
  .refine((value) => value.paymentStatus !== "succeeded" || Boolean(value.bankReference), {
    message: "bankReference is required for succeeded manual payments",
    path: ["bankReference"],
  });

export type SupporterSearch = z.infer<typeof supporterSearchSchema>;
export type ExportSearch = z.infer<typeof exportSearchSchema>;
export type SupporterInput = z.infer<typeof supporterInputSchema>;
export type SupporterUpdate = z.infer<typeof supporterUpdateSchema>;
export type ConsentUpdate = z.infer<typeof consentUpdateSchema>;
export type ManualDonationInput = z.infer<typeof manualDonationSchema>;
