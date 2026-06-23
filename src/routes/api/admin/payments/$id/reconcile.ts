import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { reconcileManualPayment } from "../../../../../lib/donations/reconcile.server";
import {
  createSupabaseServiceClient,
  requireAdmin,
} from "../../../../../lib/donations/supabase.server";

const reconcileSchema = z.object({
  bankReference: z.string().trim().min(1).max(120),
});

export const Route = createFileRoute("/api/admin/payments/$id/reconcile")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const client = createSupabaseServiceClient();
          const admin = await requireAdmin(request, ["treasurer", "admin"], client);
          const body = reconcileSchema.parse(await request.json());
          const result = await reconcileManualPayment({
            client,
            paymentId: params.id,
            actorUserId: admin.authUserId,
            bankReference: body.bankReference,
          });

          return Response.json(result);
        } catch (error) {
          if (error instanceof Response) return error;
          if (error instanceof z.ZodError) {
            return Response.json({ error: "Invalid reconciliation request" }, { status: 400 });
          }
          console.error(error);
          return Response.json({ error: "Could not reconcile payment" }, { status: 500 });
        }
      },
    },
  },
});
