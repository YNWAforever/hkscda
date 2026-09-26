import { z } from "zod";
import { readAdminJson } from "../../http/adminJson.server";
import { InvalidRequestJsonError, RequestBodyTooLargeError } from "../../http/publicJson.server";
import { createAssessmentService, type AssessmentResult } from "./service";
import type { AssessmentCommand } from "./schemas";
export function createAssessmentHandlers(d: {
  requireActor: (r: Request) => Promise<{ authUserId: string }>;
  execute: (a: string, c: AssessmentCommand) => Promise<AssessmentResult>;
}) {
  const s = createAssessmentService(d.execute);
  return {
    async POST(r: Request) {
      try {
        const a = await d.requireActor(r);
        const x = await s.command(a.authUserId, await readAdminJson(r));
        return Response.json(x, {
          status:
            x.kind === "conflict"
              ? 409
              : x.kind === "invalid"
                ? 422
                : x.kind === "not_found"
                  ? 404
                  : 200,
          headers: { "cache-control": "no-store" },
        });
      } catch (e) {
        if (e instanceof Response) return e;
        if (e instanceof RequestBodyTooLargeError)
          return Response.json({ error: "Request body too large" }, { status: 413 });
        if (e instanceof InvalidRequestJsonError)
          return Response.json({ error: "無效要求" }, { status: 400 });
        if (e instanceof z.ZodError)
          return Response.json({ error: "請檢查每月評核設定", issues: e.issues }, { status: 400 });
        if (typeof e === "object" && e && "code" in e && e.code === "42501")
          return Response.json({ error: "沒有此操作權限" }, { status: 403 });
        console.error("Volunteer assessment failed", e);
        return Response.json({ error: "未能處理每月評核" }, { status: 500 });
      }
    },
  };
}
