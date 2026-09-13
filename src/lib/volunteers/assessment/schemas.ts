import { z } from "zod";
import { monthlyPolicySchema } from "../policy/schemas";
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const assessmentCommandSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("list") }).strict(),
  z
    .object({
      kind: z.literal("save"),
      body: monthlyPolicySchema,
      expected_revision: z.number().int().min(0),
    })
    .strict(),
  z.object({ kind: z.literal("preview") }).strict(),
  z
    .object({
      kind: z.literal("publish"),
      expected_revision: z.number().int().positive(),
      effective_from: date,
      reason: z.string().trim().min(1).max(1000),
    })
    .strict(),
  z
    .object({
      kind: z.literal("run"),
      period_start: date,
      scope_key: z.enum(["combined", "cat", "dog"]),
    })
    .strict(),
]);
export type AssessmentCommand = z.infer<typeof assessmentCommandSchema>;
export type AssessmentResult = { kind: string; [key: string]: unknown };
