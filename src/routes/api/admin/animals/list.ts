import { createFileRoute } from "@tanstack/react-router";
import {
  createSupabaseServiceClient,
  requireAdmin,
} from "../../../../lib/donations/supabase.server";
import { createAnimalAdminList } from "../../../../lib/animals/adminList.repository.server";
export const Route = createFileRoute("/api/admin/animals/list")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const client = createSupabaseServiceClient();
        await requireAdmin(request, ["staff", "admin"], client);
        const params = new URL(request.url).searchParams;
        return Response.json(
          await createAnimalAdminList(client)(
            Object.fromEntries(params),
            params.get("missingPhoto") === "true",
          ),
          { headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});
