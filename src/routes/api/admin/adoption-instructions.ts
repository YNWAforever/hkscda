import { createFileRoute } from "@tanstack/react-router";

import { adoptionInstructionRouteHandlers } from "./adoption-instructions/-handlers";

export const Route = createFileRoute("/api/admin/adoption-instructions")({
  server: {
    handlers: {
      GET: ({ request }) => adoptionInstructionRouteHandlers.get(request),
    },
  },
});
