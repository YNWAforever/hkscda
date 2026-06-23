import { createFileRoute } from "@tanstack/react-router";
import Stripe from "stripe";

import { getStripeConfig } from "../../../lib/donations/config.server";
import { reconcileProviderPayment } from "../../../lib/donations/reconcile.server";
import { createSupabaseServiceClient } from "../../../lib/donations/supabase.server";

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

        if (event.type === "checkout.session.completed") {
          const session = event.data.object as Stripe.Checkout.Session;
          await reconcileProviderPayment({
            client: createSupabaseServiceClient(),
            provider: "stripe",
            providerRef: session.id,
            providerEventId: event.id,
            eventType: event.type,
            payload: event,
          });
        }

        return Response.json({ received: true });
      },
    },
  },
});
