import { createFileRoute } from "@tanstack/react-router";

import { paymentMethodRouteHandlers } from "../-handlers";

export const Route = createFileRoute("/api/admin/payment-methods/$id/publish")({
  server: {
    handlers: {
      POST: ({ request, params }) => paymentMethodRouteHandlers.publish(request, params),
    },
  },
});
