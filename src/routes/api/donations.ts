import { createFileRoute } from "@tanstack/react-router";
import { ZodError } from "zod";

import { createPaymentProviders } from "../../lib/donations/providers.server";
import { createDonation } from "../../lib/donations/service";
import {
  createSupabaseDonationRepository,
  createSupabaseServiceClient,
} from "../../lib/donations/supabase.server";
import {
  enforceRateLimit,
  getClientIp,
  retryAfterSeconds,
} from "../../lib/security/rate-limit.server";
import { verifyTurnstile } from "../../lib/security/turnstile.server";

export const Route = createFileRoute("/api/donations")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ip = getClientIp(request);
        const limit = await enforceRateLimit(ip, {
          prefix: "donations",
          max: 5,
          window: "1 m",
        });
        if (!limit.ok) {
          return Response.json(
            { error: "Too many requests. Please try again shortly." },
            { status: 429, headers: { "retry-after": String(retryAfterSeconds(limit)) } },
          );
        }

        try {
          const body = (await request.json()) as Record<string, unknown>;
          const { turnstileToken, ...input } = body;

          if (!(await verifyTurnstile(turnstileToken as string | undefined, ip))) {
            return Response.json({ error: "Verification failed" }, { status: 403 });
          }

          const client = createSupabaseServiceClient();
          const result = await createDonation({
            input,
            repository: createSupabaseDonationRepository(client),
            providers: createPaymentProviders(),
          });

          return Response.json(result);
        } catch (error) {
          if (error instanceof ZodError) {
            return Response.json(
              { error: "Invalid donation request", issues: error.issues },
              { status: 400 },
            );
          }
          console.error(error);
          return Response.json({ error: "Donation could not be created" }, { status: 500 });
        }
      },
    },
  },
});
