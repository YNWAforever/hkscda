import { createFileRoute } from "@tanstack/react-router";

import { createSupabaseServiceClient, requireAdmin } from "../../../lib/donations/supabase.server";
import { createAdminKnowledgeHandlers } from "../../../lib/knowledge/http";
export { createAdminKnowledgeHandlers } from "../../../lib/knowledge/http";
import { createSupabaseKnowledgeRepository } from "../../../lib/knowledge/repository.server";
import { createKnowledgeService } from "../../../lib/knowledge/service";

export function createHandlers() {
  const client = createSupabaseServiceClient();
  return createAdminKnowledgeHandlers({
    requireKnowledgeAdmin: (request) => requireAdmin(request, ["staff", "admin"], client),
    service: createKnowledgeService({ repo: createSupabaseKnowledgeRepository(client) }),
  });
}

export const Route = createFileRoute("/api/admin/knowledge")({
  server: {
    handlers: {
      GET: ({ request }) => createHandlers().list({ request }),
      POST: ({ request }) => createHandlers().upsert({ request }),
      DELETE: ({ request }) => createHandlers().remove({ request }),
    },
  },
});
