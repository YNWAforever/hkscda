import { createFileRoute } from "@tanstack/react-router";

import { createSupabaseServiceClient } from "../../../lib/supabase.server";
import {
  listMyRecords,
  requireVerifiedPrincipal,
  type AuthReader,
  type PortalRepository,
} from "../../../lib/supporters/portal.server";
import { createSupabasePortalRepository } from "../../../lib/supporters/portalRepository.server";

export function createPortalRecordsHandler(deps: {
  auth: AuthReader;
  repository: PortalRepository;
}) {
  return async ({ request }: { request: Request }): Promise<Response> => {
    const headers = { "cache-control": "no-store" };
    if (request.method !== "GET") {
      return Response.json({ error: "Method not allowed" }, { status: 405, headers });
    }
    try {
      const principal = await requireVerifiedPrincipal(request, deps.auth);
      const records = await listMyRecords(principal, deps.repository);
      return Response.json(records, { status: 200, headers });
    } catch (error) {
      if (error instanceof Response) {
        return Response.json({ error: "Access denied" }, { status: error.status, headers });
      }
      console.error("Supporter portal read failed");
      return Response.json({ error: "Records temporarily unavailable" }, { status: 503, headers });
    }
  };
}

function liveHandler() {
  const client = createSupabaseServiceClient();
  return createPortalRecordsHandler({
    auth: client.auth,
    repository: createSupabasePortalRepository(client),
  });
}

export const Route = createFileRoute("/api/supporter/records")({
  server: {
    handlers: {
      GET: async (context) => liveHandler()(context),
    },
  },
});
