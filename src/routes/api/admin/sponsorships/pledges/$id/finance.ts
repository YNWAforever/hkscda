import { createFileRoute } from "@tanstack/react-router";
import type { AdminRole } from "../../../../../../lib/admin/access";
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
          // Authenticate before reading the body: an anonymous caller used to get the
          // body's 400 (and have up to 8 MB parsed) instead of 401 (BUG-26). The role a
          // command needs depends on its action, so that check follows the parse.
          const client = createSupabaseServiceClient();
          const actor = await requireAdmin(request, ["staff", "treasurer", "admin"], client);
          const id = requiredUuid(params, "id");
          const input = financeCommandSchema.parse(await readAdminJson(request));
          const roles: readonly AdminRole[] =
            input.action === "refund" ||
            input.action === "reconcile" ||
            input.action === "receipt_requested" ||
            input.action === "verify_contact" ||
            input.action === "reverse" ||
            input.action === "allocate"
              ? ["admin", "treasurer"]
              : ["admin", "staff"];
          if (!roles.includes(actor.role)) throw new Response("Forbidden", { status: 403 });
          return jsonResponse(
            await createSponsorshipFinanceRepository(client).command(actor.authUserId, id, input),
          );
        }),
    },
  },
});
