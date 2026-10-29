import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  createSupabaseServiceClient,
  requireAdmin,
} from "../../../../lib/donations/supabase.server";
import { createAnimalAdminList } from "../../../../lib/animals/adminList.repository.server";
function jsonResponse(body: unknown, status: number) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

export const Route = createFileRoute("/api/admin/animals/list")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Without a wrapper a bad section or a failed read escaped as a thrown error and the
        // global middleware's HTML 500 page (BUG-15).
        try {
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
        } catch (error) {
          if (error instanceof Response) return error;
          if (
            error instanceof z.ZodError ||
            (error instanceof Error && error.message === "Invalid animal section")
          ) {
            return jsonResponse({ error: "Invalid animal list request" }, 400);
          }
          console.error(error);
          return jsonResponse({ error: "Could not load animals" }, 500);
        }
      },
    },
  },
});
