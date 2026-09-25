import { withVolunteerTiming, logVolunteerFailure } from "../telemetry.server";
import { normalizeVolunteerResult } from "../apiResult";
import { z } from "zod";
import { RequestBodyTooLargeError, readPublicJson } from "../../http/publicJson.server";
import type { createBookingService } from "./booking";
const envelope = z.object({ command: z.unknown(), turnstileToken: z.string().optional() }).strict();
export function createBookingHandlers(deps: {
  service: ReturnType<typeof createBookingService>;
  authenticate: (request: Request) => Promise<string>;
  verify: (token: string | undefined, request: Request) => Promise<boolean>;
}) {
  const json = (body: unknown, suppliedStatus?: number) => {
    const { body: normalized, status } = normalizeVolunteerResult(body, suppliedStatus);
    return Response.json(normalized, { status, headers: { "cache-control": "no-store" } });
  };
  const run = async (fn: () => Promise<Response>) => {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof Response) return json({ error: await error.text() }, error.status);
      if (error instanceof RequestBodyTooLargeError)
        return json({ error: "Request body too large" }, 413);
      if (error instanceof z.ZodError || error instanceof SyntaxError)
        return json({ error: "提交資料無效" }, 400);
      if (typeof error === "object" && error && "code" in error) {
        if (error.code === "42501") return json({ kind: "forbidden" }, 403);
        if (error.code === "22023") return json({ kind: "invalid" }, 422);
      }
      logVolunteerFailure("member_booking", error);
      return json({ error: "暫時未能處理，請重試。" }, 500);
    }
  };
  return {
    get: withVolunteerTiming("member_booking_read", (request: Request) =>
      run(async () => {
        const params = new URL(request.url).searchParams;
        const view = params.get("view") ?? "sessions";
        if (view === "sessions") {
          const rows = await deps.service.sessions(
            Object.fromEntries(
              ["page", "query", "shelter", "date"].flatMap((key) =>
                params.has(key) ? [[key, params.get(key)]] : [],
              ),
            ),
          );
          return json({ sessions: rows.slice(0, 25), has_more: rows.length > 25 });
        }
        if (view === "terms")
          return json({
            terms: await deps.service.terms(
              z.array(z.string().uuid()).max(25).parse(params.getAll("id")),
            ),
          });
        if (view === "me")
          return json(
            await deps.service.me(
              await deps.authenticate(request),
              Object.fromEntries(
                ["upcoming_page", "history_page"].flatMap((key) =>
                  params.has(key) ? [[key, params.get(key)]] : [],
                ),
              ),
            ),
          );
        return json({ error: "查詢無效" }, 400);
      }),
    ),
    post: withVolunteerTiming("member_booking_command", (request: Request) =>
      run(async () => {
        const actor = await deps.authenticate(request);
        const input = envelope.parse(await readPublicJson(request));
        const action = (input.command as { action?: unknown } | null)?.action;
        if (action !== "availability" && !(await deps.verify(input.turnstileToken, request)))
          return json({ error: "請完成驗證" }, 403);
        const result =
          action === "claim"
            ? await deps.service.claim(actor, input.command)
            : await deps.service.command(actor, input.command);
        return json(
          result,
          result.kind === "not_found"
            ? 404
            : result.kind === "denied" || result.kind === "conflict"
              ? 409
              : 200,
        );
      }),
    ),
  };
}
