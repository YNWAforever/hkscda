import { z } from "zod";
import { readAdminJson } from "../../http/adminJson.server";
import { RequestBodyTooLargeError } from "../../http/publicJson.server";
import { createSupabaseServiceClient, requireAdmin } from "../../donations/supabase.server";
import { pendingQuerySchema, readPendingSnapshot } from "../pending";
export const volunteerTaskSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list"), ...pendingQuerySchema.shape }).strict(),
  z.object({ action: z.literal("retry"), id: z.string().uuid() }).strict(),
  z
    .object({
      action: z.literal("complete"),
      id: z.string().uuid(),
      reason: z.string().trim().min(1).max(1000),
    })
    .strict(),
]);
export async function handleVolunteerTask(request: Request) {
  const headers = { "cache-control": "no-store" };
  try {
    const client = createSupabaseServiceClient();
    const actor = await requireAdmin(request, ["staff", "admin"], client);
    const command = volunteerTaskSchema.parse(await readAdminJson(request));
    const { data, error } = await client.rpc("volunteer_task_command", {
      p_actor: actor.authUserId,
      p_command: command,
    });
    if (error) throw error;
    if (command.action === "list") {
      const pending = await readPendingSnapshot(
        async (args) => {
          const result = await client.rpc("volunteer_pending_snapshot", args);
          if (result.error) throw result.error;
          return result.data;
        },
        actor.authUserId,
        { scope: command.scope, page: command.page, pageSize: command.pageSize },
      );
      return Response.json(
        {
          ...data,
          pending: pending.registrations,
          pendingCounts: pending.counts,
          page: pending.page,
          pageSize: pending.pageSize,
        },
        { headers },
      );
    }
    return Response.json(data, {
      headers,
      status: data.kind === "conflict" ? 409 : data.kind === "not_found" ? 404 : 200,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof RequestBodyTooLargeError)
      return Response.json({ error: "Request body too large" }, { status: 413, headers });
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return Response.json({ error: "請檢查跟進資料" }, { status: 400, headers });
    console.error("volunteer task failed", error);
    return Response.json({ error: "未能更新跟進事項" }, { status: 500, headers });
  }
}
