import { createFileRoute } from "@tanstack/react-router";

import { paymentMethodRouteHandlers } from "./-handlers";

export const Route = createFileRoute("/api/admin/payment-methods/$id")({
  server: {
    handlers: {
      GET: ({ request, params }) => paymentMethodRouteHandlers.get(request, params),
      PATCH: ({ request, params }) => paymentMethodRouteHandlers.update(request, params),
    },
  },
});
