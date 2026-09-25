import { createFileRoute } from "@tanstack/react-router";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  capturePayPalOrder,
  getPayPalCapture,
  verifyPayPalWebhook,
} from "../../../lib/donations/providers.server";
import {
  failProviderPayment,
  flagProviderWebhookForReview,
  processCaptureWebhook,
  reconcileProviderPayment,
  refundProviderPayment,
} from "../../../lib/donations/reconcile.server";
import { createSupabaseServiceClient } from "../../../lib/donations/supabase.server";
import { readPaymentWebhookBody } from "../../../lib/donations/webhookBody.server";
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
    links?: Array<{ rel: string; href: string }>;
    supplementary_data?: {
      related_ids?: {
        order_id?: string;
        capture_id?: string;
      };
    };
  };
};

type PayPalWebhookDependencies = {
  client: SupabaseClient;
  capturePayPalOrder?: typeof capturePayPalOrder;
  getPayPalCapture?: typeof getPayPalCapture;
  processCaptureWebhook?: typeof processCaptureWebhook;
  reconcileProviderPayment?: typeof reconcileProviderPayment;
  failProviderPayment?: typeof failProviderPayment;
  refundProviderPayment?: typeof refundProviderPayment;
  flagProviderWebhookForReview?: typeof flagProviderWebhookForReview;
};

// An approved checkout resource is the order itself. A capture or refund
// resource has a different id, so only use related_ids for those events.
export function getPayPalOrderId(event: PayPalWebhook) {
  return event.resource?.supplementary_data?.related_ids?.order_id ?? event.resource?.id;
}

export function getPayPalReconcileOrderId(event: PayPalWebhook) {
  return event.resource?.supplementary_data?.related_ids?.order_id;
}

export function shouldCapturePayPalEvent(eventType: string) {
  return eventType === "CHECKOUT.ORDER.APPROVED";
}

export function shouldReconcilePayPalEvent(eventType: string) {
  return eventType === "PAYMENT.CAPTURE.COMPLETED";
}

export function getPayPalRefundCaptureId(event: PayPalWebhook) {
  const relatedId = event.resource?.supplementary_data?.related_ids?.capture_id;
  if (relatedId) return relatedId;

  const upLink = event.resource?.links?.find((link) => link.rel === "up");
  if (!upLink) return undefined;
  try {
    const path = new URL(upLink.href).pathname;
    return /^\/v2\/payments\/captures\/([A-Za-z0-9-]+)$/.exec(path)?.[1];
  } catch {
    return undefined;
  }
}

export async function handleVerifiedPayPalWebhook(
  payload: PayPalWebhook,
  deps: PayPalWebhookDependencies,
) {
  const {
    client,
    capturePayPalOrder: captureOrder = capturePayPalOrder,
    getPayPalCapture: fetchCapture = getPayPalCapture,
    processCaptureWebhook: processCapture = processCaptureWebhook,
    reconcileProviderPayment: reconcile = reconcileProviderPayment,
    failProviderPayment: fail = failProviderPayment,
    refundProviderPayment: refund = refundProviderPayment,
    flagProviderWebhookForReview: review = flagProviderWebhookForReview,
  } = deps;

  if (shouldCapturePayPalEvent(payload.event_type)) {
    const orderId = getPayPalOrderId(payload);
    if (!orderId) return { received: true, skipped: "missing_order_id" };
    // Reserve the event before capturing, so a redelivery cannot capture twice.
    const result = await processCapture(
      {
        client,
        provider: "paypal",
        providerRef: orderId,
        providerEventId: payload.id,
        eventType: payload.event_type,
        payload,
      },
      () => captureOrder(orderId),
    );
    if (result.kind === "duplicate") return { received: true, skipped: "duplicate" };
    return { received: true };
  }

  if (shouldReconcilePayPalEvent(payload.event_type)) {
    const orderId = getPayPalReconcileOrderId(payload);
    const fallbackPaymentId = payload.resource?.custom_id;
    if (!orderId && !fallbackPaymentId) {
      await review(
        {
          client,
          provider: "paypal",
          providerRef: payload.resource?.id ?? "",
          providerEventId: payload.id,
          eventType: payload.event_type,
          payload,
        },
        {
          reason: "missing_completed_order_id",
          detail: { captureId: payload.resource?.id ?? null },
        },
      );
      return { received: true, skipped: "manual_review" };
    }
    const result = await reconcile({
      client,
      provider: "paypal",
      providerRef: orderId ?? "",
      fallbackPaymentId,
      providerEventId: payload.id,
      eventType: payload.event_type,
      payload,
    });
    if (result.kind === "not_found") return { received: true, skipped: "payment_not_found" };
    return { received: true };
  }

  if (payload.event_type === "PAYMENT.CAPTURE.DENIED") {
    const orderId = getPayPalReconcileOrderId(payload);
    const fallbackPaymentId = payload.resource?.custom_id;
    const args = {
      client,
      provider: "paypal" as const,
      providerRef: orderId ?? "",
      fallbackPaymentId,
      providerEventId: payload.id,
      eventType: payload.event_type,
      payload,
    };
    if (!orderId && !fallbackPaymentId) {
      await review(args, {
        reason: "missing_denied_order_id",
        detail: { captureId: payload.resource?.id },
      });
      return { received: true, skipped: "manual_review" };
    }
    await fail(args);
    return { received: true };
  }

  if (payload.event_type === "PAYMENT.CAPTURE.REFUNDED") {
    const captureId = getPayPalRefundCaptureId(payload);
    const baseArgs = {
      client,
      provider: "paypal" as const,
      providerEventId: payload.id,
      eventType: payload.event_type,
      payload,
    };
    if (!captureId) {
      await review(
        { ...baseArgs, providerRef: payload.resource?.id ?? "" },
        { reason: "missing_refund_capture_id", detail: { refundId: payload.resource?.id } },
      );
      return { received: true, skipped: "manual_review" };
    }

    const capture = await fetchCapture(captureId);
    const orderId = capture.supplementary_data?.related_ids?.order_id;
    const args = {
      ...baseArgs,
      providerRef: orderId ?? "",
      fallbackPaymentId: capture.custom_id,
    };
    if (!orderId && !capture.custom_id) {
      await review(args, { reason: "missing_refund_order_id", detail: { captureId } });
      return { received: true, skipped: "manual_review" };
    }
    if (capture.status === "PARTIALLY_REFUNDED") {
      await review(args, { reason: "partial_refund", detail: { captureId } });
      return { received: true, skipped: "manual_review" };
    }
    if (capture.status !== "REFUNDED") {
      // Provider state can lag the webhook. Retry until the capture is settled.
      throw new Error(`PayPal refund capture has unexpected status: ${capture.status}`);
    }
    await refund(args);
    return { received: true };
  }

  return { received: true };
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
          const body = await readPaymentWebhookBody(request);
          if (body === null) return new Response("PayPal webhook too large", { status: 413 });
          payload = JSON.parse(body) as PayPalWebhook;
        } catch {
          return new Response("Invalid PayPal webhook body", { status: 400 });
        }

        const verified = await verifyPayPalWebhook(request, payload);
        if (!verified) return new Response("Invalid PayPal webhook signature", { status: 400 });

        try {
          return Response.json(
            await handleVerifiedPayPalWebhook(payload, { client: createSupabaseServiceClient() }),
          );
        } catch (error) {
          console.error(error);
          return new Response("Webhook handler failed", { status: 500 });
        }
      },
    },
  },
});
