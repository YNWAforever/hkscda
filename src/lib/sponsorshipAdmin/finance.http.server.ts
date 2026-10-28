import { canRoleAccessAdminArea } from "../admin/access";
import type { AdminUser } from "../donations/supabase.server";
import type { createSponsorshipFinanceRepository } from "./finance.server";
import { jsonResponse, requiredUuid, withErrors } from "./http.server";

export function createSponsorshipFinanceReadHandler(deps: {
  requireReader: (request: Request) => Promise<AdminUser>;
  read: ReturnType<typeof createSponsorshipFinanceRepository>["read"];
}) {
  return ({ request, params }: { request: Request; params: { id: string } }) =>
    withErrors(async () => {
      const id = requiredUuid(params, "id");
      const actor = await deps.requireReader(request);
      const canFinance = canRoleAccessAdminArea(actor.role, "sponsorshipFinance");
      return jsonResponse({
        ...(await deps.read(id, canFinance)),
        canRefund: canFinance,
        canCoordinate: canRoleAccessAdminArea(actor.role, "sponsorshipReview"),
      });
    });
}
