import { z } from "zod";
import {
  animalStoryTypes,
  contentLinkRelationships,
  contentLinkTypes,
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

export function isSafePublicHref(value: string | null | undefined) {
  const next = value?.trim();
  if (!next) return false;
  if (next.startsWith("/") && !next.startsWith("//")) return true;

  try {
    const url = new URL(next);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

const optionalSafePublicHref = optionalTrimmed.refine(
  (value) => value === null || isSafePublicHref(value),
  "CTA URL must be an http(s) URL or a root-relative path",
);

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
  ctaUrl: optionalSafePublicHref,
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

export const CONTENT_MEDIA_BUCKET = "content-media";
export const MAX_CONTENT_MEDIA_BYTES = 8 * 1024 * 1024;
export const CONTENT_MEDIA_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

const contentMediaPathSchema = z
  .string()
  .trim()
  .min(1)
  .max(400)
  .refine((path) => !path.startsWith("/"), "Storage paths cannot start with a slash")
  .refine((path) => !path.includes(".."), "Storage paths cannot include parent traversal")
  .refine(
    (path) => /\.(jpe?g|png|webp)$/i.test(path),
    "Storage paths must end in .jpg, .jpeg, .png, or .webp",
  );

export const contentMediaInputSchema = z.object({
  storyUpdateId: z.string().uuid().nullable().optional().default(null),
  storagePath: contentMediaPathSchema,
  altText: trimmed.min(1).max(180),
  caption: optionalTrimmed,
  sortOrder: numberFromInput(z.number().int().min(0)).optional().default(0),
  isCover: z.boolean().default(false),
});

export const contentMediaUploadTargetSchema = z.object({
  objectPath: contentMediaPathSchema,
  mimeType: z.enum(CONTENT_MEDIA_MIME_TYPES),
  byteSize: z.coerce.number().int().min(1).max(MAX_CONTENT_MEDIA_BYTES),
});

export const contentLinkInputSchema = z.object({
  linkedType: z.enum(contentLinkTypes),
  linkedId: z.string().uuid(),
  relationship: z.enum(contentLinkRelationships).default("other"),
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
export type PublicContentSearch = z.infer<typeof publicContentSearchSchema>;
export type ContentInput = z.infer<typeof contentInputSchema>;
export type StoryProfileInput = z.infer<typeof storyProfileInputSchema>;
export type StoryUpdateInput = z.infer<typeof storyUpdateInputSchema>;
export type ContentMediaInput = z.infer<typeof contentMediaInputSchema>;
export type ContentMediaUploadTargetInput = z.infer<typeof contentMediaUploadTargetSchema>;
export type ContentLinkInput = z.infer<typeof contentLinkInputSchema>;
export type SocialCopyStatusInput = z.infer<typeof socialCopyStatusSchema>;
export type NotificationDraftStatusInput = z.infer<typeof notificationDraftStatusSchema>;
export type SocialCopyGenerateInput = z.infer<typeof socialCopyGenerateSchema>;
