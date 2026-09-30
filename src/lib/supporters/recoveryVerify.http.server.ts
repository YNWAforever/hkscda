import {
  readPublicJson,
  RequestBodyTooLargeError,
  InvalidRequestJsonError,
} from "../http/publicJson.server";
import { guardRecoveryAttempt, RecoveryError, type RecoveryDependencies } from "./recovery.server";
import type { RecoverySession } from "./recoveryBroker.server";

type VerificationDependencies = Omit<RecoveryDependencies, "sendOtp"> & {
  verify(input: { email: string; challengeId: string; code: string }): Promise<RecoverySession>;
};
const reply = (body: unknown, status: number, retryAfter?: number) =>
  Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      ...(retryAfter ? { "retry-after": String(retryAfter) } : {}),
    },
  });

export function createRecoveryVerificationHandler(
  dependencies: (request: Request) => VerificationDependencies,
  options: { enabled?: () => boolean; now?: () => number } = {},
) {
  const enabled = options.enabled ?? (() => process.env.SUPPORTER_RECOVERY_ENABLED === "true");
  const now = options.now ?? Date.now;
  return async ({ request }: { request: Request }): Promise<Response> => {
    if (request.method !== "POST") return reply({ error: "Method not allowed" }, 405);
    if (!enabled()) return reply({ error: "Temporarily unavailable" }, 503, 60);
    try {
      const body: unknown = await readPublicJson(request);
      if (!body || typeof body !== "object" || Array.isArray(body))
        return reply({ error: "Invalid request" }, 400);
      const input = body as Record<string, unknown>;
      if (
        typeof input.email !== "string" ||
        typeof input.challengeId !== "string" ||
        typeof input.code !== "string" ||
        (input.challengeToken !== undefined && typeof input.challengeToken !== "string")
      )
        return reply({ error: "Invalid request" }, 400);
      const deps = dependencies(request);
      const email = await guardRecoveryAttempt(
        { email: input.email, challengeToken: input.challengeToken as string | undefined },
        deps,
      );
      return reply(
        await deps.verify({ email, challengeId: input.challengeId, code: input.code }),
        200,
      );
    } catch (error) {
      if (error instanceof RequestBodyTooLargeError)
        return reply({ error: "Request body too large" }, 413);
      if (error instanceof InvalidRequestJsonError) return reply({ error: "Invalid JSON" }, 400);
      if (error instanceof RecoveryError) {
        if (error.code === "invalid_email") return reply({ error: "Invalid email" }, 400);
        if (error.code === "invalid_code") return reply({ error: "Verification failed" }, 401);
        if (error.code === "challenge") return reply({ error: "Verification failed" }, 403);
        if (error.code === "rate_limited")
          return reply(
            { error: "Too many requests" },
            429,
            error.retryAfter ? Math.max(1, Math.ceil((error.retryAfter - now()) / 1000)) : 60,
          );
      }
      return reply({ error: "Temporarily unavailable" }, 503, 60);
    }
  };
}
