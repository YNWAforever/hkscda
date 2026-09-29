import { createFileRoute } from "@tanstack/react-router";
import { adoptionInstructionRouteHandlers } from "./-handlers";

export const Route = createFileRoute("/api/admin/adoption-instructions/history")({
  server: {
    handlers: {
      GET: ({ request }) => adoptionInstructionRouteHandlers.history(request),
    },
  },
});
