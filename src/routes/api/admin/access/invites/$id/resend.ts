import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "../../-handlers";

export const Route = createFileRoute("/api/admin/access/invites/$id/resend")({
  server: {
    handlers: {
      POST: ({ request, params }) => createHandlers().resendInvite({ request, params }),
    },
  },
});
