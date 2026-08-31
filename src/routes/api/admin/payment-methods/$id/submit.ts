import { createFileRoute } from "@tanstack/react-router";

import { paymentMethodRouteHandlers } from "../-handlers";

export const Route = createFileRoute("/api/admin/payment-methods/$id/submit")({
  server: {
    handlers: {
      POST: ({ request, params }) => paymentMethodRouteHandlers.submit(request, params),
    },
  },
});
