import { createFileRoute } from "@tanstack/react-router";

import { createSupabaseServiceClient } from "../../../lib/donations/supabase.server";
import {
  cleanupExpiredAdoptionUploads,
  createSupabaseAdoptionUploadCleanupPort,
} from "../../../lib/publicAdoption/uploadIntent.server";
import { authorizedCron } from "../../../lib/volunteers/jobs/auth.server";

type Dependencies = {
  secret: () => string | undefined;
  createClient: typeof createSupabaseServiceClient;
  createPort: typeof createSupabaseAdoptionUploadCleanupPort;
  cleanup: typeof cleanupExpiredAdoptionUploads;
};

export function createAdoptionUploadCleanupHandler(overrides: Partial<Dependencies> = {}) {
  const {
    secret = () => process.env.CRON_SECRET,
    createClient = createSupabaseServiceClient,
    createPort = createSupabaseAdoptionUploadCleanupPort,
    cleanup = cleanupExpiredAdoptionUploads,
  } = overrides;

  return async (request: Request): Promise<Response> => {
    if (!authorizedCron(request, secret())) {
      return Response.json(
        { error: "unauthorized" },
        { status: 401, headers: { "cache-control": "no-store" } },
      );
    }
    const summary = await cleanup(createPort(createClient()));
    return Response.json(summary, { headers: { "cache-control": "no-store" } });
  };
}

const handleCleanup = createAdoptionUploadCleanupHandler();

export const Route = createFileRoute("/api/jobs/adoption-uploads")({
  server: {
    handlers: {
      GET: ({ request }) => handleCleanup(request),
    },
  },
});
