import { z } from "zod";
import { readAdminJson } from "../../http/adminJson.server";
import { RequestBodyTooLargeError } from "../../http/publicJson.server";
export const simulationCommandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list") }).strict(),
  z
    .object({
      action: z.literal("simulate"),
      template_key: z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/),
      draft_revision: z.number().int().positive(),
      activity_id: z.string().uuid(),
      profile_id: z.string().uuid(),
      role: z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/),
      simulation_time: z.string().datetime({ offset: true }),
    })
    .strict(),
]);
export type SimulationCommand = z.infer<typeof simulationCommandSchema>;
export function createSimulationHandlers(deps: {
  authenticate: (r: Request) => Promise<string>;
  execute: (actor: string, command: SimulationCommand) => Promise<Record<string, unknown>>;
}) {
  return {
    async POST(request: Request) {
      try {
        const actor = await deps.authenticate(request);
        let raw: unknown;
        try {
          raw = await readAdminJson(request);
        } catch (error) {
          if (error instanceof RequestBodyTooLargeError)
            return Response.json(
              { error: "Request body too large" },
              { status: 413, headers: { "cache-control": "no-store" } },
            );
          return Response.json({ error: "無效內容" }, { status: 400 });
        }
        const result = await deps.execute(actor, simulationCommandSchema.parse(raw));
        return Response.json(result, {
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
      } catch (error) {
        if (error instanceof Response) return error;
        if (error instanceof z.ZodError)
          return Response.json({ error: "請核對模擬欄位", issues: error.issues }, { status: 400 });
        if (typeof error === "object" && error && "code" in error && error.code === "42501")
          return Response.json({ error: "只限管理員" }, { status: 403 });
        console.error("Policy simulation failed", error);
        return Response.json({ error: "未能完成模擬" }, { status: 500 });
      }
    },
  };
}
