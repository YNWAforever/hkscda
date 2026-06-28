import { describe, expect, test } from "bun:test";

import {
  getPayPalOrderId,
  getPayPalReconcileOrderId,
  shouldCapturePayPalEvent,
  shouldReconcilePayPalEvent,
} from "./paypal";

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

describe("PayPal order id extraction", () => {
  test("uses resource.id for an approved order event", () => {
    expect(
      getPayPalOrderId({
        id: "evt",
        event_type: "CHECKOUT.ORDER.APPROVED",
        resource: { id: "order-1" },
      }),
    ).toBe("order-1");
  });

  test("reconcile extraction only trusts related_ids.order_id, never the capture id", () => {
    // A capture event: resource.id is the CAPTURE id, the order id lives under
    // supplementary_data.related_ids.
    const capture = {
      id: "evt",
      event_type: "PAYMENT.CAPTURE.COMPLETED",
      resource: {
        id: "capture-1",
        supplementary_data: { related_ids: { order_id: "order-1" } },
      },
    };
    expect(getPayPalReconcileOrderId(capture)).toBe("order-1");
  });

  test("reconcile extraction returns undefined (never the capture id) when related_ids is absent", () => {
    const capture = {
      id: "evt",
      event_type: "PAYMENT.CAPTURE.COMPLETED",
      resource: { id: "capture-1" },
    };
    expect(getPayPalReconcileOrderId(capture)).toBeUndefined();
  });
});
