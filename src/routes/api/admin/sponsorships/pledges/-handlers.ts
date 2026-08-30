import { createSponsorshipAdminHandlers } from "../../../../../lib/sponsorshipAdmin/http.server";
import { createSupabaseSponsorshipAdminRepository } from "../../../../../lib/sponsorshipAdmin/repository.server";
import { createSponsorshipAdminService } from "../../../../../lib/sponsorshipAdmin/service";
import { sendPledgeStatusUpdateEmail } from "../../../../../lib/sponsorshipAdmin/notifications.server";
import { SPONSORSHIP_REVIEW_ROLES } from "../../../../../lib/sponsorshipAdmin/schemas";
import {
  createSupabaseServiceClient,
  requireAdmin,
} from "../../../../../lib/donations/supabase.server";

function createContext() {
  const client = createSupabaseServiceClient();
  const service = createSponsorshipAdminService({
    repo: createSupabaseSponsorshipAdminRepository(client),
    sendPledgeStatusUpdateEmail,
    client,
  });
  const requireCoordinator = (request: Request) =>
    requireAdmin(request, [...SPONSORSHIP_REVIEW_ROLES], client);

  return { client, service, requireCoordinator };
}

export function createHandlers() {
  const { service, requireCoordinator } = createContext();
  return createSponsorshipAdminHandlers({ requireCoordinator, service });
}

/**
 * Exposes the raw service/client/auth check for routes that need to do
 * request-specific pre-processing (e.g. the multipart proof upload route,
 * which must check payment eligibility and upload a file to storage before
 * delegating to `service.recordPayment`) without re-wiring the
 * repository/service/notifications dependencies from scratch.
 */
export function createHandlersWithContext() {
  return createContext();
}
