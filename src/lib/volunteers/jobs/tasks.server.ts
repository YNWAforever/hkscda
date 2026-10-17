import { z } from "zod";
import { readAdminJson } from "../../http/adminJson.server";
import { RequestBodyTooLargeError } from "../../http/publicJson.server";
import { createSupabaseServiceClient, requireAdmin } from "../../donations/supabase.server";
import { pendingWorkQuerySchema, readPendingWorkSnapshot } from "../pending";
export const volunteerTaskSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list"), ...pendingWorkQuerySchema.shape }).strict(),
  z.object({ action: z.literal("retry"), id: z.string().uuid() }).strict(),
  z
    .object({
      action: z.literal("complete"),
      id: z.string().uuid(),
      reason: z.string().trim().min(1).max(1000),
    })
    .strict(),
]);
export function createVolunteerTaskHandler(deps: {
  authorize: (request: Request) => Promise<{ authUserId: string }>;
  rpc: (
    name: "volunteer_task_command" | "volunteer_pending_work_snapshot",
    args: Record<string, unknown>,
  ) => Promise<unknown>;
}) {
  return async function handle(request: Request) {
    const headers = { "cache-control": "no-store" };
    try {
      const actor = await deps.authorize(request);
      const command = volunteerTaskSchema.parse(await readAdminJson(request));
      if (command.action === "list") {
        const { action: _action, ...query } = command;
        const [support, pending] = await Promise.all([
          deps.rpc("volunteer_task_command", {
            p_actor: actor.authUserId,
            p_command: { ...command, include_pending: false },
          }),
          readPendingWorkSnapshot(
            (args) => deps.rpc("volunteer_pending_work_snapshot", args),
            actor.authUserId,
            query,
          ),
        ]);
        const parsedSupport = z
          .object({ tasks: z.array(z.unknown()), notifications: z.array(z.unknown()) })
          .safeParse(support);
        if (!parsedSupport.success) throw new Error("Invalid task support response");
        return Response.json(
          {
            ...parsedSupport.data,
            pending: pending.registrations,
            pendingCounts: pending.counts,
            page: pending.page,
            pageSize: pending.pageSize,
            filteredTotal: pending.filteredTotal,
          },
          { headers },
        );
      }
      const data = await deps.rpc("volunteer_task_command", {
        p_actor: actor.authUserId,
        p_command: command,
      });
      const result = z.object({ kind: z.string() }).passthrough().parse(data);
      return Response.json(result, {
        headers,
        status: result.kind === "conflict" ? 409 : result.kind === "not_found" ? 404 : 200,
      });
    } catch (error) {
      if (error instanceof Response) {
        const safeHeaders = new Headers(error.headers);
        safeHeaders.set("cache-control", "no-store");
        return new Response(error.body, { status: error.status, headers: safeHeaders });
      }
      if (error instanceof RequestBodyTooLargeError)
        return Response.json({ error: "Request body too large" }, { status: 413, headers });
      if (error instanceof z.ZodError || error instanceof SyntaxError)
        return Response.json({ error: "請檢查跟進資料" }, { status: 400, headers });
      console.error("volunteer task failed");
      return Response.json({ error: "未能更新跟進事項" }, { status: 500, headers });
    }
  };
}
export async function handleVolunteerTask(request: Request) {
  const client = createSupabaseServiceClient();
  return createVolunteerTaskHandler({
    authorize: (value) => requireAdmin(value, ["staff", "admin"], client),
    rpc: async (name, args) => {
      const { data, error } = await client.rpc(name, args);
      if (error) throw error;
      return data;
    },
  })(request);
}
