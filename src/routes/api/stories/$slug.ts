import { createFileRoute } from "@tanstack/react-router";

import { getAppUrl } from "../../../lib/appUrl.server";
import { createContentHandlers } from "../../../lib/content/http.server";
import { createSupabaseContentRepository } from "../../../lib/content/repository.server";
import { createContentService } from "../../../lib/content/service";
import { createSupabaseServiceClient } from "../../../lib/donations/supabase.server";

function createHandlers() {
  const client = createSupabaseServiceClient();
  const publicBaseUrl = getAppUrl();
  return createContentHandlers({
    requireContentAdmin: async () => {
      throw new Response("Forbidden", { status: 403 });
    },
    service: createContentService({ repo: createSupabaseContentRepository(client), publicBaseUrl }),
  });
}

export const Route = createFileRoute("/api/stories/$slug")({
  server: {
    handlers: {
      GET: ({ request, params }) => createHandlers().getPublicContent({ request, params }),
    },
  },
});
