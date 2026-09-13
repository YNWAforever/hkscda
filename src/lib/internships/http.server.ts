import { z } from "zod";
import type { createInternshipService, InternshipResult } from "./service";
export function createInternshipHttp(deps: {
  service: ReturnType<typeof createInternshipService>;
  authenticate(request: Request, admin: boolean): Promise<string>;
}) {
  const respond = (result: InternshipResult) =>
    Response.json(result, {
      status:
        result.kind === "conflict"
          ? 409
          : result.kind === "denied"
            ? 422
            : result.kind === "not_found"
              ? 404
              : 200,
      headers: { "cache-control": "no-store" },
    });
  const failure = (error: unknown) => {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return Response.json({ error: "請檢查實習申請欄位" }, { status: 400 });
    if (error && typeof error === "object" && "code" in error && error.code === "42501")
      return Response.json({ error: "沒有此操作權限" }, { status: 403 });
    if (error && typeof error === "object" && "code" in error && error.code === "22023")
      return Response.json({ error: "操作不符合目前申請狀態或核實要求" }, { status: 422 });
    console.error("Internship command failed", error);
    return Response.json({ error: "未能處理，請重新整理後再試" }, { status: 500 });
  };
  return {
    async get() {
      try {
        return respond(await deps.service.intake());
      } catch (error) {
        return failure(error);
      }
    },
    async post(request: Request, admin = false) {
      try {
        const actor = await deps.authenticate(request, admin);
        const raw = await request.json();
        return respond(
          await (admin
            ? deps.service.adminCommand(actor, raw)
            : deps.service.publicCommand(actor, raw)),
        );
      } catch (error) {
        return failure(error);
      }
    },
  };
}
