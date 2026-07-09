import { createFileRoute } from "@tanstack/react-router";

import { buildPaymentCsv } from "../../../../lib/crm/csv";
import { listAdminPaymentExportRows } from "../../../../lib/donations/adminPayments.server";
import {
  createSupabaseServiceClient,
  requireAdmin,
} from "../../../../lib/donations/supabase.server";

function searchRecord(request: Request) {
  return Object.fromEntries(new URL(request.url).searchParams.entries());
}

export const Route = createFileRoute("/api/admin/exports/payments.csv")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const client = createSupabaseServiceClient();
          await requireAdmin(request, ["treasurer", "admin"], client);
          const rows = await listAdminPaymentExportRows(client, searchRecord(request));
          const csv = buildPaymentCsv(rows);
          return new Response(csv, {
            headers: {
              "content-type": "text/csv; charset=utf-8",
              "content-disposition": 'attachment; filename="payments.csv"',
            },
          });
        } catch (error) {
          if (error instanceof Response) return error;
          console.error(error);
          return Response.json({ error: "Could not export payments" }, { status: 500 });
        }
      },
    },
  },
});
