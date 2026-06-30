import { createFileRoute } from "@tanstack/react-router";

import { createCrmHandlers } from "../../../lib/crm/http.server";
import { createSupabaseCrmRepository } from "../../../lib/crm/repository.server";
import { createCrmService } from "../../../lib/crm/service";
import { createSupabaseServiceClient, requireAdmin } from "../../../lib/donations/supabase.server";

function createHandlers() {
  const client = createSupabaseServiceClient();
  return createCrmHandlers({
    requireTreasurer: (request) => requireAdmin(request, ["treasurer", "admin"], client),
    service: createCrmService({ repo: createSupabaseCrmRepository(client) }),
  });
}

export const Route = createFileRoute("/api/admin/supporters")({
  server: {
    handlers: {
      GET: ({ request }) => createHandlers().listSupporters({ request }),
      POST: ({ request }) => createHandlers().createSupporter({ request }),
    },
  },
});
