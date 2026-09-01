import { z } from "zod";

export const paymentPublicConfigIdSchema = z.string().uuid();
export const paymentPublicConfigVersionSchema = z.coerce.number().int().positive();
export const paymentPublicConfigMethodSchema = z.enum([
  "stripe",
  "payme",
  "fps",
  "paypal",
  "alipayhk",
]);
export const paymentPublicConfigStateSchema = z.enum([
  "draft",
  "in_review",
  "published",
  "archived",
]);
export const paymentPublicConfigDetailsSchema = z.record(z.string(), z.string()).default({});

export const paymentPublicConfigDraftInputSchema = z.object({
  method: paymentPublicConfigMethodSchema,
  isPubliclyVisible: z.boolean().default(false),
  displayLabelZh: z.string().trim().min(1).max(80),
  displayLabelEn: z.string().trim().min(1).max(80),
  sortOrder: z.coerce.number().int().min(0).default(0),
  details: paymentPublicConfigDetailsSchema,
});

export const paymentPublicConfigMutationSchema = paymentPublicConfigDraftInputSchema.extend({
  expectedVersion: paymentPublicConfigVersionSchema,
});

export const paymentPublicConfigTransitionSchema = z.object({
  expectedVersion: paymentPublicConfigVersionSchema,
});

export const paymentPublicConfigPublishSchema = paymentPublicConfigTransitionSchema.extend({
  idempotencyKey: z.string().trim().min(16).max(200),
});
