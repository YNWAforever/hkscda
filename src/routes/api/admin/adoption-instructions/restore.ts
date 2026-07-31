import { createFileRoute } from "@tanstack/react-router";

import { adoptionInstructionRouteHandlers } from "./-handlers";

export const Route = createFileRoute("/api/admin/adoption-instructions/restore")({
  server: { handlers: { POST: ({ request }) => adoptionInstructionRouteHandlers.restore(request) } },
});
