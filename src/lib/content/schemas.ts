import { z } from "zod";
import {
  animalStoryTypes,
  contentStatuses,
  contentTypes,
  notificationDraftStatuses,
  rescuePublicStatuses,
  socialCopyStatuses,
  socialPlatforms,
  storyUpdateKinds,
  storyUpdateVisibilities,
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

export const contentSearchSchema = z.object({
  q: optionalTrimmed.optional().transform((value) => value ?? undefined),
  type: z.enum(contentTypes).optional(),
  status: z.enum(contentStatuses).optional(),
  animalType: z.enum(animalStoryTypes).optional(),
  publicStatus: z.enum(rescuePublicStatuses).optional(),
  rescueRegion: optionalTrimmed.optional().transform((value) => value ?? undefined),
  page: boundedPage.default(1),
  pageSize: boundedPageSize.default(25),
});

export const publicContentSearchSchema = contentSearchSchema.extend({
  status: z.literal("published").optional().default("published"),
});

export const contentInputSchema = z.object({
  type: z.enum(contentTypes),
  slug: trimmed
    .min(1)
    .max(180)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: trimmed.min(1).max(180),
  subtitle: optionalTrimmed,
  summary: trimmed.min(1).max(320),
  body: optionalTrimmed,
  coverMediaId: z.string().uuid().nullable().optional().default(null),
  status: z.enum(contentStatuses).default("draft"),
  publishedAt: z.string().datetime().nullable().optional().default(null),
  ctaLabel: optionalTrimmed,
  ctaUrl: optionalTrimmed,
  seoTitle: optionalTrimmed,
  seoDescription: optionalTrimmed,
  ogTitle: optionalTrimmed,
  ogDescription: optionalTrimmed,
});

export const storyProfileInputSchema = z.object({
  animalType: z.enum(animalStoryTypes),
  publicStatus: z.enum(rescuePublicStatuses),
  rescueRegion: trimmed.min(1).max(80),
  rescueDate: z.string().date().nullable().optional().default(null),
  showOnMap: z.boolean().default(false),
  publicMapLabel: optionalTrimmed,
  publicLat: numberFromInput(z.number().min(-90).max(90)).nullable().optional().default(null),
  publicLng: numberFromInput(z.number().min(-180).max(180)).nullable().optional().default(null),
  internalAddress: optionalTrimmed,
  internalLocationNotes: optionalTrimmed,
  isFeatured: z.boolean().default(false),
});

export const storyUpdateInputSchema = z.object({
  kind: z.enum(storyUpdateKinds),
  title: trimmed.min(1).max(180),
  body: optionalTrimmed,
  occurredAt: z.string().datetime(),
  visibility: z.enum(storyUpdateVisibilities).default("public"),
  shouldGenerateAdopterDrafts: z.boolean().default(false),
});

export const socialCopyStatusSchema = z.object({
  status: z.enum(socialCopyStatuses),
});

export const notificationDraftStatusSchema = z.object({
  status: z.enum(notificationDraftStatuses),
});

export const socialCopyGenerateSchema = z.object({
  platform: z.enum(socialPlatforms).optional(),
  storyUpdateId: z.string().uuid().nullable().optional().default(null),
});

export type ContentSearch = z.infer<typeof contentSearchSchema>;
export type ContentInput = z.infer<typeof contentInputSchema>;
export type StoryProfileInput = z.infer<typeof storyProfileInputSchema>;
export type StoryUpdateInput = z.infer<typeof storyUpdateInputSchema>;
