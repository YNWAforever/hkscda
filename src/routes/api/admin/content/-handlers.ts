import { createContentHandlers } from "../../../../lib/content/http.server";
import { createSupabaseContentRepository } from "../../../../lib/content/repository.server";
import { createContentService } from "../../../../lib/content/service";
import {
  createSupabaseServiceClient,
  requireAdmin,
} from "../../../../lib/donations/supabase.server";

export function createHandlers() {
  const client = createSupabaseServiceClient();
  const publicBaseUrl = process.env.APP_URL ?? "http://localhost:5173";
  return createContentHandlers({
    requireContentAdmin: (request) => requireAdmin(request, ["staff", "admin"], client),
    service: createContentService({ repo: createSupabaseContentRepository(client), publicBaseUrl }),
  });
}
