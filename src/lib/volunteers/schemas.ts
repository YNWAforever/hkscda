import { z } from "zod";

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

export const volunteerActivitySearchSchema = z
  .object({
    status: z.enum(volunteerActivityStatuses).optional(),
    type: z.enum(volunteerActivityTypes).optional(),
    q: optionalTrimmed.optional().transform((value) => value ?? undefined),
    page: boundedPage.default(1),
    pageSize: boundedPageSize.default(25),
  })
  .transform((value) => ({
    status: value.status,
    type: value.type,
    q: value.q,
    page: value.page,
    pageSize: value.pageSize,
  }));

export const volunteerRegistrationSearchSchema = z.object({
  q: optionalTrimmed.optional().transform((value) => value ?? undefined),
  activityId: z.string().uuid().optional(),
  status: z.enum(volunteerRegistrationStatuses).optional(),
  attendanceStatus: z.enum(volunteerAttendanceStatuses).optional(),
  page: boundedPage.default(1),
  pageSize: boundedPageSize.default(25),
});

export const adminActivityInputSchema = z.object({
  type: z.enum(volunteerActivityTypes),
  title: trimmed.min(1).max(160),
  description: optionalTrimmed,
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().nullable().optional().default(null),
  location: trimmed.min(1).max(160),
  capacity: numberFromInput(z.number().int().min(1).max(500)),
  minAge: numberFromInput(z.number().int().min(0).max(120)).nullable().optional().default(null),
  underagePolicy: z.enum(volunteerUnderagePolicies).default("allow_with_guardian_pending"),
  autoApprove: z.boolean().default(false),
  allowWaitlist: z.boolean().default(true),
  status: z.enum(volunteerActivityStatuses).default("draft"),
  registrationModes: z.array(z.enum(volunteerRegistrationTypes)).min(1),
});

export const adminActivityUpdateSchema = adminActivityInputSchema.partial();

export const adminRegistrationStatusSchema = z.object({
  status: z.enum(volunteerRegistrationStatuses),
  internalNotes: optionalTrimmed.optional(),
});

export const adminAttendanceUpdateSchema = z.object({
  attendanceStatus: z.enum(volunteerAttendanceStatuses),
  volunteerHours: numberFromInput(z.number().min(0).max(24)).nullable().optional().default(null),
  internalNotes: optionalTrimmed.optional(),
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
