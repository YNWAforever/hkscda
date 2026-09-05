import { createContentMediaLifecycle } from "../../../../lib/content/mediaLifecycle.server";
import { createSupabaseContentMediaPorts } from "../../../../lib/content/mediaLifecycle.repository.server";
import { createContentLifecycleService } from "../../../../lib/content/lifecycle.service";
import { createSupabaseContentLifecycleRepository } from "../../../../lib/content/lifecycle.repository.server";
import { getAppUrl } from "../../../../lib/appUrl.server";
import { createContentHandlers } from "../../../../lib/content/http.server";
import { createSupabaseContentRepository } from "../../../../lib/content/repository.server";
import { createContentService } from "../../../../lib/content/service";
import {
  createSupabaseServiceClient,
  requireAdmin,
} from "../../../../lib/donations/supabase.server";

export function createHandlers() {
  const client = createSupabaseServiceClient();
  const publicBaseUrl = getAppUrl();
  return createContentHandlers({
    requireContentAdmin: (request) => requireAdmin(request, ["staff", "admin"], client),
    service: createContentService({
      repo: createSupabaseContentRepository(client),
      mediaLifecycle: createContentMediaLifecycle(createSupabaseContentMediaPorts(client)),
      lifecycle: createContentLifecycleService(createSupabaseContentLifecycleRepository(client)),
      publicBaseUrl,
    }),
  });
}
