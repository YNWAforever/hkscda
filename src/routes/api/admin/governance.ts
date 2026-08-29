import { createFileRoute } from "@tanstack/react-router";

import { createSupabaseServiceClient, requireAdmin } from "../../../lib/donations/supabase.server";
import { createAdminGovernanceHandlers } from "../../../lib/governance/http";
import { createSupabaseGovernanceRepository } from "../../../lib/governance/repository.server";
import { createGovernanceService } from "../../../lib/governance/service";

export function createHandlers() {
  const client = createSupabaseServiceClient();
  return createAdminGovernanceHandlers({
    requireGovernanceAdmin: (request) => requireAdmin(request, ["admin"], client),
    service: createGovernanceService({ repo: createSupabaseGovernanceRepository(client) }),
  });
}

export const Route = createFileRoute("/api/admin/governance")({
  server: {
    handlers: {
      GET: ({ request }) => createHandlers().list({ request }),
      POST: ({ request }) => createHandlers().upsert({ request }),
      DELETE: ({ request }) => createHandlers().deactivate({ request }),
    },
  },
});
