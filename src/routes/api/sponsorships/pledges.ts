import { createFileRoute } from "@tanstack/react-router";

import { createSupabaseServiceClient } from "../../../lib/donations/supabase.server";
import {
  isSubmissionValidationError,
  parseSponsorshipMultipart,
  persistSponsorshipPledge,
  sendPledgeConfirmationEmail,
  validateSponsorshipSubmissionRequestHeaders,
} from "../../../lib/sponsorship/submission.server";
import {
  enforceRateLimit,
  getClientIp,
  retryAfterSeconds,
} from "../../../lib/security/rate-limit.server";
import { verifyTurnstile } from "../../../lib/security/turnstile.server";

function jsonNoStore(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("cache-control", "no-store");
  return Response.json(body, { ...init, headers });
}

export const Route = createFileRoute("/api/sponsorships/pledges")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ip = getClientIp(request);
        const limit = await enforceRateLimit(ip, {
          prefix: "sponsorship",
          max: 5,
          window: "1 m",
        });
        if (!limit.ok) {
          return jsonNoStore(
            { error: "Too many requests. Please try again shortly." },
            { status: 429, headers: { "retry-after": String(retryAfterSeconds(limit)) } },
          );
        }

        const headerValidation = validateSponsorshipSubmissionRequestHeaders(request);
        if (!headerValidation.ok) {
          return jsonNoStore(
            { error: headerValidation.error },
            { status: headerValidation.status },
          );
        }

        try {
          const parsed = await parseSponsorshipMultipart(request);
          if (!(await verifyTurnstile(parsed.payload.turnstileToken, ip))) {
            return jsonNoStore({ error: "Verification failed" }, { status: 403 });
          }

          const client = createSupabaseServiceClient();
          const result = await persistSponsorshipPledge({ client, parsed });
          await sendPledgeConfirmationEmail(client, parsed.payload, result);

          return jsonNoStore(
            { pledgeId: result.pledgeId, reference: result.reference },
            { status: 201 },
          );
        } catch (error) {
          if (isSubmissionValidationError(error)) {
            return jsonNoStore({ error: "Invalid sponsorship pledge request" }, { status: 400 });
          }
          console.error(error);
          return jsonNoStore({ error: "Sponsorship pledge could not be created" }, { status: 500 });
        }
      },
    },
  },
});
