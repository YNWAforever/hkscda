import { createSupabaseServiceClient, requireAdmin } from "../donations/supabase.server";
import { requireVerifiedVolunteer } from "../volunteers/policy/booking.repository.server";
import { createInternshipService } from "./service";
import { createInternshipRepository } from "./repository.server";
import { createInternshipHttp } from "./http.server";
export function internshipHandlers() {
  const client = createSupabaseServiceClient();
  return createInternshipHttp({
    service: createInternshipService(createInternshipRepository(client)),
    authenticate: async (request, admin) =>
      admin
        ? (await requireAdmin(request, ["staff", "admin"], client)).authUserId
        : requireVerifiedVolunteer(request, client),
  });
}
