import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { issueReceiptForDonation } from "../../../lib/donations/reconcile.server";
import { createSupabaseServiceClient, requireAdmin } from "../../../lib/donations/supabase.server";

const issueReceiptSchema = z.object({
  donationId: z.string().uuid(),
});

export const Route = createFileRoute("/api/admin/receipts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const client = createSupabaseServiceClient();
          const admin = await requireAdmin(request, ["treasurer", "admin"], client);
          const body = issueReceiptSchema.parse(await request.json());
          return Response.json(
            await issueReceiptForDonation(client, body.donationId, admin.authUserId),
          );
        } catch (error) {
          if (error instanceof Response) return error;
          if (error instanceof z.ZodError) {
            return Response.json({ error: "Invalid receipt request" }, { status: 400 });
          }
          console.error(error);
          return Response.json({ error: "Could not issue receipt" }, { status: 500 });
        }
      },
    },
  },
});
