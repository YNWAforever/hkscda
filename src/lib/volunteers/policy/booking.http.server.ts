import { z } from "zod";
import type { createBookingService } from "./booking";
const envelope = z.object({ command: z.unknown(), turnstileToken: z.string().optional() }).strict();
export function createBookingHandlers(deps: {
  service: ReturnType<typeof createBookingService>;
  authenticate: (request: Request) => Promise<string>;
  verify: (token: string | undefined, request: Request) => Promise<boolean>;
}) {
  const json = (body: unknown, status = 200) =>
    Response.json(body, { status, headers: { "cache-control": "no-store" } });
  const run = async (fn: () => Promise<Response>) => {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof Response) return json({ error: await error.text() }, error.status);
      if (error instanceof z.ZodError || error instanceof SyntaxError)
        return json({ error: "提交資料無效" }, 400);
      console.error("Volunteer booking failed", error);
      return json({ error: "暫時未能處理，請重試。" }, 500);
    }
  };
  return {
    get: (request: Request) =>
      run(async () => {
        const view = new URL(request.url).searchParams.get("view") ?? "sessions";
        if (view === "sessions") return json({ sessions: await deps.service.sessions() });
        if (view === "terms") return json({ terms: await deps.service.terms() });
        if (view === "me") return json(await deps.service.me(await deps.authenticate(request)));
        return json({ error: "查詢無效" }, 400);
      }),
    post: (request: Request) =>
      run(async () => {
        const actor = await deps.authenticate(request);
        const input = envelope.parse(await request.json());
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
  };
}
