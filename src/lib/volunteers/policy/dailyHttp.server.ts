import { normalizeVolunteerResult } from "../apiResult";
import { logVolunteerFailure, withVolunteerTiming } from "../telemetry.server";
import { z } from "zod";
import {
  createDailyPolicyService,
  type DailyPolicyCommand,
  type DailyPolicyResult,
} from "./dailyService";
export function createDailyPolicyHandlers(deps: {
  requireActor: (request: Request) => Promise<{ authUserId: string }>;
  execute: (actor: string, command: DailyPolicyCommand) => Promise<DailyPolicyResult>;
}) {
  const service = createDailyPolicyService(deps.execute);
  const response = (body: unknown, suppliedStatus?: number) => {
    const { body: payload, status } = normalizeVolunteerResult(body, suppliedStatus);
    return Response.json(payload, { status, headers: { "cache-control": "no-store" } });
  };
  return {
    POST: withVolunteerTiming("daily_policy_command", async (request: Request) => {
      try {
        const actor = await deps.requireActor(request);
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return response({ error: "無效的要求內容" }, 400);
        }
        const result = await service.command(actor.authUserId, body);
        return response(result);
      } catch (error) {
        if (error instanceof Response) return error;
        if (error instanceof z.ZodError)
          return response({ error: "請檢查全日配額設定", issues: error.issues }, 400);
        if (typeof error === "object" && error && "code" in error) {
          if (error.code === "42501") return response({ error: "沒有此操作權限" }, 403);
          if (error.code === "22023") return response({ error: "請重新檢查及預覽全日設定" }, 422);
        }
        logVolunteerFailure("daily_policy", error);
        return response({ error: "未能處理全日配額，請稍後重試" }, 500);
      }
    }),
  };
}
