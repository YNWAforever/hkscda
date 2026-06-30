import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { issueReceiptForDonation } from "../../../lib/donations/reconcile.server";
import { createSupabaseServiceClient, requireAdmin } from "../../../lib/donations/supabase.server";

const issueReceiptSchema = z.object({
  donationId: z.string().uuid(),
  supporterId: z.string().uuid().optional(),
});

async function jsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    throw new z.ZodError([]);
  }
}

function jsonResponse(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("cache-control", "no-store");
  return Response.json(body, { ...init, headers });
}

export const Route = createFileRoute("/api/admin/receipts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const client = createSupabaseServiceClient();
          const admin = await requireAdmin(request, ["treasurer", "admin"], client);
          const body = issueReceiptSchema.parse(await jsonBody(request));
          return jsonResponse(
            await issueReceiptForDonation(client, body.donationId, admin.authUserId, {
              supporterId: body.supporterId,
            }),
          );
        } catch (error) {
          if (error instanceof Response) return error;
          if (error instanceof z.ZodError) {
            return jsonResponse({ error: "Invalid receipt request" }, { status: 400 });
          }
          console.error(error);
          return jsonResponse({ error: "Could not issue receipt" }, { status: 500 });
        }
      },
    },
  },
});
