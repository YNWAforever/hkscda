import { createFileRoute } from "@tanstack/react-router";

import { RequestBodyTooLargeError, readPublicJson } from "../../../lib/http/publicJson.server";
import { enforceRateLimit, type RateLimitResult } from "../../../lib/security/rate-limit.server";
import { createSupabaseServiceClient } from "../../../lib/supabase.server";
import {
  requireVerifiedPrincipal,
  type AuthReader,
  type VerifiedPrincipal,
} from "../../../lib/supporters/portal.server";

type Preference = "opt_in" | "opt_out";
type PreferenceResult = { status: Preference | "unlinked"; changed: boolean };

export function createPreferenceHandler(deps: {
  auth: AuthReader;
  rate: (authUserId: string) => Promise<RateLimitResult>;
  update: (principal: VerifiedPrincipal, status: Preference) => Promise<PreferenceResult>;
}) {
  return async ({ request }: { request: Request }): Promise<Response> => {
    const headers = { "cache-control": "no-store" };
    if (request.method !== "POST") {
      return Response.json({ error: "Method not allowed" }, { status: 405, headers });
    }
    try {
      const principal = await requireVerifiedPrincipal(request, deps.auth);
      const rate = await deps.rate(principal.authUserId);
      if (rate.unavailable) {
        return Response.json({ error: "Temporarily unavailable" }, { status: 503, headers });
      }
      if (!rate.ok) {
        return Response.json({ error: "Too many requests" }, { status: 429, headers });
      }
      let body: Record<string, unknown> | null;
      try {
        body = (await readPublicJson(request)) as Record<string, unknown> | null;
      } catch (error) {
        const oversized = error instanceof RequestBodyTooLargeError;
        return Response.json(
          { error: oversized ? "Request body too large" : "Invalid JSON" },
          { status: oversized ? 413 : 400, headers },
        );
      }
      const status = body && !Array.isArray(body) ? body.marketingEmail : null;
      if (status !== "opt_in" && status !== "opt_out") {
        return Response.json({ error: "Invalid preference" }, { status: 400, headers });
      }
      const result = await deps.update(principal, status);
      return Response.json(result, { status: 200, headers });
    } catch (error) {
      if (error instanceof Response) {
        return Response.json({ error: "Access denied" }, { status: error.status, headers });
      }
      console.error("Supporter preference update failed");
      return Response.json({ error: "Temporarily unavailable" }, { status: 503, headers });
    }
  };
}

function liveHandler() {
  const client = createSupabaseServiceClient();
  return createPreferenceHandler({
    auth: client.auth,
    rate: (actor) =>
      enforceRateLimit(actor, {
        prefix: "supporter-marketing-preference",
        max: 10,
        window: "1 m",
        requireAvailability: true,
      }),
    update: async (principal, status) => {
      const { data, error } = await client.rpc("set_supporter_marketing_email", {
        p_auth_user_id: principal.authUserId,
        p_verified_email: principal.email,
        p_status: status,
      });
      if (error) throw error;
      if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw new Error("Invalid preference result");
      }
      const result = data as Record<string, unknown>;
      if (
        (result.status !== "opt_in" &&
          result.status !== "opt_out" &&
          result.status !== "unlinked") ||
        typeof result.changed !== "boolean"
      ) {
        throw new Error("Invalid preference result");
      }
      return result as PreferenceResult;
    },
  });
}

export const Route = createFileRoute("/api/supporter/preferences")({
  server: {
    handlers: {
      POST: async (context) => liveHandler()(context),
    },
  },
});
