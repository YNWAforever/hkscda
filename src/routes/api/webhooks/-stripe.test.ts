import { describe, expect, test } from "bun:test";

import { isFullRefund, stripeWebhookAction } from "./stripe";

describe("Stripe webhook event routing", () => {
  test("reconciles synchronous and async-succeeded checkout sessions", () => {
    expect(stripeWebhookAction("checkout.session.completed")).toBe("reconcile");
    expect(stripeWebhookAction("checkout.session.async_payment_succeeded")).toBe("reconcile");
  });

  test("fails the donation when an async payment fails or the session expires", () => {
    expect(stripeWebhookAction("checkout.session.async_payment_failed")).toBe("fail");
    expect(stripeWebhookAction("checkout.session.expired")).toBe("fail");
  });

  test("treats refunded charges as refunds", () => {
    expect(stripeWebhookAction("charge.refunded")).toBe("refund");
  });

  test("ignores unrelated events", () => {
    expect(stripeWebhookAction("payment_intent.created")).toBe("ignore");
    expect(stripeWebhookAction("charge.dispute.created")).toBe("ignore");
  });
});

describe("Stripe refund classification", () => {
  test("only a fully-refunded charge counts as a full refund", () => {
    // charge.refunded is true only on full refund; partial refunds leave it
    // false (with amount_refunded > 0) and must not void the whole receipt.
    expect(isFullRefund({ refunded: true })).toBe(true);
    expect(isFullRefund({ refunded: false })).toBe(false);
  });
});
