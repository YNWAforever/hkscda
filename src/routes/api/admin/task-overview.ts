import { createFileRoute } from "@tanstack/react-router";

import { requireAdmin } from "../../../lib/admin/session.server";
import { createSupabaseServiceClient } from "../../../lib/supabase.server";
import {
  createSupabaseTaskRepository,
  readTaskOverview,
  type TaskRepository,
} from "../../../lib/operations/taskOverview.server";
import type { AdminRole } from "../../../lib/admin/access";

export function createTaskOverviewHandler(deps: {
  authorize: (request: Request) => Promise<AdminRole>;
  repository: TaskRepository;
}) {
  return async (request: Request): Promise<Response> => {
    const headers = { "cache-control": "no-store" };
    if (request.method !== "GET") {
      return Response.json({ error: "Method not allowed" }, { status: 405, headers });
    }
    try {
      const role = await deps.authorize(request);
      const cards = await readTaskOverview(role, deps.repository);
      return Response.json({ cards }, { status: 200, headers });
    } catch (error) {
      if (error instanceof Response) {
        return Response.json({ error: "Access denied" }, { status: error.status, headers });
      }
      console.error("Admin task overview unavailable");
      return Response.json({ error: "Temporarily unavailable" }, { status: 503, headers });
    }
  };
}

function liveHandler(request: Request) {
  const client = createSupabaseServiceClient();
  return createTaskOverviewHandler({
    authorize: async (input) =>
      (await requireAdmin(input, ["staff", "treasurer", "admin"], client)).role,
    repository: createSupabaseTaskRepository(client),
  })(request);
}

export const Route = createFileRoute("/api/admin/task-overview")({
  server: { handlers: { GET: ({ request }) => liveHandler(request) } },
});
