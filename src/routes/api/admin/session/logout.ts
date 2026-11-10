import { createFileRoute } from "@tanstack/react-router";

import { createLiveAdminSessionBff } from "../../../../lib/admin/sessionSupabase.server";

export const Route = createFileRoute("/api/admin/session/logout")({
  server: {
    handlers: {
      POST: async ({ request }) => createLiveAdminSessionBff().logout({ request }),
    },
  },
});
