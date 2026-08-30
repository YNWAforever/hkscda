import { createFileRoute } from "@tanstack/react-router";

import { createSupabaseServiceClient, requireAdmin } from "../../../lib/donations/supabase.server";
import { createAdminFaqHandlers } from "../../../lib/faq/http";
import { createSupabaseFaqRepository } from "../../../lib/faq/repository.server";
import { createFaqService } from "../../../lib/faq/service";

export function createHandlers() {
  const client = createSupabaseServiceClient();
  return createAdminFaqHandlers({
    requireFaqAdmin: (request) => requireAdmin(request, ["staff", "admin"], client),
    service: createFaqService({ repo: createSupabaseFaqRepository(client) }),
  });
}

export const Route = createFileRoute("/api/admin/faq")({
  server: {
    handlers: {
      GET: ({ request }) => createHandlers().list({ request }),
      POST: ({ request }) => createHandlers().upsert({ request }),
      DELETE: ({ request }) => createHandlers().deactivate({ request }),
    },
  },
});
