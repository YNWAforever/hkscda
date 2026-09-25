import { readEligibleAnimals } from "../../../lib/animals/eligibility.server";
import { createFileRoute } from "@tanstack/react-router";

import { createSupabaseAdoptionCoordinatorRepository } from "../../../lib/adoptions/repository.server";
import { createAdoptionCoordinatorService } from "../../../lib/adoptions/service";
import { getAppUrl } from "../../../lib/appUrl.server";
import { createSupabaseServiceClient } from "../../../lib/donations/supabase.server";
import {
  isSubmissionValidationError,
  parseAdoptionSubmission,
  persistPublicAdoptionJourney,
  sendAdoptionConfirmationEmail,
} from "../../../lib/publicAdoption/submission.server";
import {
  applicationReference,
  hashStatusToken,
} from "../../../lib/publicAdoption/statusToken.server";
import {
  hasCompletedAdoptionApplication,
  loadAdoptionUploadIntent,
  markAdoptionUploadIntentSubmitted,
  matchesAdoptionUploadIntent,
  validateAdoptionUploadIntent,
} from "../../../lib/publicAdoption/uploadIntent.server";
import type { RateLimitResult } from "../../../lib/security/rate-limit.server";
import {
  enforceRateLimit,
  getClientIp,
  retryAfterSeconds,
} from "../../../lib/security/rate-limit.server";

type Dependencies = {
  rateLimit(ip: string): Promise<RateLimitResult>;
  parse: typeof parseAdoptionSubmission;
  createClient: typeof createSupabaseServiceClient;
  loadIntent: typeof loadAdoptionUploadIntent;
  hasCompleted: typeof hasCompletedAdoptionApplication;
  markSubmitted: typeof markAdoptionUploadIntentSubmitted;
  readEligible: typeof readEligibleAnimals;
  createCoordinatorService: (
    client: ReturnType<typeof createSupabaseServiceClient>,
  ) => ReturnType<typeof createAdoptionCoordinatorService>;
  persist: typeof persistPublicAdoptionJourney;
  sendEmail: typeof sendAdoptionConfirmationEmail;
  appUrl: typeof getAppUrl;
  logger: Pick<Console, "error">;
};

function jsonNoStore(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("cache-control", "no-store");
  return Response.json(body, { ...init, headers });
}

function recoveredStatusUrl(appUrl: string, statusToken: string) {
  return `${appUrl.replace(/\/+$/, "")}/adoption/status/${encodeURIComponent(statusToken)}`;
}

export function createAdoptionApplicationsHandler({
  rateLimit = (ip) => enforceRateLimit(ip, { prefix: "adoption", max: 5, window: "1 m" }),
  parse = parseAdoptionSubmission,
  createClient = createSupabaseServiceClient,
  loadIntent = loadAdoptionUploadIntent,
  hasCompleted = hasCompletedAdoptionApplication,
  markSubmitted = markAdoptionUploadIntentSubmitted,
  readEligible = readEligibleAnimals,
  createCoordinatorService = (client) =>
    createAdoptionCoordinatorService({
      repo: createSupabaseAdoptionCoordinatorRepository(client),
    }),
  persist = persistPublicAdoptionJourney,
  sendEmail = sendAdoptionConfirmationEmail,
  appUrl = getAppUrl,
  logger = console,
}: Partial<Dependencies> = {}) {
  return async (request: Request) => {
    const ip = getClientIp(request);
    const limit = await rateLimit(ip);
    if (!limit.ok) {
      return jsonNoStore(
        { error: "Too many requests. Please try again shortly." },
        { status: 429, headers: { "retry-after": String(retryAfterSeconds(limit)) } },
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonNoStore({ error: "Invalid JSON body" }, { status: 400 });
    }

    try {
      const parsed = parse(body);
      const client = createClient();
      const intentInput = {
        applicationId: parsed.applicationId,
        statusToken: parsed.statusToken,
        photoPaths: parsed.photos.map((photo) => photo.storagePath),
      };
      const intent = await loadIntent(client, parsed.applicationId);
      if (!intent || !matchesAdoptionUploadIntent(intent, intentInput)) {
        return jsonNoStore({ error: "Photo upload authorization not found" }, { status: 403 });
      }

      if (await hasCompleted(client, parsed.applicationId)) {
        try {
          await markSubmitted(client, parsed.applicationId);
        } catch (error) {
          logger.error("Could not mark completed adoption upload intent", error);
        }
        return jsonNoStore(
          {
            applicationId: parsed.applicationId,
            reference: applicationReference(parsed.applicationId),
            statusUrl: recoveredStatusUrl(appUrl(), parsed.statusToken),
          },
          { status: 200 },
        );
      }

      if (!validateAdoptionUploadIntent(intent, intentInput)) {
        return jsonNoStore({ error: "Photo upload authorization expired" }, { status: 403 });
      }

      const eligible = await readEligible(
        client,
        parsed.payload.animalPreferences.map((item) => item.animalId),
        "adoption",
      );
      if (
        eligible.length !== parsed.payload.animalPreferences.length ||
        parsed.payload.animalPreferences.some(
          (preference) =>
            !eligible.some(
              (animal) =>
                animal.id === preference.animalId && animal.type === preference.animalType,
            ),
        )
      ) {
        return jsonNoStore(
          { error: "Selected animals are no longer available for adoption" },
          { status: 400 },
        );
      }

      const coordinatorService = createCoordinatorService(client);
      const result = await persist({
        client,
        parsed,
        coordinatorService,
        createStatusTokenPair: () => ({
          rawToken: parsed.statusToken,
          tokenHash: hashStatusToken(parsed.statusToken),
        }),
      });
      try {
        await markSubmitted(client, parsed.applicationId);
      } catch (error) {
        logger.error("Could not mark completed adoption upload intent", error);
      }
      try {
        await sendEmail(client, parsed.payload, result);
      } catch (error) {
        logger.error("Could not send adoption confirmation after save", error);
      }

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
      logger.error(error);
      return jsonNoStore({ error: "Adoption application could not be created" }, { status: 500 });
    }
  };
}

export const Route = createFileRoute("/api/adoption/applications")({
  server: {
    handlers: {
      POST: ({ request }) => createAdoptionApplicationsHandler()(request),
    },
  },
});
