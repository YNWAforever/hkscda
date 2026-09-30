import { z } from "zod";
import { readAdminJson } from "../http/adminJson.server";
import { InvalidRequestJsonError, RequestBodyTooLargeError } from "../http/publicJson.server";
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
    if (error instanceof RequestBodyTooLargeError)
      return json({ error: "Request body too large" }, 413);
    if (
      error instanceof z.ZodError ||
      error instanceof SyntaxError ||
      error instanceof InvalidRequestJsonError
    )
      return json({ error: "Invalid manual gift request" }, 400);
    if (error && typeof error === "object" && "code" in error && error.code === "42501")
      return json({ error: "Access denied" }, 403);
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
          input: await readAdminJson(request),
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
        if (current === "retryable" || current === "attention_required") {
          const accepted = await deps.retryJob(jobId, actor.authUserId);
          if (!accepted) {
            const latest = await deps.status(jobId);
            if (!latest) return json({ error: "Delivery job not found" }, 404);
            if (latest === "retryable" || latest === "attention_required")
              return json({ error: "Delivery retry unavailable", deliveryStatus: latest }, 409);
            // Another caller may have requeued or completed this job. This
            // refused request must not claim it or change its attempt count.
            return json({ deliveryStatus: latest });
          }
        }
        return json({ deliveryStatus: await attempt(jobId) });
      });
    },
  };
}
