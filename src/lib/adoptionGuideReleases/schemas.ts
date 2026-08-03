import { z } from "zod";

export const adoptionGuideReleaseIdSchema = z.string().uuid();
export const adoptionGuideVersionSchema = z.coerce.number().int().positive();
export const adoptionGuideSpeciesSchema = z.enum(["cat", "dog", "general"]);
export const adoptionGuideStateSchema = z.enum(["draft", "in_review", "published", "archived"]);

export const adoptionGuideDraftInputSchema = z.object({
  topic: z
    .string()
    .trim()
    .regex(/^[a-z0-9_]+$/)
    .max(80),
  species: adoptionGuideSpeciesSchema,
  zhHkAssetId: z.string().uuid().nullable(),
  enAssetId: z.string().uuid().nullable(),
  knowledgeTitle: z.string().trim().max(180),
  knowledgeTopic: z.string().trim().max(120),
  knowledgeShortIntro: z.string().trim().max(500),
  knowledgeSourceName: z
    .string()
    .trim()
    .max(120)
    .nullable()
    .transform((value) => value || null),
  sortOrder: z.coerce.number().int().min(0),
});

export const adoptionGuideMutationSchema = adoptionGuideDraftInputSchema.extend({
  expectedVersion: adoptionGuideVersionSchema,
});

export const adoptionGuideTransitionSchema = z.object({
  expectedVersion: adoptionGuideVersionSchema,
});

export const adoptionGuidePublishSchema = adoptionGuideTransitionSchema.extend({
  idempotencyKey: z.string().trim().min(16).max(200),
});
