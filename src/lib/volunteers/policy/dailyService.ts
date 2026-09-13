import { z } from "zod";
import { policyReadySchema } from "./schemas";
const uuid = z.string().uuid();
export const dailyPolicyCommandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list") }).strict(),
  z
    .object({
      action: z.literal("preview"),
      scope_key: z.string().regex(/^(cat|dog|adoption|all):[a-z][a-z0-9_-]{0,79}$/),
      service_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      expected_revision: z.number().int().positive(),
      body: policyReadySchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("publish"),
      preview_id: uuid,
      idempotency_key: uuid,
      reason: z.string().trim().min(1).max(1000),
    })
    .strict(),
]);
export type DailyPolicyCommand = z.infer<typeof dailyPolicyCommandSchema>;
export type DailyPolicyResult = { kind?: string; [key: string]: unknown };
export function createDailyPolicyService(
  execute: (actor: string, command: DailyPolicyCommand) => Promise<DailyPolicyResult>,
) {
  return {
    command: (actor: string, raw: unknown) => execute(actor, dailyPolicyCommandSchema.parse(raw)),
  };
}
