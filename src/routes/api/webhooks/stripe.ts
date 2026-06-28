import { createFileRoute } from "@tanstack/react-router";
import Stripe from "stripe";

import { getStripeConfig } from "../../../lib/donations/config.server";
import {
  failProviderPayment,
  reconcileProviderPayment,
  refundProviderPayment,
} from "../../../lib/donations/reconcile.server";
import { createSupabaseServiceClient } from "../../../lib/donations/supabase.server";

export type StripeWebhookAction = "reconcile" | "fail" | "refund" | "ignore";

// Map a Stripe event type to how the donation lifecycle should react.
export function stripeWebhookAction(eventType: string): StripeWebhookAction {
  switch (eventType) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      return "reconcile";
    case "checkout.session.async_payment_failed":
    case "checkout.session.expired":
      return "fail";
    case "charge.refunded":
      return "refund";
    default:
      return "ignore";
  }
}

// Stripe sets charge.refunded = true only when the charge is FULLY refunded;
// a partial refund leaves it false (with amount_refunded > 0). We only reverse
// full refunds — a partial refund must not void the whole tax receipt or mark
// the entire donation refunded.
export function isFullRefund(charge: Pick<Stripe.Charge, "refunded">) {
  return charge.refunded === true;
}

// A refund event carries a charge, but payments are keyed by Checkout Session
// id. Resolve the session via the charge's payment intent.
async function resolveChargeSessionId(
  stripe: Stripe,
  charge: Stripe.Charge,
): Promise<string | null> {
  const paymentIntentId =
    typeof charge.payment_intent === "string"
      ? charge.payment_intent
      : (charge.payment_intent?.id ?? null);
  if (!paymentIntentId) return null;

  const sessions = await stripe.checkout.sessions.list({
    payment_intent: paymentIntentId,
    limit: 1,
  });
  return sessions.data[0]?.id ?? null;
}

export const Route = createFileRoute("/api/webhooks/stripe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const signature = request.headers.get("stripe-signature");
        if (!signature) return new Response("Missing Stripe signature", { status: 400 });

        const stripe = new Stripe(getStripeConfig().secretKey);
        const body = await request.text();
        let event: Stripe.Event;

        try {
          event = stripe.webhooks.constructEvent(body, signature, getStripeConfig().webhookSecret);
        } catch (error) {
          console.error(error);
          return new Response("Invalid Stripe signature", { status: 400 });
        }

        const action = stripeWebhookAction(event.type);
        if (action === "ignore") return Response.json({ received: true });

        try {
          const base = {
            client: createSupabaseServiceClient(),
            provider: "stripe" as const,
            providerEventId: event.id,
            eventType: event.type,
            payload: event,
          };

          if (action === "reconcile") {
            const session = event.data.object as Stripe.Checkout.Session;
            // Async payment methods (e.g. Alipay) emit checkout.session.completed
            // before funds settle. Only credit the gift and issue a tax receipt
            // once Stripe reports the money as actually paid.
            if (session.payment_status !== "paid") {
              return Response.json({ received: true, skipped: "payment_not_paid" });
            }
            await reconcileProviderPayment({
              ...base,
              providerRef: session.id,
              fallbackPaymentId: session.metadata?.payment_id ?? undefined,
            });
            return Response.json({ received: true });
          }

          if (action === "fail") {
            const session = event.data.object as Stripe.Checkout.Session;
            await failProviderPayment({
              ...base,
              providerRef: session.id,
              fallbackPaymentId: session.metadata?.payment_id ?? undefined,
            });
            return Response.json({ received: true });
          }

          // action === "refund"
          const charge = event.data.object as Stripe.Charge;
          if (!isFullRefund(charge)) {
            // Partial refund: leave the donation credited and the receipt valid.
            return Response.json({ received: true, skipped: "partial_refund" });
          }
          const sessionId = await resolveChargeSessionId(stripe, charge);
          if (!sessionId) return Response.json({ received: true, skipped: "session_not_found" });
          await refundProviderPayment({ ...base, providerRef: sessionId });
          return Response.json({ received: true });
        } catch (error) {
          console.error(error);
          return new Response("Webhook handler failed", { status: 500 });
        }
      },
    },
  },
});
