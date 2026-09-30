import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import {
  InvalidRequestJsonError,
  RequestBodyTooLargeError,
  readBoundedJson,
} from "../http/publicJson.server";

const retrySchema = z
  .object({
    kind: z.enum(["animal", "content"]),
    itemId: z.string().min(1).max(500),
    reason: z.string().trim().min(10).max(500),
    causeCorrected: z.literal(true),
  })
  .strict();
type RetryInput = z.infer<typeof retrySchema> & { actorUserId: string };
type Ports = {
  requireAdmin(request: Request): Promise<{ authUserId: string }>;
  list(actorUserId: string): Promise<unknown>;
  retry(input: RetryInput): Promise<boolean>;
};
const json = (value: unknown, status: number) =>
  Response.json(value, { status, headers: { "cache-control": "no-store" } });

export function createMediaRepairAdminHandler(ports: Ports) {
  return {
    async list(request: Request): Promise<Response> {
      try {
        const actor = await ports.requireAdmin(request);
        return json(await ports.list(actor.authUserId), 200);
      } catch (error) {
        if (error instanceof Response) return error;
        return json({ error: "Could not read media repair queue" }, 500);
      }
    },
    async retry(request: Request): Promise<Response> {
      try {
        const actor = await ports.requireAdmin(request);
        const input = retrySchema.parse(await readBoundedJson(request, 4 * 1024));
        const retried = await ports.retry({ ...input, actorUserId: actor.authUserId });
        return retried
          ? json({ retried: true }, 200)
          : json({ error: "Repair item not found" }, 404);
      } catch (error) {
        if (error instanceof Response) return error;
        if (error instanceof RequestBodyTooLargeError)
          return json({ error: "Request body too large" }, 413);
        if (
          error instanceof InvalidRequestJsonError ||
          error instanceof z.ZodError ||
          (error as { code?: string })?.code === "22023" ||
          (error as { code?: string })?.code === "22P02"
        )
          return json({ error: "Invalid repair retry" }, 400);
        if ((error as { code?: string })?.code === "40001")
          return json({ error: "Repair state changed; reload" }, 409);
        return json({ error: "Could not retry media repair" }, 500);
      }
    },
  };
}

export function createSupabaseMediaRepairAdminPorts(client: SupabaseClient) {
  return {
    async list(actorUserId: string) {
      const { data, error } = await client.rpc("get_media_repair_backlog", {
        p_actor_user_id: actorUserId,
        p_limit: 25,
      });
      if (error) throw error;
      return data;
    },
    async retry(input: RetryInput) {
      const { data, error } = await client.rpc("retry_failed_media_repair", {
        p_actor_user_id: input.actorUserId,
        p_kind: input.kind,
        p_item_id: input.itemId,
        p_reason: input.reason,
        p_cause_corrected: input.causeCorrected,
      });
      if (error) throw error;
      return data === true;
    },
  };
}
