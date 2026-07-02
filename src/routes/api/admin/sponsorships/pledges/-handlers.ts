import { createSponsorshipAdminHandlers } from "../../../../../lib/sponsorshipAdmin/http.server";
import { createSupabaseSponsorshipAdminRepository } from "../../../../../lib/sponsorshipAdmin/repository.server";
import { createSponsorshipAdminService } from "../../../../../lib/sponsorshipAdmin/service";
import { sendPledgeStatusUpdateEmail } from "../../../../../lib/sponsorshipAdmin/notifications.server";
import {
  createSupabaseServiceClient,
  requireAdmin,
} from "../../../../../lib/donations/supabase.server";

export function createHandlers() {
  const client = createSupabaseServiceClient();
  const service = createSponsorshipAdminService({
    repo: createSupabaseSponsorshipAdminRepository(client),
    sendPledgeStatusUpdateEmail,
    client,
  });

  return createSponsorshipAdminHandlers({
    requireCoordinator: (request) => requireAdmin(request, ["staff", "admin"], client),
    service,
  });
}
