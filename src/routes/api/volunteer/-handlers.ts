import { createSupabaseServiceClient } from "../../../lib/donations/supabase.server";
import { createVolunteerHandlers } from "../../../lib/volunteers/http.server";
import {
  notifyVolunteerAdmins,
  sendVolunteerRegistrationEmail,
} from "../../../lib/volunteers/notifications.server";
import { createSupabaseVolunteerRepository } from "../../../lib/volunteers/repository.server";
import { createVolunteerService } from "../../../lib/volunteers/service";
import { getClientIp } from "../../../lib/security/rate-limit.server";
import { verifyTurnstile } from "../../../lib/security/turnstile.server";

export function createHandlers() {
  const client = createSupabaseServiceClient();
  const service = createVolunteerService({
    repo: createSupabaseVolunteerRepository(client),
    async sendRegistrationEmail(input) {
      await sendVolunteerRegistrationEmail(client, input);
    },
    async notifyAdmins(input) {
      await notifyVolunteerAdmins(input);
    },
  });

  return createVolunteerHandlers({
    requireVolunteerAdmin: async () => {
      throw new Response("Forbidden", { status: 403 });
    },
    service,
    verifyPublicRegistration: (input, request) =>
      verifyTurnstile(
        typeof input.turnstileToken === "string" ? input.turnstileToken : undefined,
        getClientIp(request),
      ),
  });
}
