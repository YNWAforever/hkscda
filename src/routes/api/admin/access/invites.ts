import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "./-handlers";

export const Route = createFileRoute("/api/admin/access/invites")({
  server: {
    handlers: {
      POST: ({ request }) => createHandlers().inviteUser({ request }),
    },
  },
});
