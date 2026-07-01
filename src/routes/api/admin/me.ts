import { createFileRoute } from "@tanstack/react-router";

import {
  createSupabaseServiceClient,
  getAdminUserFromRequest,
} from "../../../lib/donations/supabase.server";

export const Route = createFileRoute("/api/admin/me")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const client = createSupabaseServiceClient();
          const admin = await getAdminUserFromRequest(request, client, {
            activatePendingInvite: true,
          });
          return Response.json({ admin }, { headers: { "cache-control": "no-store" } });
        } catch (error) {
          if (error instanceof Response) return error;
          console.error(error);
          return Response.json({ error: "Could not load admin identity" }, { status: 500 });
        }
      },
    },
  },
});
