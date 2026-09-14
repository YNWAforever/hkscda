import { z } from "zod";
import { normalizeVolunteerResult } from "../apiResult";
import { createBulkService, type BulkCommand } from "./service";
export function createBulkHandlers(deps: {
  requireActor: (request: Request) => Promise<{ authUserId: string }>;
  execute: (actor: string, command: BulkCommand) => Promise<unknown>;
}) {
  const service = createBulkService(deps.execute);
  const response = (body: unknown, status = 200) =>
    Response.json(body, { status, headers: { "cache-control": "no-store" } });
  return {
    async POST(request: Request) {
      try {
        const actor = await deps.requireActor(request);
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return response({ error: "無效的要求內容" }, 400);
        }
        const result = normalizeVolunteerResult(await service.command(actor.authUserId, body));
        return response(result.body, result.status);
      } catch (error) {
        if (error instanceof Response) return error;
        if (error instanceof z.ZodError)
          return response(
            {
              error: "請檢查日期、選取項目及操作欄位",
              code: "invalid_input",
              issues: error.issues,
            },
            400,
          );
        const code = typeof error === "object" && error && "code" in error ? error.code : null;
        if (code === "42501") return response({ error: "沒有此操作權限", code: "forbidden" }, 403);
        if (code === "22023")
          return response({ error: "設定無效，請重新預覽", code: "invalid_input" }, 422);
        console.error("Volunteer bulk command failed", { code });
        return response(
          {
            error: "未能完成操作；請查看已儲存的進度後重試",
            code: "service_unavailable",
            retryable: true,
          },
          500,
        );
      }
    },
  };
}
