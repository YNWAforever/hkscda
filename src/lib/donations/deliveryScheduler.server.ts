import { authorizedCron } from "../volunteers/jobs/auth.server";
import type { DeliveryRunResult } from "./deliveryJobs.server";

type DispatchDependencies = {
  listDue(limit: number): Promise<string[]>;
  run(jobId: string): Promise<DeliveryRunResult>;
};

export async function dispatchDueDonationJobs(deps: DispatchDependencies) {
  const ids = await deps.listDue(5);
  const summary = {
    selected: ids.length,
    complete: 0,
    retryable: 0,
    attentionRequired: 0,
    busy: 0,
    errors: 0,
  };
  for (let offset = 0; offset < ids.length; offset += 2) {
    const results = await Promise.allSettled(
      ids.slice(offset, offset + 2).map((id) => deps.run(id)),
    );
    for (const result of results) {
      if (result.status === "rejected") {
        summary.errors++;
        continue;
      }
      if (result.value.kind === "complete") summary.complete++;
      else if (result.value.kind === "retryable") summary.retryable++;
      else if (result.value.kind === "attention_required") summary.attentionRequired++;
      else summary.busy++;
    }
  }
  return summary;
}

export function createDonationDeliveryCron(deps: {
  secret: () => string | undefined;
  run: () => Promise<unknown>;
}) {
  return async (request: Request) => {
    if (!authorizedCron(request, deps.secret()))
      return Response.json(
        { error: "unauthorized" },
        { status: 401, headers: { "cache-control": "no-store" } },
      );
    try {
      return Response.json(await deps.run(), { headers: { "cache-control": "no-store" } });
    } catch {
      return Response.json(
        { error: "delivery_dispatch_failed" },
        { status: 500, headers: { "cache-control": "no-store" } },
      );
    }
  };
}
