import { z } from "zod";

export const documentKinds = ["annual_report", "wedding_form", "adoption_guide"] as const;
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
const sortOrderSchema = z.coerce.number().int().min(0).default(0);

export const documentIdSchema = z.string().uuid();
export const documentAssetInputSchema = z.object({
  kind: z.enum(documentKinds),
  title: z.string().trim().min(1).max(180),
  language: z.enum(documentLanguages),
  bucketName: siteDocumentsBucketSchema.default("site-documents"),
  objectPath: documentPathSchema,
  mimeType: z.literal("application/pdf").default("application/pdf"),
  byteSize: documentByteSizeSchema,
  checksumSha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable()
    .optional()
    .default(null),
  isPublished: z.boolean().default(false),
  sortOrder: sortOrderSchema,
});

export const annualReportInputSchema = z.object({
  title: z.string().trim().min(1).max(180),
  yearLabel: z.string().trim().min(1),
  documentAssetId: documentIdSchema,
  isPublished: z.boolean().default(false),
  sortOrder: sortOrderSchema,
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
