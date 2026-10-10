import { z } from "zod";
import { policyValidationMessage } from "./messages";
import { policyDraftSchema } from "./schemas";

const templateKey = z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/);
const uuid = z.string().uuid();
export const policyCommandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list") }).strict(),
  z
    .object({
      action: z.literal("save"),
      template_key: templateKey,
      expected_revision: z.number().int().nonnegative(),
      body: policyDraftSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("preview"),
      template_key: templateKey,
      expected_revision: z.number().int().positive(),
      effective_from: z.string().datetime({ offset: true }),
      effective_until: z.string().datetime({ offset: true }).nullable(),
      activity_ids: z.array(uuid).max(100),
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
  z
    .object({
      action: z.literal("generate"),
      template_key: templateKey,
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      idempotency_key: uuid,
    })
    .strict(),
  z
    .object({
      action: z.literal("copy"),
      version_id: uuid,
      expected_revision: z.number().int().nonnegative(),
    })
    .strict(),
]);
export type PolicyCommand = z.infer<typeof policyCommandSchema>;
export type PolicyResult = { kind?: string; [key: string]: unknown };

export function createPolicyService(
  execute: (actorUserId: string, command: PolicyCommand) => Promise<PolicyResult>,
) {
  return {
    async command(actorUserId: string, raw: unknown) {
      const command = policyCommandSchema.parse(raw);
      if (command.action === "save" && command.body.template_key !== command.template_key) {
        throw new z.ZodError([
          {
            code: "custom",
            path: ["template_key"],
            message: policyValidationMessage("template_mismatch"),
          },
        ]);
      }
      return execute(actorUserId, command);
    },
  };
}
