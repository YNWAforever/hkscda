import { z } from "zod";
const uuid = z.string().uuid();
export const operationCommandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list") }).strict(),
  z
    .object({
      action: z.literal("request"),
      activity_id: uuid,
      enquiry_id: uuid,
      headcount: z.number().int().min(1).max(100000),
      idempotency_key: uuid,
    })
    .strict(),
  z
    .object({
      action: z.literal("group_preview"),
      request_id: uuid,
      expected_revision: z.number().int().positive(),
      operation: z.enum(["confirm", "cancel"]),
      headcount: z.number().int().min(0).max(100000),
      acknowledge_late_change: z.boolean(),
    })
    .strict(),
  z
    .object({
      action: z.literal("group_apply"),
      preview_id: uuid,
      idempotency_key: uuid,
      reason: z.string().trim().min(1).max(1000),
    })
    .strict(),
  z
    .object({
      action: z.literal("move_preview"),
      registration_id: uuid,
      expected_updated_at: z.string().datetime({ offset: true }),
      activity_id: uuid,
      role: z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/),
    })
    .strict(),
  z
    .object({
      action: z.literal("move_apply"),
      preview_id: uuid,
      idempotency_key: uuid,
      reason: z.string().trim().min(1).max(1000),
    })
    .strict(),
]);
export type OperationCommand = z.infer<typeof operationCommandSchema>;
export type OperationResult = { kind?: string; reason?: string; [key: string]: unknown };
export function createOperationService(
  execute: (actor: string, command: OperationCommand) => Promise<OperationResult>,
) {
  return {
    command: (actor: string, raw: unknown) => execute(actor, operationCommandSchema.parse(raw)),
  };
}
