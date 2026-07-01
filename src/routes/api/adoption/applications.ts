import { createFileRoute } from "@tanstack/react-router";

import { createSupabaseAdoptionCoordinatorRepository } from "../../../lib/adoptions/repository.server";
import { createAdoptionCoordinatorService } from "../../../lib/adoptions/service";
import { createSupabaseServiceClient } from "../../../lib/donations/supabase.server";
import {
  isSubmissionValidationError,
  parseAdoptionMultipart,
  persistPublicAdoptionJourney,
  sendAdoptionConfirmationEmail,
  validateAdoptionSubmissionRequestHeaders,
} from "../../../lib/publicAdoption/submission.server";
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

export const Route = createFileRoute("/api/adoption/applications")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ip = getClientIp(request);
        const limit = await enforceRateLimit(ip, {
          prefix: "adoption",
          max: 5,
          window: "1 m",
        });
        if (!limit.ok) {
          return jsonNoStore(
            { error: "Too many requests. Please try again shortly." },
            { status: 429, headers: { "retry-after": String(retryAfterSeconds(limit)) } },
          );
        }

        const headerValidation = validateAdoptionSubmissionRequestHeaders(request);
        if (!headerValidation.ok) {
          return jsonNoStore(
            { error: headerValidation.error },
            { status: headerValidation.status },
          );
        }

        try {
          const parsed = await parseAdoptionMultipart(request);
          if (!(await verifyTurnstile(parsed.payload.turnstileToken, ip))) {
            return jsonNoStore({ error: "Verification failed" }, { status: 403 });
          }

          const client = createSupabaseServiceClient();
          const coordinatorRepo = createSupabaseAdoptionCoordinatorRepository(client);
          const coordinatorService = createAdoptionCoordinatorService({ repo: coordinatorRepo });
          const result = await persistPublicAdoptionJourney({
            client,
            parsed,
            coordinatorService,
          });

          await sendAdoptionConfirmationEmail(client, parsed.payload, result);

          return jsonNoStore(
            {
              applicationId: result.applicationId,
              reference: result.reference,
              statusUrl: result.statusUrl,
            },
            { status: 201 },
          );
        } catch (error) {
          if (isSubmissionValidationError(error)) {
            return jsonNoStore({ error: "Invalid adoption application request" }, { status: 400 });
          }
          console.error(error);
          return jsonNoStore(
            { error: "Adoption application could not be created" },
            { status: 500 },
          );
        }
      },
    },
  },
});
