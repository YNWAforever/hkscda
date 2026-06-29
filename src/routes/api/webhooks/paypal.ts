import { createFileRoute } from "@tanstack/react-router";

import { capturePayPalOrder, verifyPayPalWebhook } from "../../../lib/donations/providers.server";
import {
  processCaptureWebhook,
  reconcileProviderPayment,
} from "../../../lib/donations/reconcile.server";
import { createSupabaseServiceClient } from "../../../lib/donations/supabase.server";
import {
  enforceRateLimit,
  getClientIp,
  retryAfterSeconds,
} from "../../../lib/security/rate-limit.server";

type PayPalWebhook = {
  id: string;
  event_type: string;
  resource?: {
    id?: string;
    custom_id?: string;
    supplementary_data?: {
      related_ids?: {
        order_id?: string;
      };
    };
  };
};

// For CHECKOUT.ORDER.APPROVED the resource IS the order, so resource.id is the
// order id.
export function getPayPalOrderId(event: PayPalWebhook) {
  return event.resource?.supplementary_data?.related_ids?.order_id ?? event.resource?.id;
}

// For PAYMENT.CAPTURE.COMPLETED the resource is a *capture*, whose `id` is the
// capture id — NOT the order id we stored as provider_ref. The order id is only
// reliable from related_ids; never fall back to resource.id here or we'd look up
// a payment by the wrong id.
export function getPayPalReconcileOrderId(event: PayPalWebhook) {
  return event.resource?.supplementary_data?.related_ids?.order_id;
}

export function shouldCapturePayPalEvent(eventType: string) {
  return eventType === "CHECKOUT.ORDER.APPROVED";
}

export function shouldReconcilePayPalEvent(eventType: string) {
  return eventType === "PAYMENT.CAPTURE.COMPLETED";
}

export const Route = createFileRoute("/api/webhooks/paypal")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const limit = await enforceRateLimit(getClientIp(request), {
          prefix: "wh-paypal",
          max: 100,
          window: "1 m",
        });
        if (!limit.ok) {
          return new Response("Too many requests", {
            status: 429,
            headers: { "retry-after": String(retryAfterSeconds(limit)) },
          });
        }

        let payload: PayPalWebhook;
        try {
          payload = (await request.json()) as PayPalWebhook;
        } catch {
          return new Response("Invalid PayPal webhook body", { status: 400 });
        }

        const verified = await verifyPayPalWebhook(request, payload);
        if (!verified) return new Response("Invalid PayPal webhook signature", { status: 400 });

        try {
          if (shouldCapturePayPalEvent(payload.event_type)) {
            const orderId = getPayPalOrderId(payload);
            if (!orderId) return Response.json({ received: true, skipped: "missing_order_id" });
            // Reserve the event before capturing so a redelivered approval is a
            // local duplicate rather than a second capture call.
            const captureResult = await processCaptureWebhook(
              {
                client: createSupabaseServiceClient(),
                provider: "paypal",
                providerRef: orderId,
                providerEventId: payload.id,
                eventType: payload.event_type,
                payload,
              },
              () => capturePayPalOrder(orderId),
            );
            if (captureResult.kind === "duplicate") {
              return Response.json({ received: true, skipped: "duplicate" });
            }
          }

          if (shouldReconcilePayPalEvent(payload.event_type)) {
            const orderId = getPayPalReconcileOrderId(payload);
            // custom_id carries our payment id (set on the order's purchase_unit)
            // and is the fallback when the capture payload lacks the order id.
            const fallbackPaymentId = payload.resource?.custom_id;
            if (!orderId && !fallbackPaymentId) {
              return Response.json({ received: true, skipped: "missing_order_id" });
            }

            const result = await reconcileProviderPayment({
              client: createSupabaseServiceClient(),
              provider: "paypal",
              providerRef: orderId ?? "",
              fallbackPaymentId,
              providerEventId: payload.id,
              eventType: payload.event_type,
              payload,
            });

            if (result.kind === "not_found") {
              // Acknowledge so PayPal stops retrying; the event verified but no
              // matching payment exists for this order.
              return Response.json({ received: true, skipped: "payment_not_found" });
            }
          }

          return Response.json({ received: true });
        } catch (error) {
          console.error(error);
          return new Response("Webhook handler failed", { status: 500 });
        }
      },
    },
  },
});
