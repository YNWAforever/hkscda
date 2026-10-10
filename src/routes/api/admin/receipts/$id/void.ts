import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { readBoundedText } from "../../../../../lib/http/boundedBody.server";
import { MAX_ADMIN_JSON_BYTES } from "../../../../../lib/http/adminJson.server";
import {
  InvalidRequestJsonError,
  RequestBodyTooLargeError,
} from "../../../../../lib/http/publicJson.server";

import { requiredReasonSchema } from "../../../../../lib/admin/requiredReason";
import { voidReceipt } from "../../../../../lib/donations/reconcile.server";
import {
  createSupabaseServiceClient,
  requireAdmin,
} from "../../../../../lib/donations/supabase.server";

const voidReceiptSchema = z.object({
  supporterId: z.string().uuid().optional(),
  reason: requiredReasonSchema,
});

const voidReceiptParamsSchema = z.object({
  id: z.string().uuid(),
});

async function optionalJsonBody(request: Request) {
  const body = await readBoundedText(request, MAX_ADMIN_JSON_BYTES);
  if (body === null) throw new RequestBodyTooLargeError("Request body too large");
  if (body.trim() === "") return {};
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new InvalidRequestJsonError("Invalid JSON body");
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
              reason: body.reason,
            }),
          );
        } catch (error) {
          if (error instanceof Response) return error;
          if (error instanceof RequestBodyTooLargeError) {
            return jsonResponse({ error: "Request body too large" }, { status: 413 });
          }
          if (error instanceof z.ZodError || error instanceof InvalidRequestJsonError) {
            return jsonResponse({ error: "Invalid void receipt request" }, { status: 400 });
          }
          console.error(error);
          return jsonResponse({ error: "Could not void receipt" }, { status: 500 });
        }
      },
    },
  },
});
