import { createFileRoute } from "@tanstack/react-router";

import { paymentMethodRouteHandlers } from "../-handlers";

export const Route = createFileRoute("/api/admin/payment-methods/$id/withdraw")({
  server: {
    handlers: {
      POST: ({ request, params }) => paymentMethodRouteHandlers.withdraw(request, params),
    },
  },
});
