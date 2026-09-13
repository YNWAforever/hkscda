import { createFileRoute } from "@tanstack/react-router";
import { createSupabaseServiceClient } from "../../../lib/supabase.server";
import { requireVerifiedVolunteer } from "../../../lib/volunteers/policy/booking.repository.server";
import { createOperationRepository } from "../../../lib/volunteers/policy/operations.repository.server";
import { createOperationHandlers } from "../../../lib/volunteers/policy/operations.http.server";
import { enforceRateLimit, getClientIp } from "../../../lib/security/rate-limit.server";
import { verifyTurnstile } from "../../../lib/security/turnstile.server";
export const Route = createFileRoute("/api/volunteer/operations")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const limit = await enforceRateLimit(getClientIp(request), {
          prefix: "volunteer-operations",
          max: 30,
          window: "1 m",
        });
        if (!limit.ok)
          return Response.json(
            { error: "請稍後再試" },
            { status: 429, headers: { "cache-control": "no-store" } },
          );
        const client = createSupabaseServiceClient();
        return createOperationHandlers({
          authenticate: (request) => requireVerifiedVolunteer(request, client),
          execute: createOperationRepository(client).execute,
          verify: (token, request) => verifyTurnstile(token, getClientIp(request)),
        }).POST(request);
      },
    },
  },
});
