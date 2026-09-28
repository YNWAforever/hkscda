import { readEligibleAnimals } from "../../../lib/animals/eligibility.server";
import { ZodError } from "zod";
import { createFileRoute } from "@tanstack/react-router";
import { RequestBodyTooLargeError, readPublicJson } from "../../../lib/http/publicJson.server";

import { createSupabaseServiceClient } from "../../../lib/donations/supabase.server";
import {
  fingerprintSponsorshipSubmission,
  isSubmissionValidationError,
  lookupSponsorshipPledgeRetry,
  parseSponsorshipSubmission,
  persistSponsorshipPledge,
  sendPledgeConfirmationEmail,
  type SponsorshipPledgeRetry,
} from "../../../lib/sponsorship/submission.server";
import {
  enforceRateLimit,
  getClientIp,
  retryAfterSeconds,
  type RateLimitResult,
} from "../../../lib/security/rate-limit.server";
import { verifyTurnstile } from "../../../lib/security/turnstile.server";
import { verifyProofUploadIntent } from "../../../lib/sponsorship/proofIntent.server";
import { loadCurrentSponsorshipTerms } from "../../../lib/sponsorship/terms.server";

type Dependencies = {
  rateLimit(ip: string): Promise<RateLimitResult>;
  parse: typeof parseSponsorshipSubmission;
  createClient: typeof createSupabaseServiceClient;
  lookupRetry: typeof lookupSponsorshipPledgeRetry;
  verify: typeof verifyTurnstile;
  verifyProofIntent: typeof verifyProofUploadIntent;
  readEligible: typeof readEligibleAnimals;
  loadCurrentTerms: typeof loadCurrentSponsorshipTerms;
  persist: typeof persistSponsorshipPledge;
  sendEmail: typeof sendPledgeConfirmationEmail;
  logger: Pick<Console, "error">;
};

function jsonNoStore(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("cache-control", "no-store");
  return Response.json(body, { ...init, headers });
}

function retryResponse(result: SponsorshipPledgeRetry) {
  if (result.kind === "recovered") {
    return jsonNoStore(
      { pledgeId: result.pledgeId, reference: result.reference, statusUrl: result.statusUrl },
      { status: 200 },
    );
  }
  if (result.kind === "expired") {
    return jsonNoStore({ error: "Sponsorship status link expired" }, { status: 410 });
  }
  if (result.kind === "conflict") {
    return jsonNoStore(
      {
        error:
          "This pledge was already submitted with different details. Check the original status link before starting a new pledge.",
      },
      { status: 409 },
    );
  }
  if (result.kind === "forbidden") {
    return jsonNoStore({ error: "Sponsorship pledge retry not authorized" }, { status: 403 });
  }
  return null;
}

export function createSponsorshipPledgesHandler({
  rateLimit = (ip) =>
    enforceRateLimit(ip, {
      prefix: "sponsorship",
      max: 5,
      window: "1 m",
      requireAvailability: true,
    }),
  parse = parseSponsorshipSubmission,
  createClient = createSupabaseServiceClient,
  lookupRetry = lookupSponsorshipPledgeRetry,
  verify = verifyTurnstile,
  verifyProofIntent = verifyProofUploadIntent,
  readEligible = readEligibleAnimals,
  loadCurrentTerms = loadCurrentSponsorshipTerms,
  persist = persistSponsorshipPledge,
  sendEmail = sendPledgeConfirmationEmail,
  logger = console,
}: Partial<Dependencies> = {}) {
  return async (request: Request) => {
    const ip = getClientIp(request);
    const limit = await rateLimit(ip);
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

    let body: unknown;
    try {
      body = await readPublicJson(request);
    } catch (error) {
      if (error instanceof RequestBodyTooLargeError)
        return jsonNoStore({ error: "Request body too large" }, { status: 413 });
      return jsonNoStore({ error: "Invalid JSON body" }, { status: 400 });
    }

    try {
      const parsed = parse(body);
      const client = createClient();
      const fingerprint = fingerprintSponsorshipSubmission(parsed);
      const lookup = () => lookupRetry(client, parsed.pledgeId, parsed.statusToken, fingerprint);
      const existing = retryResponse(await lookup());
      if (existing) return existing;

      const currentTerms = await loadCurrentTerms(parsed.payload.language);
      if (!currentTerms) {
        return jsonNoStore(
          { error: "Approved sponsorship terms are not published" },
          { status: 503 },
        );
      }
      if (parsed.payload.terms.version !== currentTerms.version) {
        return jsonNoStore(
          {
            error: "Sponsorship terms have changed; review the current version before retrying",
            code: "TERMS_CHANGED",
          },
          { status: 409 },
        );
      }

      // Proof uploads use Turnstile when the Storage URL is issued. Validate
      // that signed result here; proof-less submissions verify Turnstile here.
      const challengeValid = parsed.proof
        ? verifyProofIntent(parsed.proof.proofIntent, {
            pledgeId: parsed.pledgeId,
            path: parsed.proof.storagePath,
          })
        : await verify(parsed.payload.turnstileToken, ip);
      if (!challengeValid) {
        // The first request may have completed while its challenge
        // was being checked by this concurrent retry.
        const completed = retryResponse(await lookup());
        if (completed) return completed;
        return jsonNoStore({ error: "Verification failed" }, { status: 403 });
      }

      const eligible = await readEligible(
        client,
        parsed.payload.animalPreferences.map((item) => item.animalId),
        "sponsorship",
      );
      if (eligible.length !== parsed.payload.animalPreferences.length) {
        return jsonNoStore(
          { error: "Selected animals are no longer available for sponsorship" },
          { status: 400 },
        );
      }
      for (const preference of parsed.payload.animalPreferences) {
        preference.animalType = eligible.find((animal) => animal.id === preference.animalId)!.type;
      }

      let result: Awaited<ReturnType<typeof persist>>;
      try {
        result = await persist({ client, parsed });
      } catch (error) {
        // A simultaneous request may have committed the same pledge/token.
        // Recover only if the presented bearer token matches that saved pledge.
        const completed = retryResponse(await lookup());
        if (completed) return completed;
        throw error;
      }

      // Persistence has committed. Email delivery is best-effort and must not
      // turn a saved pledge into a 500 that the donor cannot safely recover.
      try {
        await sendEmail(client, parsed.payload, result);
      } catch (error) {
        logger.error("Could not send sponsorship confirmation after save", error);
      }

      return jsonNoStore(
        { pledgeId: result.pledgeId, reference: result.reference, statusUrl: result.statusUrl },
        { status: 201 },
      );
    } catch (error) {
      if (isSubmissionValidationError(error)) {
        const fields =
          error instanceof ZodError
            ? error.issues
                .slice(0, 8)
                .map((issue) => ({ field: issue.path.join("."), reason: issue.message }))
            : [];
        return jsonNoStore(
          { error: "Invalid sponsorship pledge request", fields },
          { status: 400 },
        );
      }
      logger.error(error);
      return jsonNoStore({ error: "Sponsorship pledge could not be created" }, { status: 500 });
    }
  };
}

export const Route = createFileRoute("/api/sponsorships/pledges")({
  server: {
    handlers: {
      POST: ({ request }) => createSponsorshipPledgesHandler()(request),
    },
  },
});
