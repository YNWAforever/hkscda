import { z } from "zod";

import {
  groupEnquiryActivityTypes,
  groupEnquiryNotificationStatuses,
  groupEnquiryStatuses,
} from "./types";

const trimmed = z.string().trim();
const optionalTrimmed = z
  .string()
  .optional()
  .nullable()
  .transform((value) => {
    const next = value?.trim();
    return next ? next : null;
  });

const normalizedEmailSchema = trimmed
  .email()
  .max(254)
  .transform((email) => email.toLowerCase());

const normalizedPhoneSchema = trimmed
  .min(3)
  .max(60)
  .transform((phone) => phone.replace(/[\s-]/g, ""));

const optionalPositiveCount = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) return null;
  if (typeof value === "string") return Number(value);
  return value;
}, z.number().int().positive().max(500).nullable().default(null));

function requireOtherDescription(
  value: { activityType: string; otherActivityDescription?: string | null },
  ctx: z.RefinementCtx,
) {
  if (value.activityType === "other" && !value.otherActivityDescription) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["otherActivityDescription"],
      message: "Please describe the activity content",
    });
  }
}

export const publicGroupEnquirySchema = z
  .object({
    organisationName: trimmed.min(1).max(160),
    contactPerson: trimmed.min(1).max(120),
    email: normalizedEmailSchema,
    phone: normalizedPhoneSchema,
    activityType: z.enum(groupEnquiryActivityTypes),
    otherActivityDescription: optionalTrimmed,
    participantCount: optionalPositiveCount,
    participantAgeProfile: optionalTrimmed.pipe(z.string().max(200).nullable()),
    preferredDateNotes: optionalTrimmed.pipe(z.string().max(300).nullable()),
    message: optionalTrimmed.pipe(z.string().max(2000).nullable()),
    idempotencyKey: z.string().uuid(),
    turnstileToken: trimmed.min(1),
  })
  .strip()
  .superRefine(requireOtherDescription)
  .transform((value) => ({
    ...value,
    otherActivityDescription:
      value.activityType === "other" ? value.otherActivityDescription : null,
  }));

export const adminGroupEnquiryUpdateSchema = z.object({
  status: z.enum(["new", "in_progress", "resolved", "closed"]).optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  adminNotes: optionalTrimmed.optional(),
});

export type PublicGroupEnquiryInput = z.infer<typeof publicGroupEnquirySchema>;

const boundedPage = z.coerce.number().int().min(1).catch(1);
const boundedPageSize = z.coerce.number().int().min(1).catch(25).transform((value) => Math.min(value, 50));

export const groupEnquirySearchSchema = z.object({
  q: optionalTrimmed.optional().transform((value) => value ?? undefined),
  status: z.enum(groupEnquiryStatuses).optional(),
  notificationStatus: z.enum(groupEnquiryNotificationStatuses).optional(),
  page: boundedPage.default(1),
  pageSize: boundedPageSize.default(25),
});

export const adminGroupEnquiryPatchSchema = adminGroupEnquiryUpdateSchema.extend({
  id: z.string().min(1),
  action: z.literal("retryNotification").optional(),
});
