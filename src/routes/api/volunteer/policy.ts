import { createFileRoute } from "@tanstack/react-router";
import { createSupabaseServiceClient } from "../../../lib/supabase.server";
import { createBookingService } from "../../../lib/volunteers/policy/booking";
import {
  createBookingRepository,
  requireVerifiedVolunteer,
} from "../../../lib/volunteers/policy/booking.repository.server";
import { createBookingHandlers } from "../../../lib/volunteers/policy/booking.http.server";
import { enforceRateLimit, getClientIp } from "../../../lib/security/rate-limit.server";
import { verifyTurnstile } from "../../../lib/security/turnstile.server";
function handlers() {
  const client = createSupabaseServiceClient();
  return createBookingHandlers({
    service: createBookingService(createBookingRepository(client)),
    authenticate: (request) => requireVerifiedVolunteer(request, client),
    verify: (token, request) => verifyTurnstile(token, getClientIp(request)),
  });
}
export const Route = createFileRoute("/api/volunteer/policy")({
  server: {
    handlers: {
      GET: ({ request }) => handlers().get(request),
      POST: async ({ request }) => {
        const limit = await enforceRateLimit(getClientIp(request), {
          prefix: "volunteer-policy",
          max: 30,
          window: "1 m",
        });
        if (!limit.ok)
          return Response.json(
            { error: "請稍後再試" },
            { status: 429, headers: { "cache-control": "no-store" } },
          );
        return handlers().post(request);
      },
    },
  },
});
