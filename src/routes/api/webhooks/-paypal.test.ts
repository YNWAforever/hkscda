import { describe, expect, test } from "bun:test";

import { shouldCapturePayPalEvent, shouldReconcilePayPalEvent } from "./paypal";

describe("PayPal webhook event routing", () => {
  test("captures approved checkout orders without reconciling them as succeeded", () => {
    expect(shouldCapturePayPalEvent("CHECKOUT.ORDER.APPROVED")).toBe(true);
    expect(shouldReconcilePayPalEvent("CHECKOUT.ORDER.APPROVED")).toBe(false);
  });

  test("reconciles only completed capture webhooks", () => {
    expect(shouldReconcilePayPalEvent("PAYMENT.CAPTURE.COMPLETED")).toBe(true);
    expect(shouldReconcilePayPalEvent("PAYMENT.CAPTURE.DENIED")).toBe(false);
  });
});
