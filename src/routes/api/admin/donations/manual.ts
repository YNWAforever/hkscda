import { createFileRoute } from "@tanstack/react-router";
import { createManualGiftDeliveryComposition } from "../../../../lib/crm/manualGiftDelivery.composition.server";

export const Route = createFileRoute("/api/admin/donations/manual")({
  server: {
    handlers: { POST: ({ request }) => createManualGiftDeliveryComposition().create(request) },
  },
});
