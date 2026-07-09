import { createFileRoute } from "@tanstack/react-router";

import { listAdminPaymentPage } from "../../../lib/donations/adminPayments.server";
import {
  createSupabaseServiceClient,
  requireAdmin,
} from "../../../lib/donations/supabase.server";

function searchRecord(request: Request) {
  return Object.fromEntries(new URL(request.url).searchParams.entries());
}

export const Route = createFileRoute("/api/admin/payments")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const client = createSupabaseServiceClient();
          await requireAdmin(request, ["staff", "treasurer", "admin"], client);
          const result = await listAdminPaymentPage(client, searchRecord(request));
          return Response.json(result, { headers: { "cache-control": "no-store" } });
        } catch (error) {
          if (error instanceof Response) return error;
          console.error(error);
          return Response.json({ error: "Could not load payments" }, { status: 500 });
        }
      },
    },
  },
});
