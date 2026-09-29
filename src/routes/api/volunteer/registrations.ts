import { createFileRoute } from "@tanstack/react-router";

import {
  enforceRateLimit,
  getClientIp,
  retryAfterSeconds,
} from "../../../lib/security/rate-limit.server";
import { createHandlers } from "./-handlers";

function jsonNoStore(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("cache-control", "no-store");
  return Response.json(body, { ...init, headers });
}

export const Route = createFileRoute("/api/volunteer/registrations")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ip = getClientIp(request);
        const limit = await enforceRateLimit(ip, {
          prefix: "volunteer",
          max: 5,
          window: "1 m",
          requireAvailability: true,
        });
        if (limit.unavailable) {
          return jsonNoStore(
            { error: "Submission temporarily unavailable. Please try again later." },
            { status: 503, headers: { "cache-control": "no-store", "retry-after": "60" } },
          );
        }
        if (!limit.ok) {
          return jsonNoStore(
            { error: "Too many requests. Please try again shortly." },
            { status: 429, headers: { "retry-after": String(retryAfterSeconds(limit)) } },
          );
        }

        return createHandlers().submitPublicRegistration({ request });
      },
    },
  },
});
