import { createFileRoute } from "@tanstack/react-router";
import { readAdminJson } from "../../../../../../lib/http/adminJson.server";
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
import { createSponsorshipFinanceReadHandler } from "../../../../../../lib/sponsorshipAdmin/finance.http.server";
export const Route = createFileRoute("/api/admin/sponsorships/pledges/$id/finance")({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        withErrors(async () => {
          const client = createSupabaseServiceClient();
          return createSponsorshipFinanceReadHandler({
            requireReader: (input) => requireAdmin(input, ["staff", "treasurer", "admin"], client),
            read: createSponsorshipFinanceRepository(client).read,
          })({ request, params });
        }),
      POST: ({ request, params }) =>
        withErrors(async () => {
          const id = requiredUuid(params, "id");
          const input = financeCommandSchema.parse(await readAdminJson(request));
          const client = createSupabaseServiceClient();
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
