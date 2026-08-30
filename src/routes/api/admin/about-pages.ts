import { createFileRoute } from "@tanstack/react-router";

import { createAdminAboutPagesHandlers } from "../../../lib/aboutPages/http.server";
import { createSupabaseAboutPagesRepository } from "../../../lib/aboutPages/repository.server";
import { createAboutPagesService } from "../../../lib/aboutPages/service";
import { createSupabaseServiceClient, requireAdmin } from "../../../lib/donations/supabase.server";

export function createHandlers() {
  const client = createSupabaseServiceClient();
  return createAdminAboutPagesHandlers({
    requireAboutPagesAdmin: (request) => requireAdmin(request, ["staff", "admin"], client),
    service: createAboutPagesService({ repo: createSupabaseAboutPagesRepository(client) }),
  });
}

export const Route = createFileRoute("/api/admin/about-pages")({
  server: {
    handlers: {
      GET: ({ request }) => createHandlers().list({ request }),
      PUT: ({ request }) => createHandlers().upsert({ request }),
    },
  },
});
