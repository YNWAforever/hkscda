import { createFileRoute } from "@tanstack/react-router";
import { adoptionInstructionRouteHandlers } from "../-handlers";

export const Route = createFileRoute("/api/admin/adoption-instructions/revisions/$id")({
  server: {
    handlers: {
      GET: ({ request, params }) => adoptionInstructionRouteHandlers.revision(request, params.id),
    },
  },
});
