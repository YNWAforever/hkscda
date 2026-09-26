import { describe, expect, test } from "bun:test";

import {
  assertPayPalCaptureCompleted,
  createPayPalOrder,
  stripeCheckoutPaymentMethodTypes,
} from "./providers.server";

test("keeps Stripe Checkout card-only", () => {
  expect(stripeCheckoutPaymentMethodTypes).toEqual(["card"]);
  expect(stripeCheckoutPaymentMethodTypes).not.toContain("alipay");
});

test("sends the stable payment id as PayPal-Request-Id when creating an order", async () => {
  const originalFetch = globalThis.fetch;
  const originalClientId = process.env.PAYPAL_CLIENT_ID;
  const originalClientSecret = process.env.PAYPAL_CLIENT_SECRET;
  const originalApiBase = process.env.PAYPAL_API_BASE;
  const requests: Array<{ url: string; headers: Headers }> = [];
  try {
    process.env.PAYPAL_CLIENT_ID = "test-client";
    process.env.PAYPAL_CLIENT_SECRET = "test-secret";
    process.env.PAYPAL_API_BASE = "https://paypal.test";
    globalThis.fetch = (async (input, init) => {
      const url = String(input);
      requests.push({ url, headers: new Headers(init?.headers) });
      if (url.endsWith("/v1/oauth2/token")) {
        return Response.json({ access_token: "test-access-token" });
      }
      return Response.json(
        { id: "ORDER-1", links: [{ rel: "payer-action", href: "https://paypal.test/approve" }] },
        { status: 201 },
      );
    }) as typeof fetch;

    const result = await createPayPalOrder({
      donationId: "donation-1",
      paymentId: "payment-1",
      amountCents: 30000,
      donorEmail: "donor@example.com",
      purpose: "medical",
      checkoutExperience: "desktop_qr",
    });

    expect(result.providerRef).toBe("ORDER-1");
    expect(requests[1]?.url).toBe("https://paypal.test/v2/checkout/orders");
    expect(requests[1]?.headers.get("PayPal-Request-Id")).toBe("payment-1");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalClientId === undefined) delete process.env.PAYPAL_CLIENT_ID;
    else process.env.PAYPAL_CLIENT_ID = originalClientId;
    if (originalClientSecret === undefined) delete process.env.PAYPAL_CLIENT_SECRET;
    else process.env.PAYPAL_CLIENT_SECRET = originalClientSecret;
    if (originalApiBase === undefined) delete process.env.PAYPAL_API_BASE;
    else process.env.PAYPAL_API_BASE = originalApiBase;
  }
});
test("rejects malformed PayPal order identity and approval URL", async () => {
  const originalFetch = globalThis.fetch;
  const originalClientId = process.env.PAYPAL_CLIENT_ID;
  const originalClientSecret = process.env.PAYPAL_CLIENT_SECRET;
  const originalApiBase = process.env.PAYPAL_API_BASE;
  let orderResponse: unknown;
  try {
    process.env.PAYPAL_CLIENT_ID = "test-client";
    process.env.PAYPAL_CLIENT_SECRET = "test-secret";
    process.env.PAYPAL_API_BASE = "https://paypal.test";
    globalThis.fetch = (async (input) => {
      if (String(input).endsWith("/v1/oauth2/token")) {
        return Response.json({ access_token: "test-access-token" });
      }
      return Response.json(orderResponse, { status: 201 });
    }) as typeof fetch;

    const input = {
      donationId: "donation-1",
      paymentId: "payment-1",
      amountCents: 30000,
      donorEmail: "donor@example.com",
      purpose: "medical" as const,
      checkoutExperience: "desktop_qr" as const,
    };

    orderResponse = {
      links: [{ rel: "payer-action", href: "https://paypal.test/approve" }],
    };
    await expect(createPayPalOrder(input)).rejects.toThrow("PayPal did not return an order ID");

    orderResponse = {
      id: "ORDER-1",
      links: [{ rel: "payer-action", href: "javascript:alert(1)" }],
    };
    await expect(createPayPalOrder(input)).rejects.toThrow(
      "PayPal did not return a secure approval URL",
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalClientId === undefined) delete process.env.PAYPAL_CLIENT_ID;
    else process.env.PAYPAL_CLIENT_ID = originalClientId;
    if (originalClientSecret === undefined) delete process.env.PAYPAL_CLIENT_SECRET;
    else process.env.PAYPAL_CLIENT_SECRET = originalClientSecret;
    if (originalApiBase === undefined) delete process.env.PAYPAL_API_BASE;
    else process.env.PAYPAL_API_BASE = originalApiBase;
  }
});

test("rejects malformed PayPal access tokens before creating an order", async () => {
  const originalFetch = globalThis.fetch;
  const originalClientId = process.env.PAYPAL_CLIENT_ID;
  const originalClientSecret = process.env.PAYPAL_CLIENT_SECRET;
  const originalApiBase = process.env.PAYPAL_API_BASE;
  try {
    process.env.PAYPAL_CLIENT_ID = "test-client";
    process.env.PAYPAL_CLIENT_SECRET = "test-secret";
    process.env.PAYPAL_API_BASE = "https://paypal.test";
    const input = {
      donationId: "donation-1",
      paymentId: "payment-1",
      amountCents: 30000,
      donorEmail: "donor@example.com",
      purpose: "medical" as const,
      checkoutExperience: "desktop_qr" as const,
    };
    for (const tokenBody of [{}, { access_token: " " }, null]) {
      let requests = 0;
      globalThis.fetch = (async () => {
        requests += 1;
        return requests === 1
          ? Response.json(tokenBody)
          : Response.json(
              { id: "ORDER-1", links: [{ rel: "approve", href: "https://paypal.test/approve" }] },
              { status: 201 },
            );
      }) as unknown as typeof fetch;

      await expect(createPayPalOrder(input)).rejects.toThrow(
        "PayPal did not return an access token",
      );
      expect(requests).toBe(1);
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (originalClientId === undefined) delete process.env.PAYPAL_CLIENT_ID;
    else process.env.PAYPAL_CLIENT_ID = originalClientId;
    if (originalClientSecret === undefined) delete process.env.PAYPAL_CLIENT_SECRET;
    else process.env.PAYPAL_CLIENT_SECRET = originalClientSecret;
    if (originalApiBase === undefined) delete process.env.PAYPAL_API_BASE;
    else process.env.PAYPAL_API_BASE = originalApiBase;
  }
});

describe("PayPal capture completion", () => {
  test("accepts completed capture responses", () => {
    expect(() =>
      assertPayPalCaptureCompleted(201, {
        id: "order-1",
        status: "COMPLETED",
      }),
    ).not.toThrow();
  });

  test("rejects declined captures even when PayPal responds with 422", () => {
    expect(() =>
      assertPayPalCaptureCompleted(422, {
        name: "UNPROCESSABLE_ENTITY",
        details: [{ issue: "INSTRUMENT_DECLINED" }],
      }),
    ).toThrow("PayPal capture did not complete");
  });
});
