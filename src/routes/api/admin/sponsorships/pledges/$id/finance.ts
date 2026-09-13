import { createFileRoute } from "@tanstack/react-router";
import {
  createSupabaseServiceClient,
  requireAdmin,
} from "../../../../../../lib/donations/supabase.server";
import {
  withErrors,
  jsonResponse,
  requiredUuid,
} from "../../../../../../lib/sponsorshipAdmin/http.server";
import {
  createSponsorshipFinanceRepository,
  financeCommandSchema,
} from "../../../../../../lib/sponsorshipAdmin/finance.server";
export const Route = createFileRoute("/api/admin/sponsorships/pledges/$id/finance")({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        withErrors(async () => {
          const id = requiredUuid(params, "id");
          const client = createSupabaseServiceClient();
          const actor = await requireAdmin(request, ["staff", "treasurer", "admin"], client);
          return jsonResponse({
            ...(await createSponsorshipFinanceRepository(client).read(id)),
            canRefund: ["admin", "treasurer"].includes(actor.role),
            canCoordinate: ["admin", "staff"].includes(actor.role),
          });
        }),
      POST: ({ request, params }) =>
        withErrors(async () => {
          const id = requiredUuid(params, "id");
          const client = createSupabaseServiceClient();
          const input = financeCommandSchema.parse(await request.json());
          const roles =
            input.action === "refund" ||
            input.action === "reconcile" ||
            input.action === "receipt_requested" ||
            input.action === "verify_contact" ||
            input.action === "reverse" ||
            input.action === "allocate"
              ? (["admin", "treasurer"] as const)
              : (["admin", "staff"] as const);
          const actor = await requireAdmin(request, [...roles], client);
          return jsonResponse(
            await createSponsorshipFinanceRepository(client).command(actor.authUserId, id, input),
          );
        }),
    },
  },
});
