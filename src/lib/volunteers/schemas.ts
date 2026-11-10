import { z } from "zod";

import { requiredReasonSchema } from "../admin/requiredReason";
import {
  volunteerActivityStatuses,
  volunteerActivityTypes,
  volunteerAttendanceStatuses,
  volunteerRegistrationStatuses,
  volunteerRegistrationTypes,
  volunteerUnderagePolicies,
  PUBLIC_INDIVIDUAL_MIN_AGE,
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

function numberFromInput(schema: z.ZodNumber) {
  return z.preprocess((value) => {
    if (typeof value === "string" && value.trim() !== "") return Number(value);
    return value;
  }, schema);
}

const boundedPage = numberFromInput(z.number().int().min(1)).catch(1);
const boundedPageSize = numberFromInput(z.number().int().min(1))
  .catch(25)
  .transform((value) => Math.min(value, 50));

/** A search box value: an absent, blank or untrimmed string becomes undefined (an optional key). */
const searchText = z
  .string()
  .trim()
  .transform((value) => (value ? value : undefined))
  .optional();

export const volunteerActivitySearchSchema = z
  .object({
    status: z.enum(volunteerActivityStatuses).optional(),
    type: z.enum(volunteerActivityTypes).optional(),
    q: searchText,
    page: boundedPage.default(1),
    pageSize: boundedPageSize.default(25),
  })
  .transform((value) => ({ ...value }));

export const volunteerRegistrationSearchSchema = z.object({
  q: searchText,
  activityId: z.string().uuid().optional(),
  status: z.enum(volunteerRegistrationStatuses).optional(),
  attendanceStatus: z.enum(volunteerAttendanceStatuses).optional(),
  page: boundedPage.default(1),
  pageSize: boundedPageSize.default(25),
});

const adminActivityFields = {
  idempotencyKey: z.string().uuid(),
  type: z.enum(volunteerActivityTypes),
  title: trimmed.min(1).max(160),
  description: optionalTrimmed,
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().nullable(),
  location: trimmed.min(1).max(160),
  capacity: numberFromInput(z.number().int().min(1).max(500)),
  minAge: numberFromInput(z.number().int().min(0).max(120)).nullable(),
  underagePolicy: z.enum(volunteerUnderagePolicies),
  autoApprove: z.boolean(),
  allowWaitlist: z.boolean(),
  status: z.enum(volunteerActivityStatuses),
  registrationModes: z.array(z.enum(volunteerRegistrationTypes)).min(1),
} as const;

const adminActivityFieldsSchema = z.object({
  ...adminActivityFields,
  idempotencyKey: adminActivityFields.idempotencyKey.optional(),
  endsAt: adminActivityFields.endsAt.optional().default(null),
  minAge: adminActivityFields.minAge.optional().default(null),
  underagePolicy: adminActivityFields.underagePolicy.default("allow_with_guardian_pending"),
  autoApprove: adminActivityFields.autoApprove.default(false),
  allowWaitlist: adminActivityFields.allowWaitlist.default(true),
  status: adminActivityFields.status.default("draft"),
});

/**
 * The table checks ends_at >= starts_at, but the schema did not, so an end before the
 * start reached Postgres as 23514 and came back as a 500 (BUG-17). An update that sends
 * only one of the two is checked against the stored value by that constraint.
 */
function endsAtOrAfterStart(
  input: { startsAt?: string; endsAt?: string | null },
  ctx: z.RefinementCtx,
) {
  if (!input.startsAt || !input.endsAt) return;
  if (Date.parse(input.endsAt) < Date.parse(input.startsAt)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["endsAt"],
      message: "endsAt must not be before startsAt",
    });
  }
}

export const adminActivityInputSchema = adminActivityFieldsSchema.superRefine(endsAtOrAfterStart);

/**
 * A PATCH body: every field optional and none applies its own default. zod 4 keeps an inner
 * default when a field is made optional (`.partial()`), so an update that changed only the
 * title would also write the default capacity switches and status.
 */
export const adminActivityUpdateSchema = z
  .object({
    idempotencyKey: adminActivityFields.idempotencyKey.optional(),
    type: adminActivityFields.type.optional(),
    title: adminActivityFields.title.optional(),
    description: adminActivityFields.description.optional(),
    startsAt: adminActivityFields.startsAt.optional(),
    endsAt: adminActivityFields.endsAt.optional(),
    location: adminActivityFields.location.optional(),
    capacity: adminActivityFields.capacity.optional(),
    minAge: adminActivityFields.minAge.optional(),
    underagePolicy: adminActivityFields.underagePolicy.optional(),
    autoApprove: adminActivityFields.autoApprove.optional(),
    allowWaitlist: adminActivityFields.allowWaitlist.optional(),
    status: adminActivityFields.status.optional(),
    registrationModes: adminActivityFields.registrationModes.optional(),
  })
  .extend({ expectedUpdatedAt: z.string().datetime({ offset: true }) })
  .superRefine(endsAtOrAfterStart);

/**
 * A status change. Rejecting needs a reason (trimmed, 1-500 characters; SP-5b-2); every other
 * status takes none and parses to `reason: null`.
 */
export const adminRegistrationStatusSchema = z
  .object({
    expectedUpdatedAt: z.string().datetime({ offset: true }),
    status: z.enum(volunteerRegistrationStatuses),
    internalNotes: optionalTrimmed.optional(),
    reason: z.string().optional().nullable(),
  })
  .superRefine((value, ctx) => {
    const reason = requiredReasonSchema.safeParse(value.reason ?? "");
    const given = (value.reason ?? "").trim() !== "";
    if ((value.status === "rejected" || given) && !reason.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reason"],
        message:
          value.status === "rejected"
            ? "Rejecting a registration requires a reason of 1 to 500 characters"
            : "A reason is at most 500 characters",
      });
    }
  })
  .transform((value) => ({
    ...value,
    reason: value.reason?.trim() ? value.reason.trim() : null,
  }));

export const adminAttendanceUpdateSchema = z
  .object({
    expectedUpdatedAt: z.string().datetime({ offset: true }),
    command: z.enum(["record", "correct"]).default("record"),
    reason: z.string().trim().min(1).max(2000).optional(),
    attendanceStatus: z.enum(volunteerAttendanceStatuses),
    volunteerHours: numberFromInput(z.number().min(0).max(24)).nullable().optional(),
    internalNotes: optionalTrimmed.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.command === "correct" && !value.reason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reason"],
        message: "Factual corrections require a reason",
      });
    }
  });

const contactSchema = z.object({
  name: trimmed.min(1).max(120),
  email: trimmed
    .email()
    .max(254)
    .transform((email) => email.toLowerCase()),
  phone: trimmed.min(3).max(40),
  language: z.enum(["zh-HK", "en"]).default("zh-HK"),
});

export const publicRegistrationSchema = z
  .object({
    activityId: z.string().uuid(),
    // Clients generate this 32-byte bearer token once and reuse it on transport retries.
    submissionToken: z
      .string()
      .regex(/^[A-Za-z0-9_-]{43}$/)
      .refine((value) => {
        const decoded = Buffer.from(value, "base64url");
        return decoded.length === 32 && decoded.toString("base64url") === value;
      }),
    registrationType: z.enum(volunteerRegistrationTypes),
    contact: contactSchema,
    participantCount: numberFromInput(z.number().int().min(1).max(500)),
    organizationName: optionalTrimmed.optional(),
    declaredAge: numberFromInput(z.number().int().min(0).max(120)).nullable().optional(),
    youngestAge: numberFromInput(z.number().int().min(0).max(120)).nullable().optional(),
    guardianName: optionalTrimmed.optional(),
    guardianPhone: optionalTrimmed.optional(),
    notes: optionalTrimmed.optional(),
    consents: z.object({
      email: z.boolean().default(false),
      whatsapp: z.boolean().default(false),
    }),
    turnstileToken: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.registrationType === "group") {
      if (!value.organizationName) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["organizationName"],
          message: "Organization name is required for group registrations",
        });
      }
      if (!value.guardianName) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["guardianName"],
          message: "Supervisor name is required for group registrations",
        });
      }
      if (!value.guardianPhone) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["guardianPhone"],
          message: "Supervisor phone is required for group registrations",
        });
      }
    } else {
      if (value.participantCount !== 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["participantCount"],
          message: "Individual registrations must be for one participant",
        });
      }
      if (value.declaredAge === null || value.declaredAge === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["declaredAge"],
          message: "Individual volunteers must be at least " + PUBLIC_INDIVIDUAL_MIN_AGE,
        });
      } else if (value.declaredAge < PUBLIC_INDIVIDUAL_MIN_AGE) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["declaredAge"],
          message: "Individual volunteers must be at least " + PUBLIC_INDIVIDUAL_MIN_AGE,
        });
      }
    }
  })
  .transform((value) => ({
    ...value,
    organizationName: value.organizationName ?? null,
    declaredAge: value.declaredAge ?? null,
    youngestAge: value.youngestAge ?? null,
    guardianName: value.guardianName ?? null,
    guardianPhone: value.guardianPhone ?? null,
    notes: value.notes ?? null,
  }));

export const publicStatusTokenSchema = z.object({
  token: z.string().min(10),
});

export type VolunteerActivitySearch = z.infer<typeof volunteerActivitySearchSchema>;
export type VolunteerRegistrationSearch = z.infer<typeof volunteerRegistrationSearchSchema>;
export type AdminActivityInput = z.infer<typeof adminActivityInputSchema>;
export type PublicVolunteerRegistrationInput = z.infer<typeof publicRegistrationSchema>;
