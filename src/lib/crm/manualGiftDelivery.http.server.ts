import { z } from "zod";
import type { ManualGiftResult } from "./manualGift.server";
import type { DeliveryRunResult } from "../donations/deliveryJobs.server";

type Status = "pending" | "processing" | "retryable" | "attention_required" | "complete";
type Dependencies = {
  requireTreasurer(request: Request): Promise<{ authUserId: string }>;
  createGift(input: { actorUserId: string; input: unknown }): Promise<ManualGiftResult>;
  run(jobId: string): Promise<DeliveryRunResult>;
  status(jobId: string): Promise<Status | null>;
  retryJob(jobId: string, actorUserId: string): Promise<boolean>;
};
function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}
async function guarded(operation: () => Promise<Response>) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof Response) {
      const headers = new Headers(error.headers);
      headers.set("cache-control", "no-store");
      return new Response(error.body, { status: error.status, headers });
    }
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return json({ error: "Invalid manual gift request" }, 400);
    return json({ error: "Could not process manual gift request" }, 500);
  }
}
export function createManualGiftDeliveryHandlers(deps: Dependencies) {
  async function attempt(jobId: string): Promise<Status> {
    try {
      const result = await deps.run(jobId);
      if (result.kind === "busy") return (await deps.status(jobId)) ?? "pending";
      return result.kind;
    } catch {
      // The durable job already exists; a transient worker/store error must not undo the gift response.
      return "pending";
    }
  }
  return {
    create(request: Request) {
      return guarded(async () => {
        const actor = await deps.requireTreasurer(request);
        const result = await deps.createGift({
          actorUserId: actor.authUserId,
          input: await request.json(),
        });
        const deliveryStatus = result.deliveryJobId
          ? await attempt(result.deliveryJobId)
          : "not_required";
        return json({ ...result, deliveryStatus }, result.replayed ? 200 : 201);
      });
    },
    retry(request: Request, rawJobId: string) {
      return guarded(async () => {
        const actor = await deps.requireTreasurer(request);
        const jobId = z.string().uuid().parse(rawJobId);
        const current = await deps.status(jobId);
        if (!current) return json({ error: "Delivery job not found" }, 404);
        if (current === "complete") return json({ deliveryStatus: current });
        if (current === "retryable" || current === "attention_required")
          await deps.retryJob(jobId, actor.authUserId);
        return json({ deliveryStatus: await attempt(jobId) });
      });
    },
  };
}
