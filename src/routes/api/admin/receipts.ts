import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { readAdminJson } from "../../../lib/http/adminJson.server";
import {
  InvalidRequestJsonError,
  RequestBodyTooLargeError,
} from "../../../lib/http/publicJson.server";

import { issueReceiptForDonation } from "../../../lib/donations/reconcile.server";
import { createSupabaseServiceClient, requireAdmin } from "../../../lib/donations/supabase.server";

const issueReceiptSchema = z.object({
  donationId: z.string().uuid(),
  supporterId: z.string().uuid().optional(),
});

async function jsonBody(request: Request) {
  return readAdminJson(request);
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
          if (error instanceof RequestBodyTooLargeError) {
            return jsonResponse({ error: "Request body too large" }, { status: 413 });
          }
          if (error instanceof z.ZodError || error instanceof InvalidRequestJsonError) {
            return jsonResponse({ error: "Invalid receipt request" }, { status: 400 });
          }
          console.error(error);
          return jsonResponse({ error: "Could not issue receipt" }, { status: 500 });
        }
      },
    },
  },
});
