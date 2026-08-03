import { createFileRoute } from "@tanstack/react-router";

import { createAdoptionInformationHandlers } from "../../../lib/adoptionInformation/http";
import { createSupabaseAdoptionInformationRepository } from "../../../lib/adoptionInformation/repository.server";
import { createAdoptionInformationService } from "../../../lib/adoptionInformation/service";
import { createSupabaseServiceClient, requireAdmin } from "../../../lib/donations/supabase.server";

export function createHandlers() {
  const client = createSupabaseServiceClient();
  return createAdoptionInformationHandlers({
    requireAdoptionInformationAdmin: (request) => requireAdmin(request, ["staff", "admin"], client),
    service: createAdoptionInformationService({
      repo: createSupabaseAdoptionInformationRepository(client),
    }),
  });
}

export const Route = createFileRoute("/api/admin/adoption-information")({
  server: {
    handlers: {
      GET: ({ request }) => createHandlers().listAdmin({ request }),
      POST: ({ request }) => createHandlers().upsert({ request }),
      DELETE: ({ request }) => createHandlers().deleteEstate({ request }),
    },
  },
});
