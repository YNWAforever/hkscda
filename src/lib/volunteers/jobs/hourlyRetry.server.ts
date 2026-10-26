import { z } from "zod";
import { requiredReasonSchema } from "../../admin/requiredReason";
import {
  InvalidRequestJsonError,
  readBoundedJson,
  RequestBodyTooLargeError,
} from "../../http/publicJson.server";
import { createSupabaseServiceClient, requireAdmin } from "../../donations/supabase.server";
import { logVolunteerFailure } from "../telemetry.server";
import { readErrorCode } from "./errors";
import { createVolunteerJobRepository } from "./repository.server";
import {
  createVolunteerRuntimeJobs,
  runtimeBucket,
  type RuntimeSummary,
  type VolunteerJobRepository,
} from "./service";

const inputSchema = z
  .object({
    bucket: z.string().datetime({ offset: true }),
    expectedUpdatedAt: z.string().datetime({ offset: true }),
    confirmed: z.literal(true),
    reason: requiredReasonSchema,
  })
  .strict();
type HourlyRetryInput = z.infer<typeof inputSchema>;
type RetryClaim = HourlyRetryInput & { actorId: string; owner: string };
type Dependencies = {
  authorize: (request: Request) => Promise<{ authUserId: string }>;
  run: (input: HourlyRetryInput, actorId: string) => Promise<RuntimeSummary>;
  reportFailure?: (error: unknown) => void;
};

class HourlyRetryUnavailableError extends Error {}

export function createHourlyRetryHandler(deps: Dependencies, clock = () => new Date()) {
  const headers = { "cache-control": "no-store" };
  const failure = (status: number, code: string) =>
    Response.json({ error: code, code }, { status, headers });
  return async (request: Request): Promise<Response> => {
    try {
      const actor = await deps.authorize(request);
      const input = inputSchema.parse(await readBoundedJson(request, 4096));
      if (Date.parse(input.bucket) !== Date.parse(runtimeBucket(clock())))
        return failure(409, "volunteer_hourly_retry_conflict");
      const result = await deps.run(input, actor.authUserId);
      if (result.kind === "busy") return failure(409, "volunteer_hourly_retry_conflict");
      return Response.json(result, { headers });
    } catch (error) {
      if (error instanceof Response) {
        const response = new Response(error.body, error);
        response.headers.set("cache-control", "no-store");
        return response;
      }
      if (error instanceof RequestBodyTooLargeError)
        return failure(413, "volunteer_hourly_retry_invalid");
      if (error instanceof z.ZodError || error instanceof InvalidRequestJsonError)
        return failure(400, "volunteer_hourly_retry_invalid");
      const code = readErrorCode(error);
      if (code === "42501") return failure(403, "volunteer_hourly_retry_forbidden");
      if (code === "22023") return failure(400, "volunteer_hourly_retry_invalid");
      deps.reportFailure?.(error);
      if (error instanceof HourlyRetryUnavailableError || code === "PGRST202" || code === "42883")
        return failure(503, "volunteer_hourly_retry_unavailable");
      return failure(500, "volunteer_hourly_retry_failed");
    }
  };
}
export async function runHourlyRetry(
  repo: VolunteerJobRepository,
  claim: (input: RetryClaim) => Promise<unknown>,
  actorId: string,
  input: HourlyRetryInput,
  clock = () => new Date(),
): Promise<RuntimeSummary> {
  return createVolunteerRuntimeJobs(
    {
      ...repo,
      async claim(bucket, owner) {
        if (Date.parse(input.bucket) !== Date.parse(bucket)) return false;
        // Never fall back to the cron claim: true means claim AND audit committed.
        const result = await claim({ ...input, actorId, owner });
        if (result !== true && result !== false) throw new HourlyRetryUnavailableError();
        return result;
      },
    },
    clock,
  ).run();
}

export async function handleHourlyRetry(request: Request, clock = () => new Date()) {
  const client = createSupabaseServiceClient();
  return createHourlyRetryHandler(
    {
      authorize: (request) => requireAdmin(request, ["admin"], client),
      run: (input, actorId) =>
        runHourlyRetry(
          createVolunteerJobRepository(client, process.env.VOLUNTEER_JOB_ACTOR_ID ?? ""),
          async (claim) => {
            const { data, error } = await client.rpc("retry_volunteer_runtime_job_with_audit", {
              p_actor: claim.actorId,
              p_bucket: claim.bucket,
              p_expected_updated_at: claim.expectedUpdatedAt,
              p_owner: claim.owner,
              p_confirmed: claim.confirmed,
              p_reason: claim.reason,
            });
            if (error) throw error;
            return data;
          },
          actorId,
          input,
          clock,
        ),
      reportFailure: (error) => logVolunteerFailure("hourly_retry", error),
    },
    clock,
  )(request);
}
