import { createFileRoute } from "@tanstack/react-router";

import { buildPaymentCsv } from "../../../../lib/crm/csv";
import {
  createSupabaseServiceClient,
  listAdminPayments,
  requireAdmin,
} from "../../../../lib/donations/supabase.server";

type PaymentWithDonation = Awaited<ReturnType<typeof listAdminPayments>>[number] & {
  donation: { purpose: string; supporter: { name: string; email: string } };
};

export const Route = createFileRoute("/api/admin/exports/payments.csv")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const client = createSupabaseServiceClient();
          await requireAdmin(request, ["treasurer", "admin"], client);
          const payments = (await listAdminPayments(client)) as unknown as PaymentWithDonation[];
          const csv = buildPaymentCsv(
            payments.map((payment) => ({
              paymentId: payment.id,
              supporterName: payment.donation.supporter.name,
              supporterEmail: payment.donation.supporter.email,
              provider: payment.provider,
              amountCents: payment.amount_cents,
              purpose: payment.donation.purpose,
              status: payment.status,
              providerRef: payment.provider_ref,
              bankReference: payment.bank_reference,
              receivedAt: payment.received_at,
              createdAt: payment.created_at,
            })),
          );
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
