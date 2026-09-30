import { createFileRoute } from "@tanstack/react-router";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseServiceClient } from "../../../lib/donations/supabase.server";
import {
  cleanupExpiredAnimalDraftUploads,
  createSupabaseAnimalDraftUploadCleanupPort,
} from "../../../lib/animals/draftUploadCleanup.server";
import {
  cleanupExpiredInternshipUploads,
  createSupabaseInternshipUploadCleanupPort,
} from "../../../lib/internships/uploadCleanup.server";
import {
  cleanupExpiredAdoptionUploads,
  createSupabaseAdoptionUploadCleanupPort,
} from "../../../lib/publicAdoption/uploadIntent.server";
import {
  cleanupExpiredSponsorshipProofUploads,
  createSupabaseSponsorshipProofCleanupPort,
  createSupabaseStaffSponsorshipProofCleanupPort,
} from "../../../lib/sponsorship/proofCleanup.server";
import { authorizedCron } from "../../../lib/volunteers/jobs/auth.server";

type Dependencies = {
  secret: () => string | undefined;
  createClient: typeof createSupabaseServiceClient;
  runAdoption(client: SupabaseClient): ReturnType<typeof cleanupExpiredAdoptionUploads>;
  runSponsorship(client: SupabaseClient): ReturnType<typeof cleanupExpiredSponsorshipProofUploads>;
  runInternship(client: SupabaseClient): ReturnType<typeof cleanupExpiredInternshipUploads>;
  runAnimalDraft(client: SupabaseClient): ReturnType<typeof cleanupExpiredAnimalDraftUploads>;
  logger: Pick<Console, "error">;
};

export function createPublicUploadCleanupHandler({
  secret = () => process.env.CRON_SECRET,
  createClient = createSupabaseServiceClient,
  runAdoption = (client) =>
    cleanupExpiredAdoptionUploads(createSupabaseAdoptionUploadCleanupPort(client)),
  runSponsorship = async (client) => {
    const results = await Promise.allSettled([
      cleanupExpiredSponsorshipProofUploads(createSupabaseSponsorshipProofCleanupPort(client)),
      cleanupExpiredSponsorshipProofUploads(createSupabaseStaffSponsorshipProofCleanupPort(client)),
    ]);
    const failure = results.find((result) => result.status === "rejected");
    if (failure?.status === "rejected") throw failure.reason;
    const summaries = results.map((result) =>
      result.status === "fulfilled" ? result.value : { removed: 0, preserved: 0, failed: 0 },
    );
    return {
      removed: summaries.reduce((total, item) => total + item.removed, 0),
      preserved: summaries.reduce((total, item) => total + item.preserved, 0),
      failed: summaries.reduce((total, item) => total + item.failed, 0),
    };
  },
  runInternship = (client) =>
    cleanupExpiredInternshipUploads(createSupabaseInternshipUploadCleanupPort(client)),
  runAnimalDraft = (client) =>
    cleanupExpiredAnimalDraftUploads(createSupabaseAnimalDraftUploadCleanupPort(client)),
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
    const [adoption, sponsorship, internship, animalDraft] = await Promise.allSettled([
      runAdoption(client),
      runSponsorship(client),
      runInternship(client),
      runAnimalDraft(client),
    ]);
    if (adoption.status === "rejected")
      logger.error("Adoption upload cleanup failed", adoption.reason);
    if (sponsorship.status === "rejected")
      logger.error("Sponsorship proof cleanup failed", sponsorship.reason);
    if (internship.status === "rejected")
      logger.error("Internship upload cleanup failed", internship.reason);
    if (animalDraft.status === "rejected")
      logger.error("Animal draft upload cleanup failed", animalDraft.reason);
    const failed = [adoption, sponsorship, internship, animalDraft].some(
      (result) => result.status === "rejected" || result.value.failed > 0,
    );
    return Response.json(
      {
        adoption: adoption.status === "fulfilled" ? adoption.value : null,
        sponsorship: sponsorship.status === "fulfilled" ? sponsorship.value : null,
        internship: internship.status === "fulfilled" ? internship.value : null,
        animalDraft: animalDraft.status === "fulfilled" ? animalDraft.value : null,
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
