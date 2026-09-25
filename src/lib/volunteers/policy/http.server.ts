import { normalizeVolunteerResult } from "../apiResult";
import { logVolunteerFailure, withVolunteerTiming } from "../telemetry.server";
import { z } from "zod";
import { readAdminJson } from "../../http/adminJson.server";
import { RequestBodyTooLargeError } from "../../http/publicJson.server";
import { createPolicyService, type PolicyCommand, type PolicyResult } from "./service";

export function createPolicyHandlers(deps: {
  requireActor: (request: Request) => Promise<{ authUserId: string }>;
  execute: (actorUserId: string, command: PolicyCommand) => Promise<PolicyResult>;
}) {
  const service = createPolicyService(deps.execute);
  const response = (body: unknown, suppliedStatus?: number) => {
    const { body: payload, status } = normalizeVolunteerResult(body, suppliedStatus);
    return Response.json(payload, { status, headers: { "cache-control": "no-store" } });
  };
  return {
    POST: withVolunteerTiming("policy_command", async (request: Request) => {
      try {
        const actor = await deps.requireActor(request);
        let body: unknown;
        try {
          body = await readAdminJson(request);
        } catch (error) {
          if (error instanceof RequestBodyTooLargeError)
            return response({ error: "Request body too large" }, 413);
          return response({ error: "無效的要求內容" }, 400);
        }
        const result = await service.command(actor.authUserId, body);
        return response(result);
      } catch (error) {
        if (error instanceof Response) return error;
        if (error instanceof z.ZodError)
          return response({ error: "請檢查設定欄位", issues: error.issues }, 400);
        if (typeof error === "object" && error && "code" in error && error.code === "42501")
          return response({ error: "沒有此操作權限" }, 403);
        if (typeof error === "object" && error && "code" in error && error.code === "22023")
          return response({ error: "設定無效，請重新檢查及預覽" }, 422);
        logVolunteerFailure("policy", error);
        return response({ error: "未能處理義工設定，請稍後重試" }, 500);
      }
    }),
  };
}
