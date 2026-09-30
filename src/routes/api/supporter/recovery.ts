import { createFileRoute } from "@tanstack/react-router";

import { createLiveRecoveryBroker } from "../../../lib/supporters/recoveryRepository.server";
import { RequestBodyTooLargeError, readPublicJson } from "../../../lib/http/publicJson.server";
import {
  RecoveryError,
  requestRecovery,
  type RecoveryDependencies,
} from "../../../lib/supporters/recovery.server";
import { enforceRateLimit, getClientIp } from "../../../lib/security/rate-limit.server";
import { verifyTurnstile } from "../../../lib/security/turnstile.server";

function reply(body: unknown, status: number, retryAfter?: number) {
  const headers = new Headers({ "cache-control": "no-store" });
  if (retryAfter) headers.set("retry-after", String(retryAfter));
  return Response.json(body, { status, headers });
}

export function createRecoveryRouteHandler(
  dependencies: (request: Request) => RecoveryDependencies,
  options: { enabled?: () => boolean; now?: () => number } = {},
) {
  const enabled = options.enabled ?? (() => process.env.SUPPORTER_RECOVERY_ENABLED === "true");
  const now = options.now ?? Date.now;
  return async ({ request }: { request: Request }): Promise<Response> => {
    if (request.method !== "POST") return reply({ error: "Method not allowed" }, 405);
    if (!enabled()) return reply({ error: "Temporarily unavailable" }, 503, 60);
    let body: unknown;
    try {
      body = await readPublicJson(request);
    } catch (error) {
      return reply(
        {
          error:
            error instanceof RequestBodyTooLargeError ? "Request body too large" : "Invalid JSON",
        },
        error instanceof RequestBodyTooLargeError ? 413 : 400,
      );
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return reply({ error: "Invalid request" }, 400);
    }
    const input = body as Record<string, unknown>;
    if (
      typeof input.email !== "string" ||
      (input.challengeToken !== undefined && typeof input.challengeToken !== "string")
    ) {
      return reply({ error: "Invalid request" }, 400);
    }
    try {
      const result = await requestRecovery(
        { email: input.email, challengeToken: input.challengeToken as string | undefined },
        dependencies(request),
      );
      return reply(result, 202);
    } catch (error) {
      if (!(error instanceof RecoveryError)) {
        console.error("Supporter recovery request failed");
        return reply({ error: "Temporarily unavailable" }, 503);
      }
      if (error.code === "invalid_email") return reply({ error: "Invalid email" }, 400);
      if (error.code === "challenge") return reply({ error: "Verification failed" }, 403);
      if (error.code === "unavailable") return reply({ error: "Temporarily unavailable" }, 503, 60);
      return reply(
        { error: "Too many requests" },
        429,
        error.retryAfter ? Math.max(1, Math.ceil((error.retryAfter - now()) / 1000)) : 60,
      );
    }
  };
}

function createLiveDependencies(request: Request): RecoveryDependencies {
  const broker = createLiveRecoveryBroker();
  return {
    ip: getClientIp(request),
    rate: (key) =>
      enforceRateLimit(key, {
        prefix: "supporter-recovery",
        max: key.startsWith("ip:") ? 5 : 3,
        window: "1 h",
        requireAvailability: true,
      }),
    challenge: (token, ip) => verifyTurnstile(token, ip),
    sendOtp: (email, challengeId) => broker.issue(email, challengeId),
  };
}

export const Route = createFileRoute("/api/supporter/recovery")({
  server: {
    handlers: {
      POST: createRecoveryRouteHandler(createLiveDependencies),
    },
  },
});
