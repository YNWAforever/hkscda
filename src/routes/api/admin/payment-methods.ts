import { createFileRoute } from "@tanstack/react-router";

import { paymentMethodRouteHandlers } from "./payment-methods/-handlers";

export const Route = createFileRoute("/api/admin/payment-methods")({
  server: {
    handlers: {
      GET: ({ request }) => paymentMethodRouteHandlers.list(request),
      POST: ({ request }) => paymentMethodRouteHandlers.create(request),
    },
  },
});
