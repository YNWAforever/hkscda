import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { voidReceipt } from "../../../../../lib/donations/reconcile.server";
import {
  createSupabaseServiceClient,
  requireAdmin,
} from "../../../../../lib/donations/supabase.server";

const voidReceiptSchema = z.object({
  supporterId: z.string().uuid().optional(),
});

const voidReceiptParamsSchema = z.object({
  id: z.string().uuid(),
});

async function optionalJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function jsonResponse(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("cache-control", "no-store");
  return Response.json(body, { ...init, headers });
}

export const Route = createFileRoute("/api/admin/receipts/$id/void")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const client = createSupabaseServiceClient();
          const admin = await requireAdmin(request, ["treasurer", "admin"], client);
          const paramsBody = voidReceiptParamsSchema.parse(params);
          const body = voidReceiptSchema.parse(await optionalJsonBody(request));
          return jsonResponse(
            await voidReceipt(client, paramsBody.id, admin.authUserId, {
              supporterId: body.supporterId,
            }),
          );
        } catch (error) {
          if (error instanceof Response) return error;
          if (error instanceof z.ZodError) {
            return jsonResponse({ error: "Invalid void receipt request" }, { status: 400 });
          }
          console.error(error);
          return jsonResponse({ error: "Could not void receipt" }, { status: 500 });
        }
      },
    },
  },
});
