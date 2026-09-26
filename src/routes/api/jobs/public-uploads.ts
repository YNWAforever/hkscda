import { createFileRoute } from "@tanstack/react-router";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseServiceClient } from "../../../lib/donations/supabase.server";
import {
  cleanupExpiredAdoptionUploads,
  createSupabaseAdoptionUploadCleanupPort,
} from "../../../lib/publicAdoption/uploadIntent.server";
import {
  cleanupExpiredSponsorshipProofUploads,
  createSupabaseSponsorshipProofCleanupPort,
} from "../../../lib/sponsorship/proofCleanup.server";
import { authorizedCron } from "../../../lib/volunteers/jobs/auth.server";

type Dependencies = {
  secret: () => string | undefined;
  createClient: typeof createSupabaseServiceClient;
  runAdoption(client: SupabaseClient): ReturnType<typeof cleanupExpiredAdoptionUploads>;
  runSponsorship(client: SupabaseClient): ReturnType<typeof cleanupExpiredSponsorshipProofUploads>;
  logger: Pick<Console, "error">;
};

export function createPublicUploadCleanupHandler({
  secret = () => process.env.CRON_SECRET,
  createClient = createSupabaseServiceClient,
  runAdoption = (client) =>
    cleanupExpiredAdoptionUploads(createSupabaseAdoptionUploadCleanupPort(client)),
  runSponsorship = (client) =>
    cleanupExpiredSponsorshipProofUploads(createSupabaseSponsorshipProofCleanupPort(client)),
  logger = console,
}: Partial<Dependencies> = {}) {
  return async (request: Request): Promise<Response> => {
    if (!authorizedCron(request, secret())) {
      return Response.json(
        { error: "unauthorized" },
        { status: 401, headers: { "cache-control": "no-store" } },
      );
    }
    const client = createClient();
    const [adoption, sponsorship] = await Promise.allSettled([
      runAdoption(client),
      runSponsorship(client),
    ]);
    if (adoption.status === "rejected")
      logger.error("Adoption upload cleanup failed", adoption.reason);
    if (sponsorship.status === "rejected")
      logger.error("Sponsorship proof cleanup failed", sponsorship.reason);
    const failed = adoption.status === "rejected" || sponsorship.status === "rejected";
    return Response.json(
      {
        adoption: adoption.status === "fulfilled" ? adoption.value : null,
        sponsorship: sponsorship.status === "fulfilled" ? sponsorship.value : null,
      },
      { status: failed ? 500 : 200, headers: { "cache-control": "no-store" } },
    );
  };
}

const handleCleanup = createPublicUploadCleanupHandler();

export const Route = createFileRoute("/api/jobs/public-uploads")({
  server: {
    handlers: {
      GET: ({ request }) => handleCleanup(request),
    },
  },
});
