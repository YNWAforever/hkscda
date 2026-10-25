import { z } from "zod";
import { createSupabaseServiceClient, requireAdmin } from "../../donations/supabase.server";
import { logVolunteerFailure } from "../telemetry.server";

type Dependencies = {
  authorize: (request: Request) => Promise<{ authUserId: string }>;
  retry: (id: string, actorId: string) => Promise<unknown>;
  reportFailure?: (error: unknown) => void;
};
const codeOf = (error: unknown) =>
  error && typeof error === "object" && "code" in error ? error.code : null;

export function createNotificationRetryHandler(deps: Dependencies) {
  const headers = { "cache-control": "no-store" };
  const failure = (status: number, code: string) =>
    Response.json({ error: code, code }, { status, headers });
  return async (request: Request, id: string): Promise<Response> => {
    try {
      const actor = await deps.authorize(request);
      const parsed = z.string().uuid().safeParse(id);
      if (!parsed.success) return failure(400, "volunteer_notification_retry_invalid");
      const data = await deps.retry(parsed.data, actor.authUserId);
      if (data === true) return Response.json({ kind: "queued" }, { headers });
      if (data === false) return Response.json({ kind: "conflict" }, { status: 409, headers });
      return failure(503, "volunteer_notification_retry_unavailable");
    } catch (error) {
      if (error instanceof Response) {
        const response = new Response(error.body, error);
        response.headers.set("cache-control", "no-store");
        return response;
      }
      const code = codeOf(error);
      if (code === "42501") return failure(403, "volunteer_notification_retry_forbidden");
      if (code === "22023" || code === "22P02")
        return failure(400, "volunteer_notification_retry_invalid");
      deps.reportFailure?.(error);
      if (code === "PGRST202" || code === "42883")
        return failure(503, "volunteer_notification_retry_unavailable");
      return failure(500, "volunteer_notification_retry_failed");
    }
  };
}

export async function handleNotificationJobRetry(request: Request, id: string) {
  const client = createSupabaseServiceClient();
  return createNotificationRetryHandler({
    authorize: (candidate) => requireAdmin(candidate, ["admin"], client),
    retry: async (jobId, actorId) => {
      const { data, error } = await client.rpc("retry_volunteer_operation_outbox", {
        p_actor: actorId,
        p_id: jobId,
      });
      if (error) throw error;
      return data;
    },
    reportFailure: (error) => logVolunteerFailure("notification_retry", error),
  })(request, id);
}
