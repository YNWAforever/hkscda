import { z } from "zod";

export const statusCategories = [
  "adoption_case",
  "animal_lifecycle",
  "match",
  "followup",
  "final_outcome",
] as const;

const optionalTrimmed = z
  .string()
  .optional()
  .transform((value) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  });

const booleanSearch = z.preprocess((value) => {
  if (value === true || value === 1) return true;
  if (value === false || value === 0 || value === undefined || value === "") return false;

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") return true;
    if (normalized === "false" || normalized === "0" || normalized === "") return false;
  }

  return false;
}, z.boolean());

export const statusInputSchema = z.object({
  category: z.enum(statusCategories),
  key: z.string().trim().regex(/^[a-z][a-z0-9_]*$/),
  labelZh: z.string().trim().min(1),
  labelEn: z.string().trim().min(1),
  sortOrder: z.coerce.number().int().min(0).default(0),
  color: z.string().trim().min(1).default("slate"),
  isActive: z.boolean().default(true),
  isClosing: z.boolean().default(false),
  isFinal: z.boolean().default(false),
});

export const statusUpdateSchema = statusInputSchema.partial().extend({
  delete: z.boolean().optional(),
});

export const caseSearchSchema = z.object({
  q: optionalTrimmed,
  statusId: z.string().uuid().optional(),
  animalType: optionalTrimmed,
  openOnly: booleanSearch.default(false),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(100).catch(25),
});

export const statusTransitionSchema = z.object({
  statusId: z.string().uuid(),
  note: optionalTrimmed,
});

export const matchInputSchema = z.object({
  animalId: z.string().uuid(),
  statusId: z.string().uuid(),
  notes: optionalTrimmed,
});

export const followupInputSchema = z.object({
  title: z.string().trim().min(1),
  statusId: z.string().uuid(),
  scheduledAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  hasWindowNet: z.boolean().optional(),
  environment: optionalTrimmed,
  score: optionalTrimmed,
  volunteer: optionalTrimmed,
  remarks: optionalTrimmed,
});

export const finalizeAdoptionSchema = z.object({
  matchId: z.string().uuid(),
  outcomeStatusId: z.string().uuid(),
  caseNumber: z.string().trim().min(1),
  adoptionFeeCents: z.number().int().min(0).nullable().optional(),
  approvalDate: z.string().date(),
  pickupDate: z.string().date().nullable().optional(),
});
