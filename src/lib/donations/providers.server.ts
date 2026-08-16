import Stripe from "stripe";

import { createCodAlipayHkCheckout } from "./cod-provider.server";
import { getAppUrl, getPayPalConfig, getStripeConfig } from "./config.server";
import type { CheckoutProviderInput, CheckoutProviderResult } from "./service";

const purposeLabels: Record<string, string> = {
  general: "一般捐款 General donation",
  medical: "醫療基金 Medical fund",
  sponsor: "助養動物 Sponsor a pet",
};

export const stripeCheckoutPaymentMethodTypes: Stripe.Checkout.SessionCreateParams.PaymentMethodType[] =
  ["card"];

export async function createStripeCheckout(
  input: CheckoutProviderInput,
): Promise<CheckoutProviderResult> {
  const stripe = new Stripe(getStripeConfig().secretKey);
  const appUrl = getAppUrl();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: stripeCheckoutPaymentMethodTypes,
    customer_email: input.donorEmail,
    success_url: `${appUrl}/donate?status=success&donation=${input.donationId}`,
    cancel_url: `${appUrl}/donate?status=cancelled&donation=${input.donationId}`,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "hkd",
          unit_amount: input.amountCents,
          product_data: {
            name: purposeLabels[input.purpose] ?? "HKSCDA donation",
          },
        },
      },
    ],
    metadata: {
      donation_id: input.donationId,
      payment_id: input.paymentId,
      purpose: input.purpose,
    },
  });

  if (!session.url) throw new Error("Stripe did not return a Checkout URL");
  return { providerRef: session.id, url: session.url };
}

async function getPayPalAccessToken() {
  const config = getPayPalConfig();
  const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
  const response = await fetch(`${config.apiBase}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      authorization: `Basic ${credentials}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    throw new Error(`PayPal token request failed with ${response.status}`);
  }

  const data = (await response.json()) as { access_token: string };
  return data.access_token;
}

export async function createPayPalOrder(
  input: CheckoutProviderInput,
): Promise<CheckoutProviderResult> {
  const config = getPayPalConfig();
  const token = await getPayPalAccessToken();
  const response = await fetch(`${config.apiBase}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          custom_id: input.paymentId,
          invoice_id: input.donationId,
          description: purposeLabels[input.purpose] ?? "HKSCDA donation",
          amount: {
            currency_code: "HKD",
            value: (input.amountCents / 100).toFixed(2),
          },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            return_url: `${getAppUrl()}/donate?status=paypal-approved&donation=${input.donationId}`,
            cancel_url: `${getAppUrl()}/donate?status=cancelled&donation=${input.donationId}`,
          },
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`PayPal order request failed with ${response.status}`);
  }

  const data = (await response.json()) as { id: string; links?: { rel: string; href: string }[] };
  const approveLink = data.links?.find(
    (link) => link.rel === "payer-action" || link.rel === "approve",
  );
  if (!approveLink) throw new Error("PayPal did not return an approval URL");
  return { providerRef: data.id, url: approveLink.href };
}

export function assertPayPalCaptureCompleted(httpStatus: number, body: unknown) {
  const payload = body as {
    status?: string;
    details?: Array<{ issue?: string }>;
  };
  const issue = payload.details?.[0]?.issue;

  if (payload.status === "COMPLETED") return;
  if (httpStatus === 422 && issue === "ORDER_ALREADY_CAPTURED") return;

  throw new Error("PayPal capture did not complete");
}

export async function capturePayPalOrder(orderId: string) {
  const config = getPayPalConfig();
  const token = await getPayPalAccessToken();
  const response = await fetch(`${config.apiBase}/v2/checkout/orders/${orderId}/capture`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
  });
  const body = await response.json().catch(() => ({}));

  if (!response.ok && response.status !== 422) {
    throw new Error(`PayPal capture failed with ${response.status}`);
  }

  assertPayPalCaptureCompleted(response.status, body);
}

export async function verifyPayPalWebhook(request: Request, body: unknown) {
  const config = getPayPalConfig();
  if (!config.webhookId) throw new Error("Missing PAYPAL_WEBHOOK_ID");
  const token = await getPayPalAccessToken();
  const response = await fetch(`${config.apiBase}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      auth_algo: request.headers.get("paypal-auth-algo"),
      cert_url: request.headers.get("paypal-cert-url"),
      transmission_id: request.headers.get("paypal-transmission-id"),
      transmission_sig: request.headers.get("paypal-transmission-sig"),
      transmission_time: request.headers.get("paypal-transmission-time"),
      webhook_id: config.webhookId,
      webhook_event: body,
    }),
  });

  if (!response.ok) return false;
  const result = (await response.json()) as { verification_status?: string };
  return result.verification_status === "SUCCESS";
}

export function createPaymentProviders() {
  return {
    createStripeCheckout,
    createPayPalOrder,
    createCodAlipayHkCheckout,
  };
}
