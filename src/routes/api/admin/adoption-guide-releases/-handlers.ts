import { requireAdmin } from "../../../../lib/admin/session.server";
import { createAdoptionGuideReleaseHandlers } from "../../../../lib/adoptionGuideReleases/http.server";
import { createSupabaseAdoptionGuideReleaseRepository } from "../../../../lib/adoptionGuideReleases/repository.server";
import { createAdoptionGuideReleaseService } from "../../../../lib/adoptionGuideReleases/service";
import { createSupabaseServiceClient } from "../../../../lib/supabase.server";

export function createHandlers() {
  const client = createSupabaseServiceClient();
  const repository = createSupabaseAdoptionGuideReleaseRepository(client);
  const service = createAdoptionGuideReleaseService(repository);

  return createAdoptionGuideReleaseHandlers({
    requireActor: async (request) => {
      const user = await requireAdmin(request, ["staff", "admin"], client);
      if (user.role !== "staff" && user.role !== "admin") {
        throw new Response("Forbidden", { status: 403 });
      }
      return {
        adminUserId: user.id,
        authUserId: user.authUserId,
        role: user.role,
      };
    },
    service,
  });
}
