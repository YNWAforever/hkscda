import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  createSupabaseServiceClient,
  requireAdmin,
} from "../../../../lib/donations/supabase.server";
import { withErrors, jsonResponse } from "../../../../lib/sponsorshipAdmin/http.server";
export const Route = createFileRoute("/api/admin/sponsorships/animals")({
  server: {
    handlers: {
      GET: ({ request }) =>
        withErrors(async () => {
          const client = createSupabaseServiceClient();
          const actor = await requireAdmin(request, ["staff", "admin"], client);
          const q = z
            .string()
            .max(100)
            .parse(new URL(request.url).searchParams.get("q") ?? "");
          const { data, error } = await client.rpc("search_sponsorship_assignment_candidates", {
            p_actor: actor.authUserId,
            p_query: q,
          });
          if (error) throw error;
          return jsonResponse({ animals: data });
        }),
    },
  },
});
