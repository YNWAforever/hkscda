import { createFileRoute } from "@tanstack/react-router";

import { paymentMethodRouteHandlers } from "../-handlers";

export const Route = createFileRoute("/api/admin/payment-methods/$id/return-to-draft")({
  server: {
    handlers: {
      POST: ({ request, params }) => paymentMethodRouteHandlers.returnToDraft(request, params),
    },
  },
});
