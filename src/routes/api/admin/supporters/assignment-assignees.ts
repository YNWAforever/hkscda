import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import {
  createSupabaseServiceClient,
  requireAdmin,
} from "../../../../lib/donations/supabase.server";

const assigneeSchema = z.object({
  authUserId: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(["treasurer", "admin"]),
});
export type CrmAssignmentAssignee = z.infer<typeof assigneeSchema>;

export function createCrmAssignmentAssigneesHandler(deps: {
  authorize: (request: Request) => Promise<string>;
  list: (actor: string) => Promise<CrmAssignmentAssignee[]>;
}) {
  return async (request: Request): Promise<Response> => {
    const headers = { "cache-control": "no-store" };
    if (request.method !== "GET")
      return Response.json({ error: "Method not allowed" }, { status: 405, headers });
    try {
      const actor = await deps.authorize(request);
      return Response.json(
        { assignees: z.array(assigneeSchema).parse(await deps.list(actor)) },
        { headers },
      );
    } catch (error) {
      if (error instanceof Response)
        return Response.json({ error: "Access denied" }, { status: error.status, headers });
      const code = error && typeof error === "object" && "code" in error ? error.code : null;
      if (code === "42501")
        return Response.json({ error: "Access denied" }, { status: 403, headers });
      console.error("CRM assignment assignees unavailable");
      return Response.json(
        { error: "Assignees temporarily unavailable" },
        { status: 503, headers },
      );
    }
  };
}

export const Route = createFileRoute("/api/admin/supporters/assignment-assignees")({
  server: {
    handlers: {
      GET: ({ request }) => {
        const client = createSupabaseServiceClient();
        return createCrmAssignmentAssigneesHandler({
          authorize: async (incoming) =>
            (await requireAdmin(incoming, ["treasurer", "admin"], client)).authUserId,
          list: async (actor) => {
            const { data, error } = await client.rpc("list_crm_assignment_assignees", {
              p_actor: actor,
            });
            if (error) throw error;
            return z.array(assigneeSchema).parse(data);
          },
        })(request);
      },
    },
  },
});
