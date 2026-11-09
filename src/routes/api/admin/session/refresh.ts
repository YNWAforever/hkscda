import { createFileRoute } from "@tanstack/react-router";

import { createLiveAdminSessionBff } from "../../../../lib/admin/sessionSupabase.server";

export const Route = createFileRoute("/api/admin/session/refresh")({
  server: {
    handlers: {
      POST: async ({ request }) => createLiveAdminSessionBff().refresh({ request }),
    },
  },
});
