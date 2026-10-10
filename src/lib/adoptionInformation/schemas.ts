import { z } from "zod";
import { requiredReasonSchema } from "../admin/requiredReason";

const optionalId = z.string().uuid().optional();
const sortOrder = z.coerce.number().int().min(0);
const optionalNotes = z
  .string()
  .trim()
  .nullable()
  .optional()
  .transform((value) => value || null);
const bilingualText = (max: number) =>
  z.object({
    "zh-HK": z.string().trim().min(1).max(max),
    en: z.string().trim().min(1).max(max),
  });

export const adoptionInformationIdSchema = z.string().uuid();
export const adoptionFeeInputSchema = z.object({
  id: optionalId,
  animalType: z.enum(["dog", "cat"]),
  itemName: z.string().trim().min(1).max(180),
  priceHkd: z.string().trim().min(1).max(40),
  sortOrder,
  isPublished: z.boolean().default(true),
});

export const updateFeeContentInputSchema = z
  .object({
    id: adoptionInformationIdSchema,
    expectedVersion: z.number().int().positive(),
    itemName: z.string().trim().min(1).max(180),
    priceHkd: z.string().trim().min(1).max(40),
  })
  .strict();
export const reorderFeesInputSchema = z
  .object({
    firstId: adoptionInformationIdSchema,
    secondId: adoptionInformationIdSchema,
    expectedVersions: z
      .object({
        first: z.number().int().positive(),
        second: z.number().int().positive(),
      })
      .strict(),
  })
  .strict()
  .refine((value) => value.firstId !== value.secondId, {
    message: "Two distinct fee IDs required",
  });

export const estateContentFieldsSchema = z
  .object({
    estateName: z.string().trim().min(1).max(180),
    district: z.string().trim().min(1).max(120),
    notes: optionalNotes,
    sortOrder,
  })
  .strict();
export const createEstateInputSchema = estateContentFieldsSchema
  .extend({
    id: z.string().uuid(),
  })
  .strict();
export const updateEstateInputSchema = z
  .object({
    id: adoptionInformationIdSchema,
    expectedVersion: z.number().int().positive(),
    fields: estateContentFieldsSchema,
  })
  .strict();
export const setEstatePublicationInputSchema = z
  .object({
    id: adoptionInformationIdSchema,
    expectedVersion: z.number().int().positive(),
    isPublished: z.boolean(),
  })
  .strict();
export const feeCommandRequestSchema = z.discriminatedUnion("command", [
  z
    .object({
      resource: z.literal("fee"),
      command: z.literal("content"),
      input: updateFeeContentInputSchema,
    })
    .strict(),
  z
    .object({
      resource: z.literal("fee"),
      command: z.literal("reorder"),
      input: reorderFeesInputSchema,
    })
    .strict(),
]);

export const estateCommandRequestSchema = z.discriminatedUnion("command", [
  z
    .object({
      resource: z.literal("estate"),
      command: z.literal("create"),
      input: createEstateInputSchema,
    })
    .strict(),
  z
    .object({
      resource: z.literal("estate"),
      command: z.literal("update"),
      input: updateEstateInputSchema,
    })
    .strict(),
  z
    .object({
      resource: z.literal("estate"),
      command: z.literal("publication"),
      input: setEstatePublicationInputSchema,
    })
    .strict(),
]);

export const adoptionRuleInputSchema = z.object({
  id: optionalId,
  content: bilingualText(500),
  sortOrder,
  isPublished: z.boolean().default(true),
});

export const careTopicInputSchema = z.object({
  id: optionalId,
  animalType: z.enum(["dog", "cat"]),
  label: bilingualText(40),
  content: bilingualText(1000),
  sortOrder,
  isPublished: z.boolean().default(true),
});

export const adminAdoptionInformationQuerySchema = z.object({
  resource: z.enum(["fees", "estates", "rules", "careTopics"]).catch("fees"),
  q: z
    .string()
    .optional()
    .transform((value) => value?.trim() || undefined),
  animalType: z.enum(["dog", "cat"]).optional(),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .catch(25)
    .transform((value) => Math.min(value, 50)),
});

export const adoptionInformationMutationSchema = z.discriminatedUnion("resource", [
  z.object({ resource: z.literal("fee"), input: adoptionFeeInputSchema }),
  z.object({ resource: z.literal("rule"), input: adoptionRuleInputSchema }),
  z.object({ resource: z.literal("careTopic"), input: careTopicInputSchema }),
]);

export const deleteEstateRequestSchema = z.object({
  id: adoptionInformationIdSchema,
  reason: requiredReasonSchema,
});

export type AdoptionFeeInput = z.infer<typeof adoptionFeeInputSchema>;
export type UpdateFeeContentInput = z.infer<typeof updateFeeContentInputSchema>;
export type ReorderFeesInput = z.infer<typeof reorderFeesInputSchema>;
export type EstateContentFields = z.infer<typeof estateContentFieldsSchema>;
export type CreateEstateInput = z.infer<typeof createEstateInputSchema>;
export type UpdateEstateInput = z.infer<typeof updateEstateInputSchema>;
export type SetEstatePublicationInput = z.infer<typeof setEstatePublicationInputSchema>;
export type AdoptionRuleInput = z.infer<typeof adoptionRuleInputSchema>;
export type CareTopicInput = z.infer<typeof careTopicInputSchema>;
