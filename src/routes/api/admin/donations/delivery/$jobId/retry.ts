import { createFileRoute } from "@tanstack/react-router";
import { createManualGiftDeliveryComposition } from "../../../../../../lib/crm/manualGiftDelivery.composition.server";

export const Route = createFileRoute("/api/admin/donations/delivery/$jobId/retry")({
  server: {
    handlers: {
      POST: ({ request, params }) =>
        createManualGiftDeliveryComposition().retry(request, params.jobId),
    },
  },
});
