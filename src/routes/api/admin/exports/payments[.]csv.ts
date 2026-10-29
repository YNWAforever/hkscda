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
          const admin = await requireAdmin(request, ["treasurer", "admin"], client);
          const filters = searchRecord(request);
          const rows = await listAdminPaymentExportRows(client, filters);
          // Every row carries a supporter's name and email. The donations and supporters
          // exports record who exported what; this one recorded nothing and could be cached
          // (BUG-19). An export whose audit row cannot be written is not sent.
          const { error: auditError } = await client.from("audit_log").insert({
            actor_user_id: admin.authUserId,
            action: "export.payments",
            entity: "export",
            entity_id: "bulk",
            timestamp: new Date().toISOString(),
            detail: { filters, rowCount: rows.length },
          });
          if (auditError) throw auditError;
          const csv = buildPaymentCsv(rows);
          return new Response(csv, {
            headers: {
              "content-type": "text/csv; charset=utf-8",
              "content-disposition": 'attachment; filename="payments.csv"',
              "cache-control": "no-store",
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
