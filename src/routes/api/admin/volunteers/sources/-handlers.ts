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
import { sourceCommandSchema } from "../../../../../lib/volunteers/policy/sourceService";
export function createHandlers() {
  return {
    async POST(request: Request) {
      try {
        const client = createSupabaseServiceClient();
        const actor = await requireAdmin(request, ["admin"], client);
        const body = await readAdminJson(request);
        const command = sourceCommandSchema.parse(body);
        const { data, error } = await client.rpc("volunteer_policy_source_command", {
          p_actor: actor.authUserId,
          p_command: command,
        });
        if (error) throw error;
        return Response.json(data, {
          status: data?.kind === "conflict" ? 409 : data?.kind === "invalid" ? 422 : 200,
          headers: { "cache-control": "no-store" },
        });
      } catch (error) {
        if (error instanceof Response) return error;
        if (error instanceof RequestBodyTooLargeError)
          return Response.json({ error: "Request body too large" }, { status: 413 });
        if (error instanceof InvalidRequestJsonError)
          return Response.json({ error: "無效要求" }, { status: 400 });
        if (error instanceof z.ZodError)
          return Response.json({ error: "請核對設定欄位", issues: error.issues }, { status: 400 });
        if (
          typeof error === "object" &&
          error &&
          "code" in error &&
          (error.code === "42501" || error.code === "22023")
        )
          return Response.json(
            { error: "設定未符合權限或有效性要求" },
            { status: error.code === "42501" ? 403 : 422 },
          );
        console.error("Volunteer sources failed", error);
        return Response.json({ error: "未能儲存來源設定" }, { status: 500 });
      }
    },
  };
}
