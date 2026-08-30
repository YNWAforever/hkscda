import { z } from "zod";

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

export const estateInputSchema = z.object({
  id: optionalId,
  estateName: z.string().trim().min(1).max(180),
  district: z.string().trim().min(1).max(120),
  notes: optionalNotes,
  sortOrder,
  isPublished: z.boolean().default(false),
});

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
  z.object({ resource: z.literal("estate"), input: estateInputSchema }),
  z.object({ resource: z.literal("rule"), input: adoptionRuleInputSchema }),
  z.object({ resource: z.literal("careTopic"), input: careTopicInputSchema }),
]);

export const deleteEstateRequestSchema = z.object({ id: adoptionInformationIdSchema });

export type AdoptionFeeInput = z.infer<typeof adoptionFeeInputSchema>;
export type EstateInput = z.infer<typeof estateInputSchema>;
export type AdoptionRuleInput = z.infer<typeof adoptionRuleInputSchema>;
export type CareTopicInput = z.infer<typeof careTopicInputSchema>;
