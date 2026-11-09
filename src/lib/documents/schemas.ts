import { z } from "zod";

import { requiredReasonSchema } from "../admin/requiredReason";

export const documentKinds = [
  "annual_report",
  "wedding_form",
  "adoption_guide",
  "sponsorship_terms",
] as const;
export const documentLanguages = ["zh-HK", "en", "bilingual"] as const;

const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;
const siteDocumentsBucketSchema = z.literal("site-documents");
const documentPathSchema = z
  .string()
  .trim()
  .min(1)
  .refine((path) => !path.startsWith("/"), "Document paths cannot start with a slash")
  .refine((path) => !path.includes(".."), "Document paths cannot include parent traversal")
  .refine((path) => path.toLowerCase().endsWith(".pdf"), "Document paths must end in .pdf");
const documentByteSizeSchema = z.coerce.number().int().min(1).max(MAX_DOCUMENT_BYTES);
const slotKeySchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9_]+$/);
const sortOrderValueSchema = z.coerce.number().int().min(0);

export const documentIdSchema = z.string().uuid();

const documentAssetFields = {
  kind: z.enum(documentKinds),
  title: z.string().trim().min(1).max(180),
  language: z.enum(documentLanguages),
  bucketName: siteDocumentsBucketSchema,
  objectPath: documentPathSchema,
  mimeType: z.literal("application/pdf"),
  byteSize: documentByteSizeSchema,
  checksumSha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
  sortOrder: sortOrderValueSchema,
} as const;

export const documentAssetInputSchema = z.object({
  ...documentAssetFields,
  bucketName: documentAssetFields.bucketName.default("site-documents"),
  mimeType: documentAssetFields.mimeType.default("application/pdf"),
  checksumSha256: documentAssetFields.checksumSha256.optional().default(null),
  isPublished: z.boolean().default(false),
  sortOrder: documentAssetFields.sortOrder.default(0),
});

/**
 * A PATCH body: every field optional and none applies its own default. zod 4 keeps an inner
 * default when a field is made optional (`.partial()`), so an empty PATCH would parse to the
 * defaults and overwrite fields the caller did not send.
 */
export const documentAssetUpdateSchema = z
  .object({
    kind: documentAssetFields.kind.optional(),
    title: documentAssetFields.title.optional(),
    language: documentAssetFields.language.optional(),
    bucketName: documentAssetFields.bucketName.optional(),
    objectPath: documentAssetFields.objectPath.optional(),
    mimeType: documentAssetFields.mimeType.optional(),
    byteSize: documentAssetFields.byteSize.optional(),
    checksumSha256: documentAssetFields.checksumSha256.optional(),
    sortOrder: documentAssetFields.sortOrder.optional(),
  })
  .strict()
  .refine((input) => Object.keys(input).length > 0, { message: "No document updates supplied" });

const annualReportFields = {
  title: z.string().trim().min(1).max(180),
  yearLabel: z.string().trim().min(1),
  documentAssetId: documentIdSchema,
  sortOrder: sortOrderValueSchema,
} as const;

export const annualReportInputSchema = z.object({
  ...annualReportFields,
  isPublished: z.boolean().default(false),
  sortOrder: annualReportFields.sortOrder.default(0),
});

export const annualReportUpdateSchema = z
  .object({
    title: annualReportFields.title.optional(),
    yearLabel: annualReportFields.yearLabel.optional(),
    documentAssetId: annualReportFields.documentAssetId.optional(),
    sortOrder: annualReportFields.sortOrder.optional(),
  })
  .strict()
  .refine((input) => Object.keys(input).length > 0, {
    message: "No annual report updates supplied",
  });

export const documentSlotInputSchema = z.object({
  slotKey: slotKeySchema,
  language: z.enum(["zh-HK", "en"]),
  documentAssetId: documentIdSchema,
  isPublished: z.boolean().default(false),
});

export const documentListSearchSchema = z.object({
  kind: z.enum(documentKinds).optional(),
  language: z.enum(documentLanguages).optional(),
  q: z
    .string()
    .optional()
    .transform((value) => value?.trim() || undefined),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .catch(25)
    .transform((value) => Math.min(value, 50)),
});

export const uploadTargetSchema = z.object({
  bucketName: siteDocumentsBucketSchema,
  objectPath: documentPathSchema,
  byteSize: documentByteSizeSchema,
});

export type DocumentAssetInput = z.infer<typeof documentAssetInputSchema>;
export type AnnualReportInput = z.infer<typeof annualReportInputSchema>;
export type DocumentSlotInput = z.infer<typeof documentSlotInputSchema>;
export type DocumentListSearch = z.infer<typeof documentListSearchSchema>;
export type UploadTarget = z.infer<typeof uploadTargetSchema>;

/** The body of a document or annual report DELETE: the reason staff gave, trimmed, 1 to 500 characters. */
export const documentDeleteSchema = z.object({ reason: requiredReasonSchema });
