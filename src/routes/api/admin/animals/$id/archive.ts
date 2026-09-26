import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { readAdminJson } from "../../../../../lib/http/adminJson.server";
import {
  InvalidRequestJsonError,
  RequestBodyTooLargeError,
} from "../../../../../lib/http/publicJson.server";

import {
  createSupabaseServiceClient,
  requireAdmin,
} from "../../../../../lib/donations/supabase.server";

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

export const Route = createFileRoute("/api/admin/animals/$id/archive")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const parsedId = z.string().uuid().safeParse(params.id);
          if (!parsedId.success) return jsonResponse({ error: "Invalid animal id" }, 400);

          const body = await readAdminJson(request);
          if (
            !body ||
            typeof body !== "object" ||
            Array.isArray(body) ||
            !("archived" in body) ||
            typeof body.archived !== "boolean"
          )
            return jsonResponse({ error: "Invalid archive state" }, 400);

          const client = createSupabaseServiceClient();
          const admin = await requireAdmin(request, ["staff", "admin"], client);
          const { data, error } = await client.rpc("set_animal_archived_with_audit", {
            p_actor_user_id: admin.authUserId,
            p_animal_id: parsedId.data,
            p_archived: body.archived,
          });
          if (error) throw error;
          if (!data || data.kind === "not_found")
            return jsonResponse({ error: "Animal not found" }, 404);
          return jsonResponse(data);
        } catch (error) {
          if (error instanceof Response) return error;
          if (error instanceof RequestBodyTooLargeError)
            return jsonResponse({ error: "Request body too large" }, 413);
          if (error instanceof InvalidRequestJsonError)
            return jsonResponse({ error: "Invalid archive state" }, 400);
          console.error(error);
          return jsonResponse({ error: "Could not update animal archive state" }, 500);
        }
      },
    },
  },
});
