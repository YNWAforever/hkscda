import { createFileRoute } from "@tanstack/react-router";

import {
  createSupabaseServiceClient,
  requireAdmin,
} from "../../../../lib/donations/supabase.server";
import { createAdminFaqSearchGapHandler } from "../../../../lib/faq/http";
import { createSupabaseSearchGapRepository } from "../../../../lib/faq/searchGapRepository.server";
import { createSearchGapService } from "../../../../lib/faq/searchGaps";

function createHandler() {
  const client = createSupabaseServiceClient();
  return createAdminFaqSearchGapHandler({
    requireFaqAdmin: (request) => requireAdmin(request, ["staff", "admin"], client),
    service: createSearchGapService({ repo: createSupabaseSearchGapRepository(client) }),
  });
}

export const Route = createFileRoute("/api/admin/faq/search-gaps")({
  server: {
    handlers: {
      GET: ({ request }) => createHandler()({ request }),
    },
  },
});
