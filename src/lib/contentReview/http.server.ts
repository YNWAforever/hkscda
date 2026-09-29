import { z } from "zod";
import { readAdminJson } from "../http/adminJson.server";
import { InvalidRequestJsonError, RequestBodyTooLargeError } from "../http/publicJson.server";
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
          : await deps.service.review(actor, await readAdminJson(request));
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
      if (error instanceof RequestBodyTooLargeError)
        return Response.json(
          { error: "Request body too large" },
          {
            status: 413,
            headers: { "cache-control": "no-store" },
          },
        );
      const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
      return Response.json(
        { error: "未能完成內容審核，請檢查資料及版本後重試。" },
        {
          status:
            code === "42501"
              ? 403
              : error instanceof z.ZodError ||
                  error instanceof SyntaxError ||
                  error instanceof InvalidRequestJsonError
                ? 400
                : 500,
          headers: { "cache-control": "no-store" },
        },
      );
    }
  };
}
