import { createFileRoute } from "@tanstack/react-router";

import { adoptionInstructionRouteHandlers } from "./-handlers";

export const Route = createFileRoute("/api/admin/adoption-instructions/draft")({
  server: {
    handlers: {
      POST: ({ request }) => adoptionInstructionRouteHandlers.ensureDraft(request),
      DELETE: ({ request }) => adoptionInstructionRouteHandlers.archiveDraft(request),
      PUT: ({ request }) => adoptionInstructionRouteHandlers.updateDraft(request),
    },
  },
});
