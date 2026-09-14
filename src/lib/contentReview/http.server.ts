import { z } from "zod";
import type { createContentReviewService } from "./service";
export function createContentReviewHttp(deps: {
  authenticate(request: Request): Promise<string>;
  service: ReturnType<typeof createContentReviewService>;
}) {
  return async (request: Request) => {
    try {
      const actor = await deps.authenticate(request);
      const result =
        request.method === "GET"
          ? await deps.service.list(actor, Object.fromEntries(new URL(request.url).searchParams))
          : await deps.service.review(actor, await request.json());
      return Response.json(result, {
        status:
          "kind" in result && result.kind === "conflict"
            ? 409
            : "kind" in result && result.kind === "not_found"
              ? 404
              : 200,
        headers: { "cache-control": "no-store" },
      });
    } catch (error) {
      if (error instanceof Response) return error;
      return Response.json(
        { error: "未能完成內容審核，請檢查資料及版本後重試。" },
        {
          status: error instanceof z.ZodError || error instanceof SyntaxError ? 400 : 500,
          headers: { "cache-control": "no-store" },
        },
      );
    }
  };
}
