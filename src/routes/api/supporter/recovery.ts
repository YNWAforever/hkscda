import { createClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";

import { getAppUrl } from "../../../lib/appUrl.server";
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
) {
  return async ({ request }: { request: Request }): Promise<Response> => {
    if (request.method !== "POST") return reply({ error: "Method not allowed" }, 405);
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
      await requestRecovery(
        { email: input.email, challengeToken: input.challengeToken as string | undefined },
        dependencies(request),
      );
      return reply({ accepted: true }, 202);
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
        error.retryAfter ? Math.max(1, Math.ceil((error.retryAfter - Date.now()) / 1000)) : 60,
      );
    }
  };
}

function createLiveHandler() {
  const url = process.env.SUPABASE_URL ?? import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("Public Supabase auth configuration is missing");
  const auth = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return createRecoveryRouteHandler((request) => ({
    ip: getClientIp(request),
    rate: (key) =>
      enforceRateLimit(key, {
        prefix: "supporter-recovery",
        max: key.startsWith("ip:") ? 5 : 3,
        window: "1 h",
        requireAvailability: true,
      }),
    challenge: (token, ip) => verifyTurnstile(token, ip),
    sendOtp: async (email) => {
      const { error } = await auth.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: new URL("/supporter", getAppUrl()).toString(),
        },
      });
      if (error) throw error;
    },
  }));
}

export const Route = createFileRoute("/api/supporter/recovery")({
  server: {
    handlers: {
      POST: async (context) => createLiveHandler()(context),
    },
  },
});
