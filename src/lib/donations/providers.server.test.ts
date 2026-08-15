import { describe, expect, test } from "bun:test";

import { assertPayPalCaptureCompleted, stripeCheckoutPaymentMethodTypes } from "./providers.server";

test("keeps Stripe Checkout card-only", () => {
  expect(stripeCheckoutPaymentMethodTypes).toEqual(["card"]);
  expect(stripeCheckoutPaymentMethodTypes).not.toContain("alipay");
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
