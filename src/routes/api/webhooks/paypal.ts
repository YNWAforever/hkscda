import { createFileRoute } from "@tanstack/react-router";

import { capturePayPalOrder, verifyPayPalWebhook } from "../../../lib/donations/providers.server";
import { reconcileProviderPayment } from "../../../lib/donations/reconcile.server";
import { createSupabaseServiceClient } from "../../../lib/donations/supabase.server";

type PayPalWebhook = {
  id: string;
  event_type: string;
  resource?: {
    id?: string;
    supplementary_data?: {
      related_ids?: {
        order_id?: string;
      };
    };
  };
};

function getPayPalOrderId(event: PayPalWebhook) {
  return event.resource?.supplementary_data?.related_ids?.order_id ?? event.resource?.id;
}

export const Route = createFileRoute("/api/webhooks/paypal")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const payload = (await request.json()) as PayPalWebhook;
        const verified = await verifyPayPalWebhook(request, payload);
        if (!verified) return new Response("Invalid PayPal webhook signature", { status: 400 });

        const orderId = getPayPalOrderId(payload);
        if (!orderId) return Response.json({ received: true, skipped: "missing_order_id" });

        if (payload.event_type === "CHECKOUT.ORDER.APPROVED") {
          await capturePayPalOrder(orderId);
        }

        if (
          payload.event_type === "CHECKOUT.ORDER.APPROVED" ||
          payload.event_type === "PAYMENT.CAPTURE.COMPLETED"
        ) {
          await reconcileProviderPayment({
            client: createSupabaseServiceClient(),
            provider: "paypal",
            providerRef: orderId,
            providerEventId: payload.id,
            eventType: payload.event_type,
            payload,
          });
        }

        return Response.json({ received: true });
      },
    },
  },
});
