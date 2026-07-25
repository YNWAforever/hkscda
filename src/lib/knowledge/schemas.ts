import { z } from "zod";

const optionalId = z.string().uuid().optional();
const requiredText = (max: number) => z.string().trim().min(1).max(max);
const nullableText = (max: number) => z
  .string()
  .trim()
  .max(max)
  .nullable()
  .optional()
  .transform((value) => value || null);
const httpsUrl = z
  .string()
  .trim()
  .url()
  .refine((value) => new URL(value).protocol === "https:", "URL must use https");

export const knowledgeIdSchema = z.string().uuid();

export const adminKnowledgeQuerySchema = z.object({
  q: z.string().optional().transform((value) => value?.trim() || undefined),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(1).catch(25).transform((value) => Math.min(value, 50)),
  status: z.enum(["all", "published", "draft"]).catch("all"),
});

const rawKnowledgePostInputSchema = z.object({
  id: optionalId,
  title: requiredText(180),
  topic: requiredText(120),
  shortIntro: requiredText(500),
  sourceName: nullableText(120),
  externalUrl: httpsUrl.optional(),
  documentAssetId: z.string().uuid().optional(),
  isPublished: z.boolean().default(false),
  sortOrder: z.coerce.number().int().min(0).default(0),
}).superRefine((value, context) => {
  if (Number(Boolean(value.externalUrl)) + Number(Boolean(value.documentAssetId)) !== 1) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Choose exactly one knowledge destination", path: ["destination"] });
  }
}).transform((value) => ({
  id: value.id,
  title: value.title,
  topic: value.topic,
  shortIntro: value.shortIntro,
  sourceName: value.sourceName,
  destination: value.externalUrl
    ? { kind: "external" as const, url: value.externalUrl }
    : { kind: "document" as const, assetId: value.documentAssetId! },
  isPublished: value.isPublished,
  sortOrder: value.sortOrder,
}));

export const knowledgePostInputSchema = z.preprocess((value) => {
  if (!value || typeof value !== "object" || !("destination" in value)) return value;
  const input = value as Record<string, unknown>;
  const destination = input.destination as Record<string, unknown>;
  return {
    ...input,
    externalUrl: destination?.kind === "external" ? destination.url : undefined,
    documentAssetId: destination?.kind === "document" ? destination.assetId : undefined,
  };
}, rawKnowledgePostInputSchema);

export const deleteKnowledgePostSchema = z.object({ id: knowledgeIdSchema });

export type KnowledgePostInput = z.infer<typeof knowledgePostInputSchema>;
export type AdminKnowledgeQuery = z.infer<typeof adminKnowledgeQuerySchema>;
