import { createFileRoute } from "@tanstack/react-router";

import {
  createSupabaseServiceClient,
  listAdminPayments,
  listAdminReceipts,
  requireAdmin,
} from "../../../lib/donations/supabase.server";

export const Route = createFileRoute("/api/admin/payments")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const client = createSupabaseServiceClient();
          await requireAdmin(request, ["staff", "treasurer", "admin"], client);
          const [payments, receipts] = await Promise.all([
            listAdminPayments(client),
            listAdminReceipts(client),
          ]);
          return Response.json(
            { payments, receipts },
            { headers: { "cache-control": "no-store" } },
          );
        } catch (error) {
          if (error instanceof Response) return error;
          console.error(error);
          return Response.json({ error: "Could not load payments" }, { status: 500 });
        }
      },
    },
  },
});
